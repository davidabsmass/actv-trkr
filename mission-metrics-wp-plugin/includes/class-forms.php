<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Form discovery and background reconciliation for known form plugins.
 * Supports: Gravity Forms, Contact Form 7, WPForms, Avada/Fusion Forms, Ninja Forms, Fluent Forms.
 * Live submission hooks are intentionally disabled to keep client requests untouched.
 */
class MM_Forms {

	/** @var string|null Last Avada discovery strategy used (for diagnostics). */
	private static $last_avada_strategy = null;

	public static function init() {
		$opts = MM_Settings::get();

		// Register REST API route for dashboard-triggered sync
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );

		// NOTE: Auto-sync on settings page load was removed in v1.16.5.
		// It performed blocking wp_remote_post calls (timeout up to 120s)
		// during render, causing the settings page to spin/hang on slow
		// hosts. Sync now runs ONLY via:
		//   1. The hourly mm_form_probe_cron / scheduled jobs.
		//   2. The manual "Sync Forms" button on the settings page (AJAX).

		if ( $opts['enable_gravity'] !== '1' || empty( $opts['api_key'] ) ) return;

		// Safety-first: never attach to live form submissions.
		// Forms are reconciled through background sync/backfill only so client requests stay untouched.
	}

	// ── REST API ───────────────────────────────────────────────────

	/**
	 * Verify the request via HMAC signature (preferred) or legacy key hash
	 * (accepted during the v1.18.x rollout window).
	 *
	 * SECURITY (C-2):
	 *   The legacy `key_hash` body field is the SHA-256 of the API key
	 *   stored in `api_keys.key_hash` server-side. Accepting it as a
	 *   credential means anyone with read access to that column could
	 *   impersonate the backend. v1.18.x logs every legacy hit so we can
	 *   measure adoption before flipping to signed-only in v1.19.0.
	 */
	public static function verify_key_hash( $request ) {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) {
			return new \WP_Error( 'not_configured', 'Plugin not configured', array( 'status' => 400 ) );
		}

		// Rate limit: max 10 requests per IP per minute
		$ip = self::get_client_ip_for_rate_limit();
		$transient_key = 'mm_rest_rl_' . md5( $ip );
		$hits = (int) get_transient( $transient_key );
		if ( $hits >= 10 ) {
			return new \WP_Error( 'rate_limited', 'Too many requests', array( 'status' => 429 ) );
		}
		set_transient( $transient_key, $hits + 1, 60 );

		// 1. Try the signed-request path (v1.18.x preferred).
		if ( class_exists( 'MM_Hmac' ) ) {
			$signed = MM_Hmac::verify( $request );
			if ( $signed === true ) {
				return true;
			}
			if ( is_wp_error( $signed ) ) {
				// Signature was attempted but invalid — refuse.
				return $signed;
			}
			// $signed === null → no signature attempted; fall through to legacy.
		}

		// 2. Legacy key_hash body field (deprecated; will be removed in v1.19.0).
		$body     = $request->get_json_params();
		$key_hash = is_array( $body ) && isset( $body['key_hash'] ) ? (string) $body['key_hash'] : '';
		$stored_hash = hash( 'sha256', $opts['api_key'] );

		if ( ! $key_hash || ! hash_equals( $stored_hash, $key_hash ) ) {
			return new \WP_Error( 'forbidden', 'Invalid key', array( 'status' => 403 ) );
		}

		// Telemetry: legacy auth used. Helps decide when to flip the switch.
		if ( class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::warn( 'core', 'legacy_hash_auth_used', array(
				'route' => $request->get_route(),
			) );
		}
		return true;
	}

	/**
	 * Get client IP for rate limiting.
	 */
	private static function get_client_ip_for_rate_limit() {
		$headers = array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR' );
		foreach ( $headers as $h ) {
			if ( ! empty( $_SERVER[ $h ] ) ) {
				$ip = explode( ',', $_SERVER[ $h ] );
				return sanitize_text_field( trim( $ip[0] ) );
			}
		}
		return '0.0.0.0';
	}

	/**
	 * Register REST route so the dashboard can trigger a sync remotely.
	 */
	public static function register_rest_routes() {
		register_rest_route( 'actv-trkr/v1', '/sync', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_rest_sync' ),
			'permission_callback' => array( __CLASS__, 'verify_key_hash' ),
		) );

		register_rest_route( 'actv-trkr/v1', '/backfill-avada', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_rest_backfill_avada' ),
			'permission_callback' => array( __CLASS__, 'verify_key_hash' ),
		) );

		register_rest_route( 'actv-trkr/v1', '/backfill-entries', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_rest_backfill_entries' ),
			'permission_callback' => array( __CLASS__, 'verify_key_hash' ),
		) );

		// H-3 (Phase 0): /avada-debug returns table contents and resolution
		// diagnostics. Gated behind the `enable_diagnostics` setting (off by
		// default) so it cannot be probed in production unless an operator
		// explicitly enables it for a support session.
		$diag_opts = MM_Settings::get();
		if ( ! empty( $diag_opts['enable_diagnostics'] ) && '0' !== (string) $diag_opts['enable_diagnostics'] ) {
			register_rest_route( 'actv-trkr/v1', '/avada-debug', array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_rest_avada_debug' ),
				'permission_callback' => array( __CLASS__, 'verify_key_hash' ),
			) );
		}
	}

	/**
	 * Handle the REST sync request from the dashboard.
	 * Auth already verified by permission_callback.
	 */
	public static function handle_rest_sync( $request ) {
		$body = $request->get_json_params();
		$known_form_mappings = is_array( $body['known_form_mappings'] ?? null ) ? $body['known_form_mappings'] : array();

		// Respond IMMEDIATELY with 202 Accepted so the dashboard never times out
		// on slow hosts. The actual scan runs after the response is flushed.
		$response = new \WP_REST_Response( array(
			'ok'       => true,
			'queued'   => true,
			'message'  => 'Sync accepted; running in background',
		), 202 );

		// Schedule deferred work to run after the HTTP response is sent.
		add_action( 'shutdown', function () use ( $known_form_mappings ) {
			// Flush response to client first if FastCGI is available.
			if ( function_exists( 'fastcgi_finish_request' ) ) {
				@fastcgi_finish_request();
			} elseif ( function_exists( 'litespeed_finish_request' ) ) {
				@litespeed_finish_request();
			}

			// Lift PHP limits for the background scan since we no longer block the client.
			@set_time_limit( 300 );
			@ignore_user_abort( true );

			try {
				self::scan_all_forms( $known_form_mappings );
			} catch ( \Throwable $e ) {
				error_log( '[ACTV TRKR] Background sync error: ' . $e->getMessage() );
			}
		}, 1 );

		return $response;
	}

	// ── Form Discovery / Sync ───────────────────────────────────────

	/**
	 * Auto-sync forms if the cooldown has expired (every 6 hours).
	 * Wrapped in try/catch so it NEVER crashes the WordPress admin.
	 */
	public static function maybe_auto_sync() {
		if ( get_transient( 'actv_trkr_last_form_sync' ) ) return;
		try {
			self::scan_all_forms( array(), /* $lightweight */ true );
		} catch ( \Throwable $e ) {
			error_log( '[ACTV TRKR] Auto-sync error (safe catch): ' . $e->getMessage() );
		}
		set_transient( 'actv_trkr_last_form_sync', time(), 6 * HOUR_IN_SECONDS );
	}

	/**
	 * Scan all supported form plugins and return discovered forms.
	 */
	public static function scan_all_forms( $known_form_mappings = array(), $lightweight = false ) {
		$discovered = array();

		// Gravity Forms
		if ( class_exists( 'GFAPI' ) ) {
			$gf_forms = \GFAPI::get_forms();
			if ( is_array( $gf_forms ) ) {
				foreach ( $gf_forms as $form ) {
					$discovered[] = array(
						'form_id'    => (string) ( $form['id'] ?? '' ),
						'form_title' => $form['title'] ?? 'Gravity Form',
						'provider'   => 'gravity_forms',
					);
				}
			}
		}

		// Contact Form 7
		if ( class_exists( 'WPCF7_ContactForm' ) ) {
			$cf7_forms = \WPCF7_ContactForm::find();
			if ( is_array( $cf7_forms ) ) {
				foreach ( $cf7_forms as $form ) {
					$discovered[] = array(
						'form_id'    => (string) $form->id(),
						'form_title' => $form->title(),
						'provider'   => 'cf7',
					);
				}
			}
		}

		// WPForms
		if ( function_exists( 'wpforms' ) && isset( wpforms()->form ) ) {
			$wp_forms = wpforms()->form->get( '', array( 'posts_per_page' => -1 ) );
			if ( is_array( $wp_forms ) ) {
				foreach ( $wp_forms as $form ) {
					$discovered[] = array(
						'form_id'    => (string) $form->ID,
						'form_title' => $form->post_title ?: 'WPForm',
						'provider'   => 'wpforms',
					);
				}
			}
		}

		// Ninja Forms
		if ( function_exists( 'Ninja_Forms' ) ) {
			try {
				$nf_forms = Ninja_Forms()->form()->get_forms();
				if ( is_array( $nf_forms ) ) {
					foreach ( $nf_forms as $form ) {
						$discovered[] = array(
							'form_id'    => (string) $form->get_id(),
							'form_title' => $form->get_setting( 'title' ) ?: 'Ninja Form',
							'provider'   => 'ninja_forms',
						);
					}
				}
			} catch ( \Exception $e ) {
				error_log( '[MissionMetrics] Ninja Forms scan error: ' . $e->getMessage() );
			}
		}

		// Fluent Forms
		if ( function_exists( 'wpFluent' ) ) {
			try {
				$ff_forms = wpFluent()->table( 'fluentform_forms' )->get();
				if ( is_array( $ff_forms ) || $ff_forms instanceof \Traversable ) {
					foreach ( $ff_forms as $form ) {
						$discovered[] = array(
							'form_id'    => (string) ( $form->id ?? '' ),
							'form_title' => $form->title ?? 'Fluent Form',
							'provider'   => 'fluent_forms',
						);
					}
				}
			} catch ( \Exception $e ) {
				error_log( '[MissionMetrics] Fluent Forms scan error: ' . $e->getMessage() );
			}
		}

		// Avada / Fusion Forms
		$avada_forms = get_posts( array(
			'post_type'      => 'fusion_form',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );
		if ( is_array( $avada_forms ) && ! empty( $avada_forms ) ) {
			foreach ( $avada_forms as $form_post_id ) {
				$title = get_the_title( $form_post_id ) ?: 'Avada Form';
				$discovered[] = array(
					'form_id'    => (string) $form_post_id,
					'form_title' => $title,
					'provider'   => 'avada',
				);
			}
		}

		if ( empty( $discovered ) ) {
			return array( 'synced' => 0, 'discovered' => 0, 'plugin_version' => MM_PLUGIN_VERSION );
		}

		// Discover page URLs for each form by scanning post content
		$discovered = self::enrich_with_page_urls( $discovered, $known_form_mappings, $lightweight );

		// Send to sync-forms endpoint
		$opts     = MM_Settings::get();
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/sync-forms';
		$domain   = wp_parse_url( home_url(), PHP_URL_HOST );

		$response = wp_remote_post( $endpoint, array(
			'timeout'  => 15,
			'headers'  => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( array(
				'forms'  => $discovered,
				'domain' => $domain,
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			error_log( '[MissionMetrics] Form sync error: ' . $response->get_error_message() );
			return array( 'synced' => 0, 'discovered' => count( $discovered ), 'error' => $response->get_error_message(), 'plugin_version' => MM_PLUGIN_VERSION );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		// Sync entry IDs to detect deletions
		$entry_result = self::sync_entry_ids( $discovered, $domain, $opts );

		return array(
			'synced'            => $body['synced'] ?? 0,
			'discovered'        => count( $discovered ),
			'trashed'           => $entry_result['trashed'] ?? 0,
			'restored'          => $entry_result['restored'] ?? 0,
			'warnings'          => $entry_result['warnings'] ?? array(),
			'avada_diagnostics' => $entry_result['avada_diagnostics'] ?? array(),
			'plugin_version'    => MM_PLUGIN_VERSION,
		);
	}

	/**
	 * For each discovered form, gather active entry IDs and send them
	 * to the sync-entries endpoint so deleted entries get trashed.
	 */
	public static function sync_entry_ids( $discovered = null, $domain = null, $opts = null ) {
		if ( ! $opts ) $opts = self::get();
		if ( ! $domain ) $domain = wp_parse_url( home_url(), PHP_URL_HOST );
		if ( ! $discovered ) $discovered = self::discover_forms_list();

		$forms_with_entries = array();
		$avada_diagnostics = array();

		foreach ( $discovered as $form_info ) {
			$provider = $form_info['provider'] ?? '';
			$form_id  = $form_info['form_id'] ?? '';
			if ( ! $form_id ) continue;

			$entry_ids = self::get_active_entry_ids( $provider, $form_id, $form_info['page_url'] ?? null, $form_info['form_title'] ?? null, $form_info['page_url_candidates'] ?? array() );
			if ( $entry_ids === null ) continue;

			// Collect Avada per-form diagnostics
			if ( $provider === 'avada' ) {
				$diag = array(
					'form_id'   => $form_id,
					'count'     => 0,
					'strategy'  => 'none',
				);

				if ( is_array( $entry_ids ) && ! empty( $entry_ids ) && is_array( $entry_ids[0] ) ) {
					$diag['count'] = count( $entry_ids );
					$diag['strategy'] = self::$last_avada_strategy ?? 'unknown';
				} elseif ( is_array( $entry_ids ) ) {
					$diag['count'] = count( $entry_ids );
					$diag['strategy'] = self::$last_avada_strategy ?? 'unknown';
				}
				$avada_diagnostics[] = $diag;
			}

			// Avada returns array of {id, ts} objects; others return plain string arrays
			if ( $provider === 'avada' && ! empty( $entry_ids ) && is_array( $entry_ids[0] ) ) {
				$ids = array_map( function( $e ) { return $e['id']; }, $entry_ids );
				$timestamps = array();
				foreach ( $entry_ids as $e ) {
					$timestamps[ $e['id'] ] = $e['ts'];
				}
				$forms_with_entries[] = array(
					'form_id'          => $form_id,
					'provider'         => $provider,
					'entry_ids'        => $ids,
					'entry_timestamps' => $timestamps,
				);
			} else {
				$forms_with_entries[] = array(
					'form_id'   => $form_id,
					'provider'  => $provider,
					'entry_ids' => $entry_ids,
				);
			}
		}

		if ( empty( $forms_with_entries ) ) return array( 'trashed' => 0, 'restored' => 0, 'warnings' => array(), 'avada_diagnostics' => $avada_diagnostics );

		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/sync-entries';

		$response = wp_remote_post( $endpoint, array(
			'timeout'  => 120,
			'headers'  => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( array(
				'domain' => $domain,
				'forms'  => $forms_with_entries,
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			error_log( '[MissionMetrics] Entry sync error: ' . $response->get_error_message() );
			return array( 'trashed' => 0, 'restored' => 0, 'error' => $response->get_error_message(), 'warnings' => array(), 'avada_diagnostics' => $avada_diagnostics );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		return array(
			'trashed'           => $body['trashed'] ?? 0,
			'restored'          => $body['restored'] ?? 0,
			'warnings'          => $body['warnings'] ?? array(),
			'avada_diagnostics' => $avada_diagnostics,
		);
	}

	/**
	 * Helper: returns discovered forms list without sending to server.
	 */
	private static function discover_forms_list() {
		$discovered = array();
		if ( class_exists( 'GFAPI' ) ) {
			$gf_forms = \GFAPI::get_forms();
			if ( is_array( $gf_forms ) ) {
				foreach ( $gf_forms as $form ) {
					$discovered[] = array( 'form_id' => (string) ( $form['id'] ?? '' ), 'provider' => 'gravity_forms' );
				}
			}
		}
		if ( function_exists( 'wpforms' ) && isset( wpforms()->form ) ) {
			$wp_forms = wpforms()->form->get( '', array( 'posts_per_page' => -1 ) );
			if ( is_array( $wp_forms ) ) {
				foreach ( $wp_forms as $form ) {
					$discovered[] = array( 'form_id' => (string) $form->ID, 'provider' => 'wpforms' );
				}
			}
		}
		// Avada / Fusion Forms
		$avada_forms = get_posts( array(
			'post_type'      => 'fusion_form',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );
		if ( is_array( $avada_forms ) && ! empty( $avada_forms ) ) {
			foreach ( $avada_forms as $form_post_id ) {
				$title = get_the_title( $form_post_id ) ?: 'Avada Form';
				$discovered[] = array( 'form_id' => (string) $form_post_id, 'provider' => 'avada', 'form_title' => $title );
			}
		}
		// Ninja Forms
		if ( function_exists( 'Ninja_Forms' ) ) {
			try {
				$nf_forms = Ninja_Forms()->form()->get_forms();
				if ( is_array( $nf_forms ) ) {
					foreach ( $nf_forms as $form ) {
						$discovered[] = array( 'form_id' => (string) $form->get_id(), 'provider' => 'ninja_forms' );
					}
				}
			} catch ( \Exception $e ) {}
		}
		// Fluent Forms
		if ( function_exists( 'wpFluent' ) ) {
			try {
				$ff_forms = wpFluent()->table( 'fluentform_forms' )->get();
				if ( is_array( $ff_forms ) || $ff_forms instanceof \Traversable ) {
					foreach ( $ff_forms as $form ) {
						$discovered[] = array( 'form_id' => (string) ( $form->id ?? '' ), 'provider' => 'fluent_forms' );
					}
				}
			} catch ( \Exception $e ) {}
		}
		// CF7
		if ( class_exists( 'WPCF7_ContactForm' ) ) {
			$cf7_forms = \WPCF7_ContactForm::find();
			if ( is_array( $cf7_forms ) ) {
				foreach ( $cf7_forms as $form ) {
					$discovered[] = array( 'form_id' => (string) $form->id(), 'provider' => 'cf7' );
				}
			}
		}
		return $discovered;
	}

	/**
	 * Get active (non-trashed) entry IDs for a given form provider + form ID.
	 * Returns null if the provider doesn't support entry listing.
	 */
	private static function get_active_entry_ids( $provider, $form_id, $page_url = null, $form_title = null, $page_url_candidates = array() ) {
		global $wpdb;

		switch ( $provider ) {
		case 'gravity_forms':
			if ( ! class_exists( 'GFAPI' ) ) return null;
				$search = array( 'status' => 'active' );
				$all_ids = array();
				$page_size = 500;
				$offset = 0;
				while ( true ) {
					$entries = \GFAPI::get_entries( $form_id, $search, null, array( 'offset' => $offset, 'page_size' => $page_size ) );
					if ( ! is_array( $entries ) || empty( $entries ) ) break;
					foreach ( $entries as $e ) {
						$all_ids[] = (string) $e['id'];
					}
					if ( count( $entries ) < $page_size ) break;
					$offset += $page_size;
				}
				return $all_ids;

			case 'wpforms':
				if ( ! function_exists( 'wpforms' ) || ! isset( wpforms()->entry ) ) return null;
				$entries = wpforms()->entry->get_entries( array( 'form_id' => $form_id ) );
				if ( ! is_array( $entries ) ) return array();
				return array_map( function( $e ) { return (string) $e->entry_id; }, $entries );

		case 'avada':
				// Avada stores submissions in fusion_form_submissions (or variant table names).
				// v1.3.8: Expanded multi-strategy discovery with diagnostics.
			$candidate_tables = array(
				$wpdb->prefix . 'fusion_form_submissions',
				$wpdb->prefix . 'fusion_form_db_entries',
				$wpdb->prefix . 'fusion_form_submission_data',
				$wpdb->prefix . 'fusionbuilder_form_submissions',
				$wpdb->prefix . 'avada_form_submissions',
			);

				// Find ALL existing tables (not just the first one)
				$existing_tables = array();
				foreach ( $candidate_tables as $candidate_table ) {
					if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $candidate_table ) ) === $candidate_table ) {
						$existing_tables[] = $candidate_table;
					}
				}

				if ( empty( $existing_tables ) ) {
					error_log( '[MissionMetrics] Avada entry sync: no submission table found. Tried: ' . implode( ', ', $candidate_tables ) );
					self::$last_avada_strategy = 'no_table';
					return null;
				}

				$url_candidates = self::build_page_url_candidates( $page_url, $page_url_candidates );

				// Layer 0: Resolve fusion_form post ID → Avada internal form_id
				// Avada's fusion_form_submissions.form_id is an auto-increment ID, NOT the WP post ID.
				// We resolve it by checking wp_postmeta or querying the submissions table for a mapping.
				$resolved_internal_id = null;
				if ( is_numeric( $form_id ) ) {
					// Strategy 0a: Check if Avada stored the internal form_id in postmeta
					$meta_candidates = array( 'form_id', '_fusion_form_id', 'fusion_form_id' );
					foreach ( $meta_candidates as $meta_key ) {
						$meta_val = get_post_meta( intval( $form_id ), $meta_key, true );
						if ( ! empty( $meta_val ) && is_numeric( $meta_val ) && intval( $meta_val ) !== intval( $form_id ) ) {
							$resolved_internal_id = intval( $meta_val );
							error_log( '[MissionMetrics] Avada Layer 0: resolved post_id=' . $form_id . ' → internal form_id=' . $resolved_internal_id . ' via postmeta key=' . $meta_key );
							break;
						}
					}

					// Strategy 0b: Query submissions table for form_id values, match via page content
					// that embeds form_post_id="X" — find which internal form_id corresponds
					if ( ! $resolved_internal_id ) {
						$primary_table = $existing_tables[0];
						$test_cols = $wpdb->get_col( "SHOW COLUMNS FROM {$primary_table}", 0 );
						if ( in_array( 'form_id', $test_cols, true ) ) {
							// Get all distinct internal form_ids
							$internal_ids = $wpdb->get_col( "SELECT DISTINCT form_id FROM {$primary_table}" );
							if ( is_array( $internal_ids ) && count( $internal_ids ) > 0 ) {
								// For each internal form_id, check if the source_url of its submissions
								// matches pages that embed this fusion_form post
								foreach ( $internal_ids as $iid ) {
									$sample_url = $wpdb->get_var( $wpdb->prepare(
										"SELECT source_url FROM {$primary_table} WHERE form_id = %d AND source_url IS NOT NULL AND source_url != '' LIMIT 1",
										intval( $iid )
									) );
									if ( ! $sample_url ) continue;

									// Check if any page at this URL contains this form_post_id
									$url_path = wp_parse_url( $sample_url, PHP_URL_PATH );
									if ( ! $url_path ) continue;
									$url_path = trim( $url_path, '/' );
									if ( empty( $url_path ) ) continue;

									// Find the page by slug
									$page_post = get_page_by_path( $url_path );
									if ( ! $page_post ) continue;

									$content = $page_post->post_content ?? '';
									// Check for form_post_id references in content (both encoded and plain)
									$decoded = html_entity_decode( $content );
									if (
										strpos( $decoded, 'form_post_id="' . $form_id . '"' ) !== false ||
										strpos( $decoded, "form_post_id='" . $form_id . "'" ) !== false ||
										strpos( $decoded, '"form_post_id":"' . $form_id . '"' ) !== false
									) {
										$resolved_internal_id = intval( $iid );
										error_log( '[MissionMetrics] Avada Layer 0: resolved post_id=' . $form_id . ' → internal form_id=' . $resolved_internal_id . ' via page content scan (page=' . $url_path . ')' );
										break;
									}
								}
							}
						}
				}
				}

				// Strategy 0c: Reverse-match via known page URL candidates → source_url in submissions
				// If Layer 0a/0b failed, find which internal form_id has submissions from the known page URL.
				if ( ! $resolved_internal_id && ! empty( $url_candidates ) ) {
					foreach ( $existing_tables as $resolve_table ) {
						$resolve_cols = $wpdb->get_col( "SHOW COLUMNS FROM {$resolve_table}", 0 );
						if ( ! is_array( $resolve_cols ) || ! in_array( 'form_id', $resolve_cols, true ) || ! in_array( 'source_url', $resolve_cols, true ) ) continue;

						foreach ( $url_candidates as $url_cand ) {
							$like = '%' . $wpdb->esc_like( $url_cand ) . '%';
							$matched_iid = $wpdb->get_var( $wpdb->prepare(
								"SELECT form_id FROM {$resolve_table} WHERE source_url LIKE %s AND form_id IS NOT NULL LIMIT 1",
								$like
							) );
							if ( $matched_iid && is_numeric( $matched_iid ) && intval( $matched_iid ) !== intval( $form_id ) ) {
								// Verify this internal ID isn't already claimed by another fusion_form post
								// by checking if any OTHER form post resolves to the same internal ID via postmeta.
								$collision = false;
								foreach ( $meta_candidates as $mk ) {
									$other_posts = $wpdb->get_col( $wpdb->prepare(
										"SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value = %s AND post_id != %d",
										$mk, (string) $matched_iid, intval( $form_id )
									) );
									if ( ! empty( $other_posts ) ) { $collision = true; break; }
								}
								if ( ! $collision ) {
									$resolved_internal_id = intval( $matched_iid );
									error_log( '[MissionMetrics] Avada Layer 0c: resolved post_id=' . $form_id . ' → internal form_id=' . $resolved_internal_id . ' via source_url match (url=' . $url_cand . ')' );
									break 2;
								}
							}
						}
					}
				}

			// ── STRICT AUTHORITATIVE DISCOVERY ──
			// Only use Layer 0/0.5 (resolved internal ID) and Layer 1 (direct form_ref column match).
			// Fuzzy strategies (URL matching, blob searching, title matching, slug matching) are
			// intentionally DISABLED for counting to prevent cross-form contamination.
			$all_rows = array();
			$all_strategies = array();

			foreach ( $existing_tables as $table ) {

				// Detect columns dynamically
				$columns = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );
				if ( ! is_array( $columns ) || empty( $columns ) ) {
					error_log( '[MissionMetrics] Avada entry sync: could not read columns from ' . $table );
					continue;
				}

				// Detect timestamp column
				$ts_col = null;
				$ts_candidates = array( 'date_time', 'created_at', 'submitted_at', 'date', 'created', 'updated_at' );
				foreach ( $ts_candidates as $tc ) {
					if ( in_array( $tc, $columns, true ) ) {
						$ts_col = $tc;
						break;
					}
				}
				if ( ! $ts_col ) {
					$ts_col = 'id';
				}

				$form_ref_candidates = array( 'form_id', 'fusion_form_id', 'post_id', 'parent_id', 'form_post_id' );
				$rows = array();
				$strategy_used = 'none';

				// Layer 0.5: If we resolved an internal form_id, use it (highest confidence)
				if ( $resolved_internal_id && in_array( 'form_id', $columns, true ) ) {
					$rows = $wpdb->get_results( $wpdb->prepare(
						"SELECT id, {$ts_col} AS ts FROM {$table} WHERE form_id = %d ORDER BY id DESC LIMIT 5000",
						$resolved_internal_id
					) );
					if ( is_array( $rows ) && ! empty( $rows ) ) {
						$strategy_used = 'resolved_internal_id:' . $resolved_internal_id;
					}
				}

				// Layer 1: Try form-ref columns for direct match (using original WP post ID)
				if ( empty( $rows ) || ! is_array( $rows ) ) {
					foreach ( $form_ref_candidates as $frc ) {
						if ( ! in_array( $frc, $columns, true ) ) continue;
						$rows = $wpdb->get_results( $wpdb->prepare(
							"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$frc} = %d ORDER BY id DESC LIMIT 5000",
							intval( $form_id )
						) );
						if ( is_array( $rows ) && ! empty( $rows ) ) {
							$strategy_used = 'form_ref_col:' . $frc;
							break;
						}
						$rows = $wpdb->get_results( $wpdb->prepare(
							"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$frc} = %s ORDER BY id DESC LIMIT 5000",
							(string) $form_id
						) );
						if ( is_array( $rows ) && ! empty( $rows ) ) {
							$strategy_used = 'form_ref_col_str:' . $frc;
							break;
						}
					}
				}

				// Layer 1.5: Direct source_url match (still reasonably precise)
				if ( ( ! is_array( $rows ) || empty( $rows ) ) && ! empty( $url_candidates ) && in_array( 'source_url', $columns, true ) ) {
					foreach ( $url_candidates as $url_candidate ) {
						$like = '%' . $wpdb->esc_like( $url_candidate ) . '%';
						$rows = $wpdb->get_results( $wpdb->prepare(
							"SELECT id, {$ts_col} AS ts FROM {$table} WHERE source_url LIKE %s ORDER BY id DESC LIMIT 5000",
							$like
						) );
						if ( is_array( $rows ) && ! empty( $rows ) ) {
							$strategy_used = 'source_url:page_url';
							break;
						}
					}
				}

				// ── STOP HERE — no fuzzy layers (2-6) for counting ──
				// Layers 2-6 (blob searching, title matching, slug matching, token matching)
				// are intentionally removed to prevent cross-form contamination.

				if ( is_array( $rows ) && ! empty( $rows ) ) {
					$all_strategies[] = $table . ':' . $strategy_used;
					foreach ( $rows as $row ) {
						$key = 'avada_db_' . $row->id . '_' . md5( $table );
						$all_rows[ $key ] = array(
							'id' => 'avada_db_' . $row->id,
							'ts' => $row->ts,
						);
					}
					error_log( '[MissionMetrics] Avada entry sync: form_id=' . $form_id . ' table=' . $table . ' — found ' . count( $rows ) . ' entries (strategy=' . $strategy_used . ')' );
				} else {
					error_log( '[MissionMetrics] Avada entry sync: form_id=' . $form_id . ' table=' . $table . ' — 0 rows (strategy=' . $strategy_used . ', columns=' . implode( ',', $columns ) . ')' );
				}

			} // end foreach $existing_tables

			self::$last_avada_strategy = implode( '+', $all_strategies ) ?: 'none';

			if ( empty( $all_rows ) ) {
				return array();
			}

			// Deduplicate by entry ID (same entry may appear in multiple tables)
			$deduped = array();
			$seen_ids = array();
			foreach ( $all_rows as $entry ) {
				if ( ! isset( $seen_ids[ $entry['id'] ] ) ) {
					$seen_ids[ $entry['id'] ] = true;
					$deduped[] = $entry;
				}
			}

			error_log( '[MissionMetrics] Avada entry sync: form_id=' . $form_id . ' — total merged ' . count( $deduped ) . ' entries from ' . count( $existing_tables ) . ' tables (STRICT mode)' );
			return $deduped;

			case 'ninja_forms':
				// Ninja Forms stores submissions in nf3_objects table (type = 'submission').
				// v1.21.5: Scope to this specific form via parent_id to prevent cross-form counts.
				$table = $wpdb->prefix . 'nf3_objects';
				if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) ) !== $table ) {
					return null;
				}
				$rows = $wpdb->get_results( $wpdb->prepare(
					"SELECT id FROM {$table} WHERE type = %s AND parent_id = %d ORDER BY id DESC LIMIT 5000",
					'submission',
					intval( $form_id )
				) );
				if ( ! is_array( $rows ) || empty( $rows ) ) return array();
				return array_map( function( $r ) { return 'ninja_db_' . $r->id; }, $rows );

			case 'fluent_forms':
				// Fluent Forms stores submissions in fluentform_submissions table.
				// v1.21.5: Parenthesize the status OR so it doesn't match other forms' rows.
				$table = $wpdb->prefix . 'fluentform_submissions';
				if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) ) !== $table ) {
					return null;
				}
				$rows = $wpdb->get_results( $wpdb->prepare(
					"SELECT id FROM {$table} WHERE form_id = %d AND status IN ('read','unread') ORDER BY id DESC LIMIT 5000",
					intval( $form_id )
				) );
				if ( ! is_array( $rows ) || empty( $rows ) ) return array();
				// Fluent Forms already uses the actual entry_id, so return as-is
				return array_map( function( $r ) { return (string) $r->id; }, $rows );

			case 'cf7':
				// CF7 doesn't store entries natively. Check for Flamingo plugin.
				if ( ! post_type_exists( 'flamingo_inbound' ) ) return null;
				$posts = get_posts( array(
					'post_type'      => 'flamingo_inbound',
					'post_status'    => 'publish',
					'posts_per_page' => 5000,
					'meta_query'     => array(
						array(
							'key'   => '_flamingo_channel',
							'value' => 'contact-form-7_' . $form_id,
						),
					),
					'fields' => 'ids',
				) );
				if ( ! is_array( $posts ) || empty( $posts ) ) return array();
				return array_map( function( $id ) { return 'cf7_db_' . $id; }, $posts );

			default:
				return null;
		}
	}

	/**
	 * Build a deduplicated list of page URLs and normalized slash variants.
	 */
	private static function build_page_url_candidates( $page_url = null, $extra_candidates = array() ) {
		$urls = array();

		if ( is_string( $page_url ) && $page_url !== '' ) {
			$urls[] = $page_url;
		}

		if ( is_array( $extra_candidates ) ) {
			foreach ( $extra_candidates as $candidate ) {
				if ( is_string( $candidate ) && $candidate !== '' ) {
					$urls[] = $candidate;
				}
			}
		} elseif ( is_string( $extra_candidates ) && $extra_candidates !== '' ) {
			$urls[] = $extra_candidates;
		}

		$normalized = array();
		foreach ( $urls as $url ) {
			$url = trim( (string) $url );
			if ( $url === '' ) continue;
			$url = esc_url_raw( $url );
			if ( $url === '' ) continue;
			$normalized[] = $url;
			if ( strpos( $url, '?' ) === false && strpos( $url, '#' ) === false ) {
				$normalized[] = rtrim( $url, '/' );
				$normalized[] = trailingslashit( $url );
			}
		}

		return array_values( array_unique( array_filter( $normalized ) ) );
	}

	/**
	 * Match a discovered form against backend-known form mappings.
	 */
	private static function get_known_form_mapping( $known_form_mappings, $form_id ) {
		if ( ! is_array( $known_form_mappings ) ) return null;

		$target = trim( (string) $form_id );
		if ( $target === '' ) return null;

		foreach ( $known_form_mappings as $mapping ) {
			if ( ! is_array( $mapping ) ) continue;
			foreach ( array( $mapping['form_id'] ?? '', $mapping['external_form_id'] ?? '' ) as $candidate ) {
				if ( trim( (string) $candidate ) === $target ) {
					return $mapping;
				}
			}
		}

		return null;
	}

	/**
	 * Detect Avada form references in raw shortcode markup or encoded builder JSON.
	 * Memory-safe: avoids duplicating large post content strings.
	 */
	private static function content_has_avada_form_reference( $content, $form_id ) {
		if ( ! is_string( $content ) || $content === '' ) return false;

		$form_id_escaped = preg_quote( (string) $form_id, '/' );

		// Check original content first (covers most cases)
		$patterns = array(
			'/form_post_id\s*=\s*["\']' . $form_id_escaped . '["\']/i',
			'/form_post_id\s*:\s*["\']' . $form_id_escaped . '["\']/i',
			'/\[fusion_form[^\]]*form_post_id\s*=\s*["\']' . $form_id_escaped . '["\']/i',
		);

		foreach ( $patterns as $pattern ) {
			if ( preg_match( $pattern, $content ) ) return true;
		}

		// Only decode if content contains HTML entities (avoid unnecessary copies)
		if ( strpos( $content, '&' ) !== false || strpos( $content, '\\' ) !== false ) {
			// Decode once into a temporary variable, check, then free
			$decoded = wp_specialchars_decode( $content, ENT_QUOTES );
			if ( $decoded !== $content ) {
				foreach ( $patterns as $pattern ) {
					if ( preg_match( $pattern, $decoded ) ) return true;
				}
			}
			unset( $decoded );

			$decoded = html_entity_decode( $content, ENT_QUOTES, 'UTF-8' );
			foreach ( $patterns as $pattern ) {
				if ( preg_match( $pattern, $decoded ) ) return true;
			}
			unset( $decoded );
		}

		return false;
	}

	/**
	 * Look up which published page/post contains shortcodes or blocks for each form.
	 * Appends 'page_url' to each discovered form entry.
	 */
	private static function enrich_with_page_urls( $discovered, $known_form_mappings = array(), $lightweight = false ) {
		// Build shortcode patterns per provider + form_id
		$patterns = array();
		foreach ( $discovered as $idx => $form ) {
			$fid      = (string) ( $form['form_id'] ?? '' );
			$provider = $form['provider'];
			$searches = array();

			$known_mapping = self::get_known_form_mapping( $known_form_mappings, $fid );
			if ( is_array( $known_mapping ) ) {
				$known_candidates = self::build_page_url_candidates(
					$known_mapping['page_url'] ?? null,
					$known_mapping['page_url_candidates'] ?? array()
				);
				if ( ! empty( $known_candidates ) ) {
					$discovered[ $idx ]['page_url'] = $known_candidates[0];
					$discovered[ $idx ]['page_url_candidates'] = $known_candidates;
				}
			}

			switch ( $provider ) {
				case 'gravity_forms':
					$searches[] = '[gravityform id="' . $fid . '"';
					$searches[] = "[gravityform id='" . $fid . "'";
					$searches[] = 'wp:gravityforms/form {"formId":"' . $fid . '"';
					break;
				case 'cf7':
					$searches[] = '[contact-form-7 id="' . $fid . '"';
					$searches[] = "[contact-form-7 id='" . $fid . "'";
					break;
				case 'wpforms':
					$searches[] = '[wpforms id="' . $fid . '"';
					$searches[] = "[wpforms id='" . $fid . "'";
					break;
				case 'ninja_forms':
					$searches[] = '[ninja_form id="' . $fid . '"';
					$searches[] = '[ninja_form id=' . $fid . ']';
					break;
				case 'fluent_forms':
					$searches[] = '[fluentform id="' . $fid . '"';
					break;
			}

			if ( ! empty( $searches ) ) {
				$patterns[ $idx ] = $searches;
			}
		}

		$posts = get_posts( array(
			'post_type'      => array( 'page', 'post' ),
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'fields'         => 'ids',
		) );

		if ( empty( $posts ) ) return $discovered;

		if ( ! empty( $patterns ) ) {
			foreach ( $posts as $post_id ) {
				$content = get_post_field( 'post_content', $post_id );
				if ( empty( $content ) ) continue;

				foreach ( $patterns as $idx => $searches ) {
					if ( ! empty( $discovered[ $idx ]['page_url'] ) ) continue;

					foreach ( $searches as $needle ) {
						if ( stripos( $content, $needle ) !== false ) {
							$discovered[ $idx ]['page_url'] = get_permalink( $post_id );
							$discovered[ $idx ]['page_url_candidates'] = array( $discovered[ $idx ]['page_url'] );
							break;
						}
					}
				}
			}
		}

		// In lightweight mode (admin_init), skip the heavy Avada content scanning loop
		// to prevent memory exhaustion on sites with large Avada builder pages.
		if ( ! $lightweight ) {
			foreach ( $discovered as $idx => $form ) {
				if ( $form['provider'] !== 'avada' ) continue;

				$fid = (string) ( $form['form_id'] ?? '' );
				$matched_urls = self::build_page_url_candidates( $form['page_url'] ?? null, $form['page_url_candidates'] ?? array() );

				foreach ( $posts as $post_id ) {
					$content = get_post_field( 'post_content', $post_id );
					if ( empty( $content ) ) continue;
					if ( self::content_has_avada_form_reference( $content, $fid ) ) {
						$matched_urls[] = get_permalink( $post_id );
					}
				}

				$matched_urls = self::build_page_url_candidates( null, $matched_urls );
				if ( ! empty( $matched_urls ) ) {
					$discovered[ $idx ]['page_url'] = $matched_urls[0];
					$discovered[ $idx ]['page_url_candidates'] = $matched_urls;
				}
			}
		}

		return $discovered;
	}

	// ── DB-backed entry ID helpers ──────────────────────────────────

	/**
	 * Get the latest Avada submission DB ID for this form.
	 * Uses submission metadata first (date/url), then falls back to form_id query.
	 */
	private static function get_avada_db_entry_id( $form_post_id, $avada_data = array() ) {
		global $wpdb;

		// Try all known Avada submission table names
		$candidate_tables = array(
			$wpdb->prefix . 'fusion_form_submissions',
			$wpdb->prefix . 'fusionbuilder_form_submissions',
			$wpdb->prefix . 'avada_form_submissions',
		);

		$table = null;
		foreach ( $candidate_tables as $ct ) {
			if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $ct ) ) === $ct ) {
				$table = $ct;
				break;
			}
		}

		if ( ! $table ) {
			return 'avada_' . time() . '_' . wp_rand();
		}

		$columns = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );

		// Strategy 1: Use submission metadata (timestamp + source_url) for precise match
		if ( is_array( $avada_data ) && ! empty( $avada_data['submission'] ) && is_string( $avada_data['submission'] ) ) {
			$parts = array_map( 'trim', explode( ',', $avada_data['submission'] ) );
			$submitted_at = $parts[1] ?? '';
			$source_url   = $parts[2] ?? '';

			if ( $submitted_at ) {
				// Try with both form_id AND timestamp for precise match
				$form_ref_cols = array( 'form_id', 'fusion_form_id', 'post_id', 'parent_id', 'form_post_id' );
				foreach ( $form_ref_cols as $frc ) {
					if ( ! in_array( $frc, $columns, true ) ) continue;

					if ( is_array( $columns ) && in_array( 'source_url', $columns, true ) && $source_url ) {
						$row = $wpdb->get_row( $wpdb->prepare(
							"SELECT id FROM {$table} WHERE {$frc} = %d AND date_time = %s AND source_url = %s ORDER BY id DESC LIMIT 1",
							intval( $form_post_id ),
							$submitted_at,
							$source_url
						) );
					} else {
						$row = $wpdb->get_row( $wpdb->prepare(
							"SELECT id FROM {$table} WHERE {$frc} = %d AND date_time = %s ORDER BY id DESC LIMIT 1",
							intval( $form_post_id ),
							$submitted_at
						) );
					}

					if ( $row && isset( $row->id ) ) {
						return 'avada_db_' . $row->id;
					}
				}

				// Fallback: timestamp only (no form_id constraint)
				if ( is_array( $columns ) && in_array( 'source_url', $columns, true ) && $source_url ) {
					$row = $wpdb->get_row( $wpdb->prepare(
						"SELECT id FROM {$table} WHERE date_time = %s AND source_url = %s ORDER BY id DESC LIMIT 1",
						$submitted_at,
						$source_url
					) );
				} else {
					$row = $wpdb->get_row( $wpdb->prepare(
						"SELECT id FROM {$table} WHERE date_time = %s ORDER BY id DESC LIMIT 1",
						$submitted_at
					) );
				}

				if ( $row && isset( $row->id ) ) {
					return 'avada_db_' . $row->id;
				}
			}
		}

		// Strategy 2: form_id-scoped latest entry (scoped to this form only)
		$form_ref_cols = array( 'form_id', 'fusion_form_id', 'post_id', 'parent_id', 'form_post_id' );
		foreach ( $form_ref_cols as $frc ) {
			if ( ! in_array( $frc, $columns, true ) ) continue;
			$row = $wpdb->get_row( $wpdb->prepare(
				"SELECT id FROM {$table} WHERE {$frc} = %d ORDER BY id DESC LIMIT 1",
				intval( $form_post_id )
			) );
			if ( $row && isset( $row->id ) ) {
				return 'avada_db_' . $row->id;
			}
		}

		// Last resort: non-canonical fallback
		return 'avada_' . time() . '_' . wp_rand();
	}

	/**
	 * Get the latest Ninja Forms submission DB ID.
	 * Falls back to timestamp-based ID if table doesn't exist.
	 */
	private static function get_ninja_db_entry_id( $form_data ) {
		global $wpdb;
		$table = $wpdb->prefix . 'nf3_objects';
		if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) ) === $table ) {
			$row = $wpdb->get_row(
				"SELECT id FROM {$table} WHERE type = 'submission' ORDER BY id DESC LIMIT 1"
			);
			if ( $row ) {
				return 'ninja_db_' . $row->id;
			}
		}
		return 'ninja_' . time() . '_' . wp_rand();
	}

	/**
	 * Get the CF7 entry ID via Flamingo if available.
	 * Falls back to timestamp-based ID.
	 */
	private static function get_cf7_db_entry_id( $contact_form ) {
		if ( post_type_exists( 'flamingo_inbound' ) ) {
			// Query the latest Flamingo inbound message for this CF7 form
			$posts = get_posts( array(
				'post_type'      => 'flamingo_inbound',
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'orderby'        => 'date',
				'order'          => 'DESC',
				'meta_query'     => array(
					array(
						'key'   => '_flamingo_channel',
						'value' => 'contact-form-7_' . $contact_form->id(),
					),
				),
				'fields' => 'ids',
			) );
			if ( ! empty( $posts ) ) {
				return 'cf7_db_' . $posts[0];
			}
		}
		return 'cf7_' . time() . '_' . wp_rand();
	}

	// ── Shared helpers ──────────────────────────────────────────────

	private static function get_tracking_context() {
		$visitor_id = isset( $_COOKIE['mm_vid'] ) ? sanitize_text_field( $_COOKIE['mm_vid'] ) : null;
		$session_id = isset( $_COOKIE['mm_sid'] ) ? sanitize_text_field( $_COOKIE['mm_sid'] ) : null;
		$utm_raw    = isset( $_COOKIE['mm_utm'] ) ? json_decode( stripslashes( $_COOKIE['mm_utm'] ), true ) : array();
		if ( ! is_array( $utm_raw ) ) $utm_raw = array();

		return array(
			'domain'         => wp_parse_url( home_url(), PHP_URL_HOST ),
			'referrer'       => wp_get_referer() ?: null,
			'visitor_id'     => $visitor_id,
			'session_id'     => $session_id,
			'utm'            => $utm_raw,
			'plugin_version' => MM_PLUGIN_VERSION,
		);
	}

	private static function send( $payload ) {
		$opts     = MM_Settings::get();
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-form';

		$response = wp_remote_post( $endpoint, array(
			'timeout'  => 1,
			'blocking' => false,
			'headers'  => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( $payload ),
		) );

		if ( is_wp_error( $response ) ) {
			error_log( '[MissionMetrics] Form send error: ' . $response->get_error_message() );
			MM_Retry_Queue::enqueue( $endpoint, $opts['api_key'], $payload );
		}
	}

	// ── Gravity Forms ───────────────────────────────────────────────

	public static function handle_gravity( $entry, $form ) {
		$fields = array();
		if ( ! empty( $form['fields'] ) ) {
			foreach ( $form['fields'] as $field ) {
				$fid   = $field->id;
				$value = rgar( $entry, (string) $fid );
				$fields[] = array(
					'id'    => $fid,
					'name'  => $field->label,
					'label' => $field->label,
					'type'  => $field->type,
					'value' => $value,
				);
			}
		}

		self::send( array(
			'provider' => 'gravity_forms',
			'entry'    => array(
				'form_id'      => rgar( $entry, 'form_id' ),
				'form_title'   => $form['title'] ?? '',
				'entry_id'     => rgar( $entry, 'id' ),
				'source_url'   => rgar( $entry, 'source_url' ),
				'submitted_at' => rgar( $entry, 'date_created' ),
			),
			'context' => self::get_tracking_context(),
			'fields'  => $fields,
		) );
	}

	// ── Contact Form 7 ──────────────────────────────────────────────

	public static function handle_cf7( $contact_form ) {
		$submission = WPCF7_Submission::get_instance();
		if ( ! $submission ) return;

		$posted = $submission->get_posted_data();
		$fields = array();
		foreach ( $posted as $key => $value ) {
			if ( strpos( $key, '_wpcf7' ) === 0 ) continue; // skip internal fields
			$fields[] = array(
				'name'  => $key,
				'label' => $key,
				'type'  => 'text',
				'value' => is_array( $value ) ? implode( ', ', $value ) : $value,
			);
		}

		self::send( array(
			'provider' => 'cf7',
			'entry'    => array(
				'form_id'      => $contact_form->id(),
				'form_title'   => $contact_form->title(),
				'entry_id'     => self::get_cf7_db_entry_id( $contact_form ),
				'source_url'   => wp_get_referer() ?: home_url(),
				'submitted_at' => current_time( 'c' ),
			),
			'context' => self::get_tracking_context(),
			'fields'  => $fields,
		) );
	}

	// ── WPForms ─────────────────────────────────────────────────────

	public static function handle_wpforms( $fields_raw, $entry, $form_data, $entry_id ) {
		$fields = array();
		foreach ( $fields_raw as $field ) {
			$fields[] = array(
				'id'    => $field['id'] ?? '',
				'name'  => $field['name'] ?? '',
				'label' => $field['name'] ?? '',
				'type'  => $field['type'] ?? 'text',
				'value' => $field['value'] ?? '',
			);
		}

		self::send( array(
			'provider' => 'wpforms',
			'entry'    => array(
				'form_id'      => $form_data['id'] ?? '',
				'form_title'   => $form_data['settings']['form_title'] ?? '',
				'entry_id'     => $entry_id,
				'source_url'   => wp_get_referer() ?: home_url(),
				'submitted_at' => current_time( 'c' ),
			),
			'context' => self::get_tracking_context(),
			'fields'  => $fields,
		) );
	}

	// ── Avada / Fusion Forms ────────────────────────────────────────

	public static function handle_avada( $data, $form_post_id ) {
		$fields = array();

		// Avada Fusion Forms sends a structured array with:
		//   'data'         => "value1, value2, ..."
		//   'field_labels' => "label1, label2, ..."
		//   'field_types'  => "type1, type2, ..."
		//   'submission'   => metadata string
		// We need to parse these into individual field records.
		$skip_keys = array( 'submission', 'hidden_field_names', 'fields_holding_privacy_data' );

		if ( is_array( $data ) && isset( $data['data'] ) && isset( $data['field_types'] ) ) {
			// Structured Avada format — split into individual fields
			$values = array_map( 'trim', explode( ', ', $data['data'] ) );
			$types  = array_map( 'trim', explode( ', ', $data['field_types'] ) );
			$labels = isset( $data['field_labels'] )
				? array_map( 'trim', explode( ', ', $data['field_labels'] ) )
				: array();

			// Filter out non-data types
			$skip_types = array( 'submit', 'notice', 'html', 'hidden', 'captcha', 'honeypot', 'section', 'page' );

			$data_field_pos = 0;
			for ( $i = 0; $i < count( $types ); $i++ ) {
				$type = strtolower( $types[ $i ] );
				if ( in_array( $type, $skip_types, true ) ) {
					continue;
				}

				// Use $i to index into values/labels — Avada includes entries for ALL field types
				$value = isset( $values[ $i ] ) ? $values[ $i ] : '';
				$label = isset( $labels[ $i ] ) ? $labels[ $i ] : '';
				$data_field_pos++;

				if ( '' === $value ) {
					continue;
				}

				// Use label as name if available, otherwise infer from type/value
				if ( $label ) {
					$name = $label;
				} else {
					$name = self::infer_avada_field_name( $type, $value, $data_field_pos );
				}

				$fields[] = array(
					'name'  => $name,
					'label' => $label ?: $name,
					'type'  => $types[ $i ],
					'value' => $value,
				);
			}

			// ── CRITICAL FALLBACK ──
			// If CSV parsing produced zero fields (values contain commas causing misalignment),
			// send the raw data/field_types/field_labels blobs so the edge function can parse server-side.
			if ( empty( $fields ) ) {
				$fields[] = array(
					'name'  => 'data',
					'label' => 'data',
					'type'  => 'text',
					'value' => $data['data'],
				);
				$fields[] = array(
					'name'  => 'field_types',
					'label' => 'field_types',
					'type'  => 'text',
					'value' => $data['field_types'],
				);
				if ( isset( $data['field_labels'] ) ) {
					$fields[] = array(
						'name'  => 'field_labels',
						'label' => 'field_labels',
						'type'  => 'text',
						'value' => $data['field_labels'],
					);
				}
			}
		} elseif ( is_array( $data ) ) {
			// Simple key-value format (non-structured Avada or older versions)
			// ALWAYS include data, field_types, field_labels so edge function can parse
			foreach ( $data as $key => $value ) {
				if ( in_array( $key, $skip_keys, true ) ) {
					continue;
				}
				$fields[] = array(
					'name'  => $key,
					'label' => $key,
					'type'  => 'text',
					'value' => is_array( $value ) ? implode( ', ', $value ) : $value,
				);
			}
		}

		$form_title = 'Avada Form';
		$form_post  = get_post( $form_post_id );
		if ( $form_post ) {
			$form_title = $form_post->post_title ?: $form_title;
		}

		// Emergency safety: avoid live DB lookups during Avada submissions so
		// the plugin never slows or disrupts the form request.
		$entry_id = 'avada_' . time() . '_' . wp_rand();
		$entry_id_type = 'lightweight_fallback';

		self::send( array(
			'provider' => 'avada',
			'entry'    => array(
				'form_id'       => $form_post_id,
				'form_title'    => $form_title,
				'entry_id'      => $entry_id,
				'entry_id_type' => $entry_id_type,
				'source_url'    => wp_get_referer() ?: home_url(),
				'submitted_at'  => current_time( 'c' ),
			),
			'context' => self::get_tracking_context(),
			'fields'  => $fields,
		) );
	}

	/**
	 * Infer a meaningful field name for Avada forms when labels are empty.
	 */
	private static function infer_avada_field_name( $type, $value, $position ) {
		$t = strtolower( $type );
		if ( 'email' === $t ) return 'Email';
		if ( 'textarea' === $t ) return 'Message';
		if ( 'select' === $t ) return 'Category';
		if ( 'text' === $t && $value ) {
			if ( preg_match( '/^[^@\s]+@[^@\s]+\.[^@\s]+$/', $value ) ) return 'Email';
			if ( preg_match( '/^[\d\s\-\+\(\)]{7,}$/', preg_replace( '/\s/', '', $value ) ) ) return 'Phone';
			if ( preg_match( '/^\d{4,5}(-\d{4})?$/', $value ) ) return 'Zip Code';
			if ( preg_match( '/^[A-Z]{2}$/', $value ) ) return 'State';
		}
		$pos_map = array( 1 => 'Name', 2 => 'Phone', 3 => 'Email', 4 => 'Category', 5 => 'City', 6 => 'Zip Code', 7 => 'State', 8 => 'Country', 9 => 'Subject', 10 => 'Message' );
		return isset( $pos_map[ $position ] ) ? $pos_map[ $position ] : 'Field ' . $position;
	}

	/**
	 * Extract fields from Avada secondary tables (wp_fusion_form_submission_data, wp_fusion_form_entries).
	 * Returns an array of field records or empty array if no secondary data found.
	 */
	private static function extract_avada_secondary_fields( $submission_id ) {
		global $wpdb;

		$secondary_tables = array(
			array(
				'table' => $wpdb->prefix . 'fusion_form_submission_data',
				'id_col' => 'submission_id',
				'order_col' => 'field_id',
				'value_col' => 'field_value',
				'label_col' => 'field_label',
				'type_col' => 'field_type',
				'meta_col' => '',
			),
			array(
				'table' => $wpdb->prefix . 'fusion_form_entries',
				'id_col' => 'submission_id',
				'order_col' => 'field_id',
				'value_col' => 'value',
				'label_col' => '',
				'type_col' => '',
				'meta_col' => 'data',
			),
		);

		$skip_types = array( 'submit', 'notice', 'html', 'hidden', 'captcha', 'honeypot', 'section', 'page' );
		$fields = array();

		foreach ( $secondary_tables as $cfg ) {
			$secondary_table = $cfg['table'];
			if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $secondary_table ) ) !== $secondary_table ) {
				continue;
			}

			$secondary_columns = $wpdb->get_col( "SHOW COLUMNS FROM {$secondary_table}", 0 );
			if ( ! is_array( $secondary_columns ) || ! in_array( $cfg['id_col'], $secondary_columns, true ) ) {
				continue;
			}

			$order_col = in_array( $cfg['order_col'], $secondary_columns, true ) ? $cfg['order_col'] : $cfg['id_col'];
			$sub_rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM {$secondary_table} WHERE {$cfg['id_col']} = %d ORDER BY {$order_col} ASC LIMIT 200",
				$submission_id
			) );

			if ( ! is_array( $sub_rows ) || empty( $sub_rows ) ) {
				continue;
			}

			$idx = 0;
			foreach ( $sub_rows as $sr ) {
				$val = '';
				if ( ! empty( $cfg['value_col'] ) && in_array( $cfg['value_col'], $secondary_columns, true ) ) {
					$val = trim( (string) ( $sr->{$cfg['value_col']} ?? '' ) );
				}

				$meta = null;
				if ( ! empty( $cfg['meta_col'] ) && in_array( $cfg['meta_col'], $secondary_columns, true ) && ! empty( $sr->{$cfg['meta_col']} ) ) {
					$meta = json_decode( (string) $sr->{$cfg['meta_col']}, true );
					if ( ! is_array( $meta ) ) $meta = null;
				}

				if ( $val === '' && is_array( $meta ) && isset( $meta['value'] ) ) {
					$val = trim( is_scalar( $meta['value'] ) ? (string) $meta['value'] : wp_json_encode( $meta['value'] ) );
				}
				if ( $val === '' || strtolower( $val ) === 'array' || strtolower( $val ) === 'null' ) continue;

				$type = 'text';
				if ( ! empty( $cfg['type_col'] ) && in_array( $cfg['type_col'], $secondary_columns, true ) && ! empty( $sr->{$cfg['type_col']} ) ) {
					$type = strtolower( trim( (string) $sr->{$cfg['type_col']} ) );
				} elseif ( is_array( $meta ) && ! empty( $meta['type'] ) ) {
					$type = strtolower( trim( (string) $meta['type'] ) );
				}
				if ( in_array( $type, $skip_types, true ) ) continue;

				$label = '';
				if ( ! empty( $cfg['label_col'] ) && in_array( $cfg['label_col'], $secondary_columns, true ) && ! empty( $sr->{$cfg['label_col']} ) ) {
					$label = trim( (string) $sr->{$cfg['label_col']} );
				} elseif ( is_array( $meta ) ) {
					$label = trim( (string) ( $meta['label'] ?? ( $meta['name'] ?? '' ) ) );
				}
				if ( $label === '' ) {
					$label = self::infer_avada_field_name( $type, $val, $idx + 1 );
				}

				$fields[] = array(
					'id'    => $idx,
					'name'  => $label,
					'label' => $label,
					'type'  => $type,
					'value' => $val,
				);
				$idx++;
			}

			if ( ! empty( $fields ) ) {
				break;
			}
		}

		return $fields;
	}

	// ── Ninja Forms ─────────────────────────────────────────────────

	public static function handle_ninja( $form_data ) {
		$fields = array();
		if ( ! empty( $form_data['fields'] ) ) {
			foreach ( $form_data['fields'] as $field ) {
				$fields[] = array(
					'id'    => $field['id'] ?? '',
					'name'  => $field['key'] ?? $field['label'] ?? '',
					'label' => $field['label'] ?? '',
					'type'  => $field['type'] ?? 'text',
					'value' => $field['value'] ?? '',
				);
			}
		}

		self::send( array(
			'provider' => 'ninja_forms',
			'entry'    => array(
				'form_id'      => $form_data['form_id'] ?? '',
				'form_title'   => $form_data['settings']['title'] ?? 'Ninja Form',
				'entry_id'     => self::get_ninja_db_entry_id( $form_data ),
				'source_url'   => wp_get_referer() ?: home_url(),
				'submitted_at' => current_time( 'c' ),
			),
			'context' => self::get_tracking_context(),
			'fields'  => $fields,
		) );
	}

	// ── Fluent Forms ────────────────────────────────────────────────

	public static function handle_fluent( $entry_id, $form_data, $form ) {
		$fields = array();
		if ( is_array( $form_data ) ) {
			foreach ( $form_data as $key => $value ) {
				if ( strpos( $key, '_fluentform_' ) === 0 || $key === '__fluent_form_embded_post_id' ) continue;
				$fields[] = array(
					'name'  => $key,
					'label' => $key,
					'type'  => 'text',
					'value' => is_array( $value ) ? implode( ', ', $value ) : $value,
				);
			}
		}

		self::send( array(
			'provider' => 'fluent_forms',
			'entry'    => array(
				'form_id'      => $form->id ?? '',
				'form_title'   => $form->title ?? 'Fluent Form',
				'entry_id'     => $entry_id,
				'source_url'   => wp_get_referer() ?: home_url(),
				'submitted_at' => current_time( 'c' ),
			),
			'context' => self::get_tracking_context(),
			'fields'  => $fields,
		) );
	}

	// ── Form Liveness Probe ────────────────────────────────────────

	/**
	 * Probe all known form pages to verify forms are still rendered.
	 * Called via hourly cron hook 'mm_form_probe_cron'.
	 */
	public static function probe_form_pages() {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) || $opts['enable_gravity'] !== '1' ) return;

		$discovered = array();

		// Build a list of forms with their expected page URLs
		$form_checks = self::get_form_page_checks();
		if ( empty( $form_checks ) ) return;

		$checks = array();
		foreach ( $form_checks as $check ) {
			$page_url  = $check['page_url'];
			$form_id   = $check['form_id'];
			$provider  = $check['provider'];
			$rendered  = false;

			if ( ! $page_url ) {
				continue; // Skip forms without a known page URL
			}

			// Fetch the page locally
			$response = wp_remote_get( $page_url, array(
				'timeout'    => 15,
				'sslverify'  => false,
				'user-agent' => 'ACTV-TRKR-FormProbe/' . MM_PLUGIN_VERSION,
			) );

			if ( is_wp_error( $response ) ) {
				error_log( '[ACTV-TRKR] Form probe fetch error for ' . $page_url . ': ' . $response->get_error_message() );
				$checks[] = array(
					'form_id'  => $form_id,
					'provider' => $provider,
					'rendered' => false,
					'page_url' => $page_url,
				);
				continue;
			}

			$code = wp_remote_retrieve_response_code( $response );
			if ( $code >= 400 ) {
				$checks[] = array(
					'form_id'  => $form_id,
					'provider' => $provider,
					'rendered' => false,
					'page_url' => $page_url,
				);
				continue;
			}

			$body = wp_remote_retrieve_body( $response );
			$rendered = self::detect_form_in_html( $body, $provider, $form_id );

			$checks[] = array(
				'form_id'  => $form_id,
				'provider' => $provider,
				'rendered' => $rendered,
				'page_url' => $page_url,
			);
		}

		if ( empty( $checks ) ) return;

		// Send results to edge function
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-form-health';
		$domain   = wp_parse_url( home_url(), PHP_URL_HOST );

		$response = wp_remote_post( $endpoint, array(
			'timeout' => 15,
			'headers' => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( array(
				'domain' => $domain,
				'checks' => $checks,
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			error_log( '[ACTV-TRKR] Form health report error: ' . $response->get_error_message() );
		}
	}

	/**
	 * Build a list of forms with their page URLs for probing.
	 * Searches post content for shortcodes/blocks containing forms.
	 */
	private static function get_form_page_checks() {
		$checks = array();

		// Gravity Forms
		if ( class_exists( 'GFAPI' ) ) {
			$gf_forms = \GFAPI::get_forms();
			if ( is_array( $gf_forms ) ) {
				foreach ( $gf_forms as $form ) {
					$fid = $form['id'] ?? '';
					if ( ! $fid ) continue;
					$page_url = self::find_page_with_shortcode( '[gravityform', 'id="' . $fid . '"' );
					if ( ! $page_url ) $page_url = self::find_page_with_shortcode( '[gravityforms', 'id="' . $fid . '"' );
					if ( $page_url ) {
						$checks[] = array( 'form_id' => (string) $fid, 'provider' => 'gravity_forms', 'page_url' => $page_url );
					}
				}
			}
		}

		// Contact Form 7
		if ( class_exists( 'WPCF7_ContactForm' ) ) {
			$cf7_forms = \WPCF7_ContactForm::find();
			if ( is_array( $cf7_forms ) ) {
				foreach ( $cf7_forms as $form ) {
					$fid = $form->id();
					$page_url = self::find_page_with_shortcode( '[contact-form-7', 'id="' . $fid . '"' );
					if ( $page_url ) {
						$checks[] = array( 'form_id' => (string) $fid, 'provider' => 'cf7', 'page_url' => $page_url );
					}
				}
			}
		}

		// WPForms
		if ( function_exists( 'wpforms' ) && isset( wpforms()->form ) ) {
			$wp_forms = wpforms()->form->get( '', array( 'posts_per_page' => -1 ) );
			if ( is_array( $wp_forms ) ) {
				foreach ( $wp_forms as $form ) {
					$fid = $form->ID;
					$page_url = self::find_page_with_shortcode( '[wpforms', 'id="' . $fid . '"' );
					if ( $page_url ) {
						$checks[] = array( 'form_id' => (string) $fid, 'provider' => 'wpforms', 'page_url' => $page_url );
					}
				}
			}
		}

		// Avada / Fusion Forms — search for fusion_form shortcode or block
		$avada_pages = get_posts( array(
			'post_type'   => array( 'page', 'post' ),
			'post_status' => 'publish',
			's'           => 'fusion_form',
			'posts_per_page' => 50,
			'fields'      => 'ids',
		) );
		if ( is_array( $avada_pages ) ) {
			foreach ( $avada_pages as $pid ) {
				$content = get_post_field( 'post_content', $pid );
				if ( preg_match_all( '/\[fusion_form\s+form_post_id=["\']?(\d+)/i', $content, $matches ) ) {
					foreach ( $matches[1] as $fid ) {
						$checks[] = array(
							'form_id'  => (string) $fid,
							'provider' => 'avada',
							'page_url' => get_permalink( $pid ),
						);
					}
				}
			}
		}

		return $checks;
	}

	/**
	 * Search published posts/pages for a shortcode containing a form ID.
	 */
	private static function find_page_with_shortcode( $shortcode_start, $id_fragment ) {
		global $wpdb;

		$like = $wpdb->esc_like( $shortcode_start ) . '%' . $wpdb->esc_like( $id_fragment ) . '%';
		$post_id = $wpdb->get_var( $wpdb->prepare(
			"SELECT ID FROM {$wpdb->posts} WHERE post_status = 'publish' AND post_type IN ('page','post') AND post_content LIKE %s LIMIT 1",
			$like
		) );

		return $post_id ? get_permalink( $post_id ) : null;
	}

	/**
	 * Detect whether a form is present in the HTML response.
	 */
	private static function detect_form_in_html( $html, $provider, $form_id ) {
		switch ( $provider ) {
			case 'gravity_forms':
				return (bool) preg_match( '/gform_wrapper[^"]*_' . preg_quote( $form_id, '/' ) . '|gf_browser_|gform_submit/i', $html );

			case 'cf7':
				return (bool) preg_match( '/class=["\'][^"\']*wpcf7[^"\']*["\']|wpcf7-form/i', $html );

			case 'wpforms':
				return (bool) preg_match( '/class=["\'][^"\']*wpforms-form[^"\']*["\']|wpforms-container/i', $html );

			case 'avada':
				return (bool) preg_match( '/class=["\'][^"\']*fusion-form[^"\']*["\']|fusion-form-form-wrapper/i', $html );

			case 'ninja_forms':
				return (bool) preg_match( '/class=["\'][^"\']*nf-form-cont[^"\']*["\']|ninja-forms-/i', $html );

			case 'fluent_forms':
				return (bool) preg_match( '/class=["\'][^"\']*fluentform[^"\']*["\']|ff-el-group/i', $html );

			default:
				// Generic form detection
				return (bool) preg_match( '/<form[^>]*>/i', $html );
		}
	}

	// ── Avada Backfill ─────────────────────────────────────────────

	/**
	 * Return all existing Avada submission tables that may hold primary entry rows.
	 */
	private static function get_avada_submission_tables() {
		global $wpdb;

		$candidate_tables = array(
			$wpdb->prefix . 'fusion_form_submissions',
			$wpdb->prefix . 'fusion_form_db_entries',
			$wpdb->prefix . 'fusion_form_submission_data',
			$wpdb->prefix . 'fusionbuilder_form_submissions',
			$wpdb->prefix . 'avada_form_submissions',
		);

		$existing_tables = array();
		foreach ( $candidate_tables as $candidate_table ) {
			if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $candidate_table ) ) === $candidate_table ) {
				$existing_tables[] = $candidate_table;
			}
		}

		return $existing_tables;
	}

	/**
	 * Detect the best timestamp column for an Avada submissions table.
	 */
	private static function get_avada_timestamp_column( $columns ) {
		foreach ( array( 'date_time', 'created_at', 'submitted_at', 'date', 'created', 'updated_at' ) as $tc ) {
			if ( in_array( $tc, $columns, true ) ) {
				return $tc;
			}
		}

		return 'id';
	}

	/**
	 * Load candidate Avada submission rows for a list of numeric DB IDs from all known tables.
	 */
	private static function get_avada_row_candidates_by_id( $numeric_ids, $existing_tables ) {
		global $wpdb;

		$rows_by_id = array();
		if ( empty( $numeric_ids ) || empty( $existing_tables ) ) {
			return $rows_by_id;
		}

		$placeholders = implode( ',', array_fill( 0, count( $numeric_ids ), '%d' ) );

		foreach ( $existing_tables as $table ) {
			$columns = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );
			if ( ! is_array( $columns ) || empty( $columns ) || ! in_array( 'id', $columns, true ) ) {
				continue;
			}

			$query = $wpdb->prepare( "SELECT * FROM {$table} WHERE id IN ({$placeholders}) ORDER BY id ASC", $numeric_ids );
			$rows = $wpdb->get_results( $query );
			if ( ! is_array( $rows ) || empty( $rows ) ) {
				continue;
			}

			$ts_col = self::get_avada_timestamp_column( $columns );
			$has_submission_col = in_array( 'submission', $columns, true );
			$has_source_url = in_array( 'source_url', $columns, true );

			foreach ( $rows as $row ) {
				$rid = isset( $row->id ) ? (string) $row->id : '';
				if ( $rid === '' ) {
					continue;
				}

				if ( ! isset( $rows_by_id[ $rid ] ) ) {
					$rows_by_id[ $rid ] = array();
				}

				$rows_by_id[ $rid ][] = array(
					'table'              => $table,
					'columns'            => $columns,
					'ts_col'             => $ts_col,
					'has_submission_col' => $has_submission_col,
					'has_source_url'     => $has_source_url,
					'row'                => $row,
				);
			}
		}

		return $rows_by_id;
	}

	/**
	 * Pick the richest Avada row candidate for a submission ID.
	 */
	private static function select_best_avada_row_candidate( $candidates ) {
		$best = null;
		$best_score = -1;

		if ( ! is_array( $candidates ) || empty( $candidates ) ) {
			return null;
		}

		foreach ( $candidates as $candidate ) {
			$row = $candidate['row'] ?? null;
			$columns = $candidate['columns'] ?? array();
			$has_submission_col = ! empty( $candidate['has_submission_col'] );
			$fields = $row ? self::extract_avada_backfill_fields( $row, $columns, $has_submission_col ) : array();
			$score = count( $fields ) * 10;

			if ( ! empty( $candidate['has_source_url'] ) && $row && ! empty( $row->source_url ) ) {
				$score += 3;
			}

			$ts_col = $candidate['ts_col'] ?? null;
			if ( $row && $ts_col && isset( $row->$ts_col ) && ! empty( $row->$ts_col ) ) {
				$score += 1;
			}

			if ( $best === null || $score > $best_score ) {
				$candidate['fields'] = $fields;
				$best = $candidate;
				$best_score = $score;
			}
		}

		return $best;
	}

	/**
	 * REST endpoint to export all Avada form entries with stable avada_db_* IDs
	 * so the dashboard can reimport historical data after a reset.
	 */
	public static function handle_rest_backfill_avada( $request ) {
		// Auth already verified by permission_callback

		$body = $request->get_json_params();
		$known_form_mappings = is_array( $body['known_form_mappings'] ?? null ) ? $body['known_form_mappings'] : array();
		$domain = wp_parse_url( home_url(), PHP_URL_HOST );

		$avada_forms = get_posts( array(
			'post_type'      => 'fusion_form',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );

		if ( empty( $avada_forms ) ) {
			return new \WP_REST_Response( array( 'ok' => true, 'entries' => 0 ), 200 );
		}

		$existing_tables = self::get_avada_submission_tables();

		if ( empty( $existing_tables ) ) {
			return new \WP_REST_Response( array( 'ok' => true, 'entries' => 0, 'error' => 'No Avada submission table found' ), 200 );
		}
		$opts = MM_Settings::get();
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-form';

		$discovered = array();
		foreach ( $avada_forms as $form_post_id ) {
			$discovered[] = array(
				'form_id'  => (string) $form_post_id,
				'provider' => 'avada',
			);
		}
		$discovered = self::enrich_with_page_urls( $discovered, $known_form_mappings );

		$sent = 0;

		foreach ( $discovered as $form_info ) {
			$form_post_id = (string) ( $form_info['form_id'] ?? '' );
			if ( ! $form_post_id ) continue;

			$form_title = get_the_title( intval( $form_post_id ) ) ?: 'Avada Form';
			$page_url   = $form_info['page_url'] ?? null;
			$page_url_candidates = $form_info['page_url_candidates'] ?? array();

			$entry_refs = self::get_active_entry_ids( 'avada', $form_post_id, $page_url, $form_title, $page_url_candidates );
			if ( ! is_array( $entry_refs ) || empty( $entry_refs ) ) continue;

			$numeric_ids = array();
			foreach ( $entry_refs as $entry_ref ) {
				if ( is_array( $entry_ref ) && ! empty( $entry_ref['id'] ) ) {
					$rid = intval( str_replace( 'avada_db_', '', (string) $entry_ref['id'] ) );
					if ( $rid > 0 ) $numeric_ids[] = $rid;
				} elseif ( is_string( $entry_ref ) ) {
					$rid = intval( str_replace( 'avada_db_', '', $entry_ref ) );
					if ( $rid > 0 ) $numeric_ids[] = $rid;
				}
			}
			$numeric_ids = array_values( array_unique( $numeric_ids ) );

			$row_candidates_by_id = self::get_avada_row_candidates_by_id( $numeric_ids, $existing_tables );

			foreach ( $entry_refs as $entry_ref ) {
				$entry_id = null;
				$submitted_at = null;

				if ( is_array( $entry_ref ) && ! empty( $entry_ref['id'] ) ) {
					$entry_id = (string) $entry_ref['id'];
					$submitted_at = $entry_ref['ts'] ?? null;
				} elseif ( is_string( $entry_ref ) ) {
					$entry_id = (string) $entry_ref;
				}

				if ( ! $entry_id ) continue;

				$rid = intval( str_replace( 'avada_db_', '', $entry_id ) );
				$best_candidate = ( $rid > 0 && isset( $row_candidates_by_id[ (string) $rid ] ) )
					? self::select_best_avada_row_candidate( $row_candidates_by_id[ (string) $rid ] )
					: null;
				$row = $best_candidate['row'] ?? null;
				$ts_col = $best_candidate['ts_col'] ?? null;
				$has_source_url = ! empty( $best_candidate['has_source_url'] );
				if ( ! $submitted_at && $row && $ts_col && isset( $row->$ts_col ) ) {
					$submitted_at = $row->$ts_col;
				}

				$fields = array();

				// v1.21.5: Prefer secondary submission-data table FIRST. It stores one row per
				// field with explicit label/type/value, eliminating the comma-split drift that
				// produced "Field 11"/"Field 12" scrambling on Avada forms with consent boxes.
				if ( $rid > 0 ) {
					$fields = self::extract_avada_secondary_fields( $rid );
				}

				// Fallback to primary CSV/blob extraction only if secondary returned nothing.
				if ( empty( $fields ) ) {
					$fields = $best_candidate['fields'] ?? array();
				} else {
					// Merge any extra primary fields whose labels are missing from secondary.
					$primary_fields = $best_candidate['fields'] ?? array();
					if ( ! empty( $primary_fields ) ) {
						$existing_labels = array();
						foreach ( $fields as $f ) {
							$existing_labels[] = strtolower( trim( $f['label'] ?? $f['name'] ?? '' ) );
						}
						$next_id = count( $fields );
						foreach ( $primary_fields as $pf ) {
							$pf_label = strtolower( trim( $pf['label'] ?? $pf['name'] ?? '' ) );
							if ( $pf_label !== '' && ! in_array( $pf_label, $existing_labels, true ) && ! preg_match( '/^field\s+\d+$/i', $pf_label ) ) {
								$pf['id'] = $next_id++;
								$fields[] = $pf;
								$existing_labels[] = $pf_label;
							}
						}
					}
				}

				$source_url = ( $row && $has_source_url && ! empty( $row->source_url ) )
					? $row->source_url
					: ( $page_url_candidates[0] ?? $page_url );

				$payload = array(
					'provider' => 'avada',
					'entry'    => array(
						'form_id'      => $form_post_id,
						'form_title'   => $form_title,
						'entry_id'     => $entry_id,
						'source_url'   => $source_url,
						'submitted_at' => $submitted_at,
					),
					'context' => array(
						'domain'         => $domain,
						'referrer'       => null,
						'visitor_id'     => null,
						'session_id'     => null,
						'utm'            => array(),
						'plugin_version' => MM_PLUGIN_VERSION,
						'backfill'       => true,
					),
					'fields' => $fields,
				);

				$response = wp_remote_post( $endpoint, array(
					'timeout'  => 10,
					'blocking' => true,
					'headers'  => array(
						'Content-Type'  => 'application/json',
						'Authorization' => 'Bearer ' . $opts['api_key'],
					),
					'body' => wp_json_encode( $payload ),
				) );

				if ( ! is_wp_error( $response ) && wp_remote_retrieve_response_code( $response ) < 400 ) {
					$sent++;
				}
			}
		}

		return new \WP_REST_Response( array(
			'ok'             => true,
			'entries'        => $sent,
			'plugin_version' => MM_PLUGIN_VERSION,
		), 200 );
	}

	/**
	 * Extract field data from an Avada submission DB row.
	 * Handles JSON, PHP serialized data, URL-encoded strings, and Avada CSV payloads.
	 */
	private static function extract_avada_backfill_fields( $row, $columns, $has_submission_col ) {
		$payload_columns = array( 'submission', 'data', 'fields', 'form_data', 'payload', 'entry_data', 'serialized_data', 'content', 'meta' );
		$tested_columns  = array();

		foreach ( $payload_columns as $col ) {
			if ( ! in_array( $col, $columns, true ) ) continue;
			$tested_columns[] = $col;
			if ( ! isset( $row->$col ) || $row->$col === null || $row->$col === '' ) continue;

			$parsed = self::parse_avada_payload_to_fields( $row->$col, $row, $columns );
			if ( ! empty( $parsed ) ) return $parsed;
		}

		// Fallback: inspect any remaining scalar columns for serialized/JSON payloads.
		foreach ( $columns as $col ) {
			if ( in_array( $col, $tested_columns, true ) ) continue;
			if ( in_array( $col, array( 'id', 'form_id', 'fusion_form_id', 'post_id', 'parent_id', 'form_post_id', 'source_url', 'created_at', 'updated_at', 'date_time', 'submitted_at', 'date', 'created', 'ip_address', 'user_id' ), true ) ) continue;
			if ( ! isset( $row->$col ) || $row->$col === null || $row->$col === '' ) continue;

			$parsed = self::parse_avada_payload_to_fields( $row->$col, $row, $columns );
			if ( ! empty( $parsed ) ) return $parsed;
		}

		// Final fallback for Avada's split-column CSV format.
		if ( isset( $row->field_types ) && $row->field_types !== '' ) {
			$data_source = '';
			foreach ( array( 'data', 'submission', 'fields', 'form_data' ) as $dc ) {
				if ( isset( $row->$dc ) && $row->$dc !== null && $row->$dc !== '' ) {
					$data_source = is_scalar( $row->$dc ) ? (string) $row->$dc : wp_json_encode( $row->$dc );
					if ( $data_source !== '' ) break;
				}
			}

			$parsed = self::parse_avada_csv_format( array(
				'data'         => $data_source,
				'field_types'  => is_scalar( $row->field_types ) ? (string) $row->field_types : wp_json_encode( $row->field_types ),
				'field_labels' => isset( $row->field_labels ) ? ( is_scalar( $row->field_labels ) ? (string) $row->field_labels : wp_json_encode( $row->field_labels ) ) : '',
			) );
			if ( ! empty( $parsed ) ) return $parsed;
		}

		return array();
	}

	/**
	 * Parse a possible Avada payload into normalized field rows.
	 */
	private static function parse_avada_payload_to_fields( $raw_payload, $row = null, $columns = array() ) {
		$skip_keys = array( 'submission', 'hidden_field_names', 'fields_holding_privacy_data', 'field_labels', 'field_types', 'field_keys', 'form_id', 'form_post_id', 'entry_id' );
		$fields    = array();
		$decoded   = null;
		$raw       = '';

		if ( is_array( $raw_payload ) ) {
			$decoded = $raw_payload;
		} elseif ( is_object( $raw_payload ) ) {
			$decoded = (array) $raw_payload;
		} else {
			$raw = trim( is_scalar( $raw_payload ) ? (string) $raw_payload : wp_json_encode( $raw_payload ) );
			if ( $raw === '' ) return array();
		}

		if ( $decoded === null && $raw !== '' ) {
			$json = json_decode( $raw, true );
			if ( is_array( $json ) ) {
				$decoded = $json;
			}
		}

		if ( $decoded === null && $raw !== '' ) {
			$maybe = @maybe_unserialize( $raw );
			if ( is_array( $maybe ) ) {
				$decoded = $maybe;
			}
		}

		if ( is_array( $decoded ) ) {
			if ( isset( $decoded['fields'] ) && is_array( $decoded['fields'] ) ) {
				$idx = 0;
				foreach ( $decoded['fields'] as $field ) {
					if ( ! is_array( $field ) ) continue;
					$value = $field['value'] ?? ( $field['val'] ?? null );
					if ( is_array( $value ) || is_object( $value ) ) {
						$value = wp_json_encode( $value );
					} else {
						$value = trim( (string) $value );
					}
					if ( $value === '' || strtolower( $value ) === 'array' || strtolower( $value ) === 'null' ) continue;

					$label = (string) ( $field['label'] ?? ( $field['name'] ?? ( $field['id'] ?? ( 'Field ' . ( $idx + 1 ) ) ) ) );
					$type  = (string) ( $field['type'] ?? 'text' );

					$fields[] = array(
						'id'    => $idx,
						'name'  => $label,
						'label' => $label,
						'type'  => $type,
						'value' => $value,
					);
					$idx++;
				}
				if ( ! empty( $fields ) ) return $fields;
			}

			if ( isset( $decoded['data'] ) && isset( $decoded['field_types'] ) ) {
				$csv_fields = self::parse_avada_csv_format( $decoded );
				if ( ! empty( $csv_fields ) ) return $csv_fields;
			}

			$field_pool = $decoded;
			if ( isset( $decoded['data'] ) && is_array( $decoded['data'] ) && ! empty( $decoded['data'] ) ) {
				$field_pool = $decoded['data'];
			}

			$idx = 0;
			foreach ( $field_pool as $key => $value ) {
				$key_string = (string) $key;
				if ( in_array( $key_string, $skip_keys, true ) ) continue;

				if ( is_array( $value ) && isset( $value['value'] ) ) {
					$value = $value['value'];
				}

				if ( is_array( $value ) || is_object( $value ) ) {
					if ( empty( $value ) ) continue;
					$value_string = wp_json_encode( $value );
				} else {
					$value_string = trim( (string) $value );
				}

				if ( $value_string === '' || strtolower( $value_string ) === 'array' || strtolower( $value_string ) === 'null' ) continue;

				$label = $key_string !== '' ? $key_string : ( 'Field ' . ( $idx + 1 ) );

				$fields[] = array(
					'id'    => $idx,
					'name'  => $label,
					'label' => $label,
					'type'  => 'text',
					'value' => $value_string,
				);
				$idx++;
			}
			if ( ! empty( $fields ) ) return $fields;
		}

		// URL-encoded fallback (e.g., field1=value1&field2=value2)
		if ( $raw !== '' && strpos( $raw, '=' ) !== false ) {
			$qs = array();
			parse_str( $raw, $qs );
			if ( is_array( $qs ) && ! empty( $qs ) ) {
				$idx = 0;
				foreach ( $qs as $key => $value ) {
					if ( in_array( (string) $key, $skip_keys, true ) ) continue;
					$value_string = is_array( $value ) ? wp_json_encode( $value ) : trim( (string) $value );
					if ( $value_string === '' ) continue;

					$label = (string) $key;
					$fields[] = array(
						'id'    => $idx,
						'name'  => $label,
						'label' => $label,
						'type'  => 'text',
						'value' => $value_string,
					);
					$idx++;
				}
				if ( ! empty( $fields ) ) return $fields;
			}
		}

		return array();
	}

	/**
	 * Split CSV-like strings while handling quoted values and variable spacing.
	 */
	private static function split_avada_csv_values( $raw ) {
		$raw = is_scalar( $raw ) ? trim( (string) $raw ) : '';
		if ( $raw === '' ) return array();

		$values = str_getcsv( $raw );
		if ( ! is_array( $values ) ) $values = array();

		if ( count( $values ) <= 1 && strpos( $raw, ',' ) !== false ) {
			$values = preg_split( '/\s*,\s*/', $raw );
		}

		return array_map( function( $v ) {
			return trim( (string) $v );
		}, is_array( $values ) ? $values : array() );
	}

	/**
	 * Parse Avada's comma-separated format: data, field_types, field_labels.
	 */
	private static function parse_avada_csv_format( $data ) {
		$fields = array();
		$skip_types = array( 'submit', 'notice', 'html', 'hidden', 'captcha', 'honeypot', 'section', 'page' );

		$data_str   = is_array( $data['data'] ?? null ) ? implode( ', ', $data['data'] ) : (string) ( $data['data'] ?? '' );
		$types_str  = is_array( $data['field_types'] ?? null ) ? implode( ', ', $data['field_types'] ) : (string) ( $data['field_types'] ?? '' );
		$labels_str = is_array( $data['field_labels'] ?? null ) ? implode( ', ', $data['field_labels'] ) : (string) ( $data['field_labels'] ?? '' );

		$types  = self::split_avada_csv_values( $types_str );
		$labels = self::split_avada_csv_values( $labels_str );
		$values = self::split_avada_csv_values( $data_str );

		$real_types = array();
		for ( $i = 0; $i < count( $types ); $i++ ) {
			if ( ! in_array( strtolower( $types[ $i ] ), $skip_types, true ) ) {
				$real_types[] = array( 'type' => $types[ $i ], 'index' => $i );
			}
		}

		if ( empty( $real_types ) ) {
			foreach ( $values as $vi => $val ) {
				if ( $val === '' || strtolower( $val ) === 'array' ) continue;
				$raw_label = $labels[ $vi ] ?? '';
				$label = $raw_label ?: self::infer_avada_field_name( 'text', $val, $vi + 1 );
				$fields[] = array(
					'id'    => $vi,
					'name'  => $label,
					'label' => $label,
					'type'  => 'text',
					'value' => $val,
				);
			}
			return $fields;
		}

		// v1.21.4 FIX: Read both value AND label from the ORIGINAL column index.
		// Previously $values used the filtered index $fi while labels used the original
		// index, causing label/value drift whenever a skipped field type (submit/hidden/
		// html/captcha/notice/honeypot/section/page) sat in the middle of the form.
		// That drift produced scrambled "Field 11" / "Field 12" entries on Avada forms
		// that had a consent checkbox or hidden field added mid-form.
		for ( $fi = 0; $fi < count( $real_types ); $fi++ ) {
			$orig_idx = (int) $real_types[ $fi ]['index'];
			$type     = strtolower( $real_types[ $fi ]['type'] );
			$val      = trim( (string) ( $values[ $orig_idx ] ?? '' ) );
			if ( $val === '' || strtolower( $val ) === 'array' ) continue;

			$raw_label = $labels[ $orig_idx ] ?? '';
			$label = $raw_label ?: self::infer_avada_field_name( $type, $val, $orig_idx + 1 );

			$fields[] = array(
				'id'    => $orig_idx,
				'name'  => $label,
				'label' => $label,
				'type'  => $real_types[ $fi ]['type'],
				'value' => $val,
			);
		}

		return $fields;
	}

	// ── Avada Debug Endpoint ───────────────────────────────────────

	/**
	 * REST endpoint that returns raw sample rows from the Avada submissions table.
	 * Used to diagnose field extraction failures.
	 */
	public static function handle_rest_avada_debug( $request ) {
		// Auth already verified by permission_callback

		global $wpdb;

		$candidate_tables = array(
			$wpdb->prefix . 'fusion_form_submissions',
			$wpdb->prefix . 'fusionbuilder_form_submissions',
			$wpdb->prefix . 'avada_form_submissions',
		);

		$table = null;
		foreach ( $candidate_tables as $ct ) {
			if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $ct ) ) === $ct ) {
				$table = $ct;
				break;
			}
		}

		if ( ! $table ) {
			return new \WP_REST_Response( array(
				'ok'    => false,
				'error' => 'No Avada submission table found',
				'tried' => $candidate_tables,
			), 200 );
		}

		$columns = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );
		$total   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );

		// Get 3 sample rows with ALL columns
		$sample_rows = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY id DESC LIMIT 3" );

		// Convert to arrays and truncate very long values for readability
		$samples = array();
		if ( is_array( $sample_rows ) ) {
			foreach ( $sample_rows as $row ) {
				$row_data = array();
				foreach ( (array) $row as $col => $val ) {
					if ( is_string( $val ) && strlen( $val ) > 500 ) {
						$row_data[ $col ] = substr( $val, 0, 500 ) . '... [truncated, total ' . strlen( $val ) . ' chars]';
					} else {
						$row_data[ $col ] = $val;
					}
				}
				$samples[] = $row_data;
			}
		}

		// Also test our parser on the first row
		$parser_result = array();
		if ( ! empty( $sample_rows ) ) {
			$has_submission_col = in_array( 'submission', $columns, true );
			$parser_result = self::extract_avada_backfill_fields( $sample_rows[0], $columns, $has_submission_col );
		}

		return new \WP_REST_Response( array(
			'ok'            => true,
			'table'         => $table,
			'columns'       => $columns,
			'total_rows'    => $total,
			'sample_rows'   => $samples,
			'parser_output' => $parser_result,
		), 200 );
	}

	/**
	 * Backfill historical entries for all non-Avada form providers (Gravity Forms, CF7, WPForms, etc.).
	 * Called from the dashboard when forms are synced but no entries exist yet.
	 */
	public static function handle_rest_backfill_entries( $request ) {
		// Auth already verified by permission_callback
		$opts = MM_Settings::get();
		$body = $request->get_json_params();
		$known_form_mappings = is_array( $body['known_form_mappings'] ?? null ) ? $body['known_form_mappings'] : array();

		$domain      = wp_parse_url( home_url(), PHP_URL_HOST );
		$page_size   = isset( $body['page_size'] ) ? max( 10, min( 100, intval( $body['page_size'] ) ) ) : 50;
		$max_seconds = isset( $body['max_seconds'] ) ? max( 5, min( 55, intval( $body['max_seconds'] ) ) ) : 20;
		$jobs        = self::get_entry_backfill_jobs( $known_form_mappings );

		if ( empty( $jobs ) ) {
			return new \WP_REST_Response( array(
				'ok'             => true,
				'done'           => true,
				'total_entries'  => 0,
				'total_errors'   => 0,
				'forms_processed'=> 0,
				'plugin_version' => MM_PLUGIN_VERSION,
			), 200 );
		}

		// Resume from cursor if provided
		$resume_job_index = isset( $body['resume_job_index'] ) ? intval( $body['resume_job_index'] ) : 0;
		$resume_offset    = isset( $body['resume_offset'] ) ? intval( $body['resume_offset'] ) : 0;
		$resume_page      = isset( $body['resume_page'] ) ? max( 1, intval( $body['resume_page'] ) ) : 1;

		$start_time   = microtime( true );
		$total_sent   = 0;
		$total_errors = 0;
		$forms_done   = 0;
		$timed_out    = false;

		// Cursor state for resume
		$next_job_index = null;
		$next_offset    = 0;
		$next_page      = 1;

		for ( $ji = $resume_job_index; $ji < count( $jobs ); $ji++ ) {
			$job      = $jobs[ $ji ];
			$offset   = ( $ji === $resume_job_index ) ? $resume_offset : 0;
			$page     = ( $ji === $resume_job_index ) ? $resume_page : 1;
			$has_more = true;

			while ( $has_more ) {
				// Time check before processing next batch
				$elapsed = microtime( true ) - $start_time;
				if ( $elapsed >= $max_seconds ) {
					$timed_out      = true;
					$next_job_index = $ji;
					$next_offset    = $offset;
					$next_page      = $page;
					break 2; // Break out of both loops
				}

				$state = array(
					'provider'  => $job['provider'],
					'form_id'   => $job['form_id'],
					'offset'    => $offset,
					'page'      => $page,
					'page_size' => $page_size,
				);

				$batch = self::process_entry_backfill_job( $job, $domain, $state );
				$total_sent   += $batch['sent'];
				$total_errors += $batch['errors'];

				$has_more = $batch['has_more_current'];
				$offset   = $batch['next_offset'];
				$page     = $batch['next_page'];
			}

			if ( ! $timed_out ) {
				$forms_done++;
			}
		}

		$response_data = array(
			'ok'              => true,
			'done'            => ! $timed_out,
			'total_entries'   => $total_sent,
			'total_errors'    => $total_errors,
			'forms_processed' => $forms_done,
			'plugin_version'  => MM_PLUGIN_VERSION,
		);

		if ( $timed_out && $next_job_index !== null ) {
			$response_data['cursor'] = array(
				'resume_job_index' => $next_job_index,
				'resume_offset'    => $next_offset,
				'resume_page'      => $next_page,
			);
		}

		return new \WP_REST_Response( $response_data, 200 );
	}

	private static function normalize_entries_backfill_state( $body ) {
		$page_size = isset( $body['page_size'] ) ? intval( $body['page_size'] ) : 50;
		$page_size = max( 10, min( 100, $page_size ) );

		return array(
			'provider'  => sanitize_key( $body['provider'] ?? 'gravity_forms' ),
			'form_id'   => isset( $body['form_id'] ) ? (string) $body['form_id'] : null,
			'offset'    => max( 0, intval( $body['offset'] ?? 0 ) ),
			'page'      => max( 1, intval( $body['page'] ?? 1 ) ),
			'page_size' => $page_size,
		);
	}

	private static function get_entry_backfill_jobs( $known_form_mappings = array() ) {
		$jobs = array();

		if ( class_exists( 'GFAPI' ) ) {
			$gf_forms = \GFAPI::get_forms();
			if ( is_array( $gf_forms ) ) {
				foreach ( $gf_forms as $form ) {
					$form_id = (string) ( $form['id'] ?? '' );
					if ( '' === $form_id ) {
						continue;
					}

					$jobs[] = array(
						'provider' => 'gravity_forms',
						'form_id'  => $form_id,
						'form'     => $form,
					);
				}
			}
		}

		if ( function_exists( 'wpforms' ) && isset( wpforms()->form ) && isset( wpforms()->entry ) ) {
			$wp_forms = wpforms()->form->get( '', array( 'posts_per_page' => -1 ) );
			if ( is_array( $wp_forms ) ) {
				foreach ( $wp_forms as $form ) {
					$form_id = isset( $form->ID ) ? (string) $form->ID : '';
					if ( '' === $form_id ) {
						continue;
					}

					$jobs[] = array(
						'provider' => 'wpforms',
						'form_id'  => $form_id,
						'form'     => $form,
					);
				}
			}
		}

		// Avada / Fusion Forms
		$avada_forms = get_posts( array(
			'post_type'      => 'fusion_form',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );
		if ( is_array( $avada_forms ) && ! empty( $avada_forms ) ) {
			$discovered = array();
			foreach ( $avada_forms as $form_post_id ) {
				$discovered[] = array(
					'form_id'    => (string) $form_post_id,
					'provider'   => 'avada',
					'form_title' => get_the_title( $form_post_id ) ?: 'Avada Form',
				);
			}

			$discovered = self::enrich_with_page_urls( $discovered, $known_form_mappings );

			foreach ( $discovered as $form_info ) {
				$form_id = (string) ( $form_info['form_id'] ?? '' );
				if ( '' === $form_id ) {
					continue;
				}

				$jobs[] = array(
					'provider' => 'avada',
					'form_id'  => $form_id,
					'form'     => array(
						'id'                  => intval( $form_id ),
						'title'               => $form_info['form_title'] ?? ( get_the_title( intval( $form_id ) ) ?: 'Avada Form' ),
						'page_url'            => $form_info['page_url'] ?? null,
						'page_url_candidates' => is_array( $form_info['page_url_candidates'] ?? null ) ? $form_info['page_url_candidates'] : array(),
					),
				);
			}
		}

		return array_values( $jobs );
	}

	private static function find_entry_backfill_job_index( $jobs, $provider, $form_id ) {
		foreach ( $jobs as $index => $job ) {
			if ( $job['provider'] === $provider && (string) $job['form_id'] === (string) $form_id ) {
				return $index;
			}
		}

		foreach ( $jobs as $index => $job ) {
			if ( $job['provider'] === $provider ) {
				return $index;
			}
		}

		return 0;
	}

	private static function process_entry_backfill_job( $job, $domain, $state ) {
		$sent             = 0;
		$errors           = 0;
		$has_more_current = false;
		$next_offset      = 0;
		$next_page        = 1;
		$page_size        = intval( $state['page_size'] );
		$payloads         = array();

		if ( 'gravity_forms' === $job['provider'] ) {
			$form    = $job['form'];
			$paging  = array( 'offset' => intval( $state['offset'] ), 'page_size' => $page_size );
			$entries = \GFAPI::get_entries( $job['form_id'], array( 'status' => 'active' ), null, $paging );
			if ( ! is_array( $entries ) ) {
				$entries = array();
			}

			foreach ( $entries as $entry ) {
				$payloads[] = self::build_gravity_backfill_payload( $form, $entry, $domain );
			}

			$has_more_current = count( $entries ) === $page_size;
			$next_offset      = intval( $state['offset'] ) + count( $entries );
		} elseif ( 'wpforms' === $job['provider'] ) {
			$form    = $job['form'];
			$entries = wpforms()->entry->get_entries( array(
				'form_id' => intval( $job['form_id'] ),
				'number'  => $page_size,
				'page'    => intval( $state['page'] ),
			) );
			if ( ! is_array( $entries ) ) {
				$entries = array();
			}

			foreach ( $entries as $entry ) {
				$payloads[] = self::build_wpforms_backfill_payload( $form, $entry, $domain );
			}

			$has_more_current = count( $entries ) === $page_size;
			$next_page        = intval( $state['page'] ) + 1;
		} elseif ( 'avada' === $job['provider'] ) {
			$form_post_id         = (string) $job['form_id'];
			$form_title           = $job['form']['title'] ?? get_the_title( intval( $form_post_id ) ) ?: 'Avada Form';
			$page_url             = $job['form']['page_url'] ?? null;
			$page_url_candidates  = is_array( $job['form']['page_url_candidates'] ?? null ) ? $job['form']['page_url_candidates'] : array();
			$existing_tables      = self::get_avada_submission_tables();

			if ( ! empty( $existing_tables ) ) {
				$entry_refs = self::get_active_entry_ids( 'avada', $form_post_id, $page_url, $form_title, $page_url_candidates );
				if ( ! is_array( $entry_refs ) ) {
					$entry_refs = array();
				}

				$numeric_ids = array();
				foreach ( $entry_refs as $entry_ref ) {
					if ( is_array( $entry_ref ) && ! empty( $entry_ref['id'] ) ) {
						$rid = intval( str_replace( 'avada_db_', '', (string) $entry_ref['id'] ) );
						if ( $rid > 0 ) {
							$numeric_ids[] = $rid;
						}
					} elseif ( is_string( $entry_ref ) ) {
						$rid = intval( str_replace( 'avada_db_', '', $entry_ref ) );
						if ( $rid > 0 ) {
							$numeric_ids[] = $rid;
						}
					}
				}
				$numeric_ids = array_values( array_unique( $numeric_ids ) );
				$row_candidates_by_id = self::get_avada_row_candidates_by_id( $numeric_ids, $existing_tables );

				$offset     = intval( $state['offset'] );
				$page_slice = array_slice( $entry_refs, $offset, $page_size );

				foreach ( $page_slice as $entry_ref ) {
					$entry_id     = null;
					$submitted_at = null;

					if ( is_array( $entry_ref ) && ! empty( $entry_ref['id'] ) ) {
						$entry_id     = (string) $entry_ref['id'];
						$submitted_at = $entry_ref['ts'] ?? null;
					} elseif ( is_string( $entry_ref ) ) {
						$entry_id = (string) $entry_ref;
					}

					if ( ! $entry_id ) {
						continue;
					}

					$rid = intval( str_replace( 'avada_db_', '', $entry_id ) );
					$best_candidate = ( $rid > 0 && isset( $row_candidates_by_id[ (string) $rid ] ) )
						? self::select_best_avada_row_candidate( $row_candidates_by_id[ (string) $rid ] )
						: null;
					$row            = $best_candidate['row'] ?? null;
					$ts_col         = $best_candidate['ts_col'] ?? null;
					$has_source_url = ! empty( $best_candidate['has_source_url'] );

					if ( ! $submitted_at && $row && $ts_col && isset( $row->$ts_col ) ) {
						$submitted_at = $row->$ts_col;
					}

					$fields = array();

					// v1.21.5: Prefer secondary submission-data table FIRST (per-row label/value),
					// fall back to primary CSV/blob extraction only when secondary is empty.
					if ( $rid > 0 ) {
						$fields = self::extract_avada_secondary_fields( $rid );
					}
					if ( empty( $fields ) ) {
						$fields = $best_candidate['fields'] ?? array();
					} else {
						$primary_fields = $best_candidate['fields'] ?? array();
						if ( ! empty( $primary_fields ) ) {
							$existing_labels = array();
							foreach ( $fields as $field ) {
								$existing_labels[] = strtolower( trim( $field['label'] ?? $field['name'] ?? '' ) );
							}
							$next_id = count( $fields );
							foreach ( $primary_fields as $primary_field ) {
								$primary_label = strtolower( trim( $primary_field['label'] ?? $primary_field['name'] ?? '' ) );
								if ( $primary_label !== '' && ! in_array( $primary_label, $existing_labels, true ) && ! preg_match( '/^field\s+\d+$/i', $primary_label ) ) {
									$primary_field['id'] = $next_id++;
									$fields[] = $primary_field;
									$existing_labels[] = $primary_label;
								}
							}
						}
					}

					$source_url = ( $row && $has_source_url && ! empty( $row->source_url ) )
						? $row->source_url
						: ( $page_url_candidates[0] ?? $page_url );

					$payloads[] = array(
						'provider' => 'avada',
						'entry'    => array(
							'form_id'      => $form_post_id,
							'form_title'   => $form_title,
							'entry_id'     => $entry_id,
							'source_url'   => $source_url,
							'submitted_at' => $submitted_at,
						),
						'context' => array(
							'domain'         => $domain,
							'plugin_version' => MM_PLUGIN_VERSION,
							'backfill'       => true,
						),
						'fields' => $fields,
					);
				}

				$has_more_current = ( $offset + count( $page_slice ) ) < count( $entry_refs );
				$next_offset      = $offset + count( $page_slice );

				error_log( '[MissionMetrics] Avada backfill: form_id=' . $form_post_id . ' — authoritative entry_refs=' . count( $entry_refs ) . ', page_slice=' . count( $page_slice ) . ', offset=' . $offset );
			}
		}

		// Send payloads in batches of 25 to the batch endpoint
		$batch_size = 25;
		$chunks     = array_chunk( $payloads, $batch_size );
		foreach ( $chunks as $chunk ) {
			$result = self::send_batch( $chunk );
			$sent   += $result['processed'];
			$errors += $result['errors'];
		}

		return array(
			'sent'             => $sent,
			'errors'           => $errors,
			'has_more_current' => $has_more_current,
			'next_offset'      => $next_offset,
			'next_page'        => $next_page,
		);
	}

	/**
	 * Send a batch of entry payloads to the ingest-form-batch endpoint.
	 */
	private static function send_batch( $payloads ) {
		$opts     = MM_Settings::get();
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-form-batch';

		$response = wp_remote_post( $endpoint, array(
			'timeout'   => 30,
			'blocking'  => true,
			'headers'   => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( array( 'entries' => $payloads ) ),
		) );

		if ( is_wp_error( $response ) ) {
			error_log( '[MissionMetrics] Batch send error: ' . $response->get_error_message() );
			return array( 'processed' => 0, 'errors' => count( $payloads ) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 400 ) {
			error_log( '[MissionMetrics] Batch send HTTP ' . $code . ': ' . wp_remote_retrieve_body( $response ) );
			return array( 'processed' => 0, 'errors' => count( $payloads ) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		return array(
			'processed' => $body['processed'] ?? 0,
			'errors'    => $body['errors'] ?? 0,
		);
	}

	private static function build_gravity_backfill_payload( $form, $entry, $domain ) {
		$fields = array();
		if ( ! empty( $form['fields'] ) ) {
			foreach ( $form['fields'] as $field ) {
				$fid      = $field->id;
				$fields[] = array(
					'id'    => $fid,
					'name'  => $field->label,
					'label' => $field->label,
					'type'  => $field->type,
					'value' => rgar( $entry, (string) $fid ),
				);
			}
		}

		return array(
			'provider' => 'gravity_forms',
			'entry'    => array(
				'form_id'      => (string) ( $form['id'] ?? '' ),
				'form_title'   => $form['title'] ?? '',
				'entry_id'     => rgar( $entry, 'id' ),
				'source_url'   => rgar( $entry, 'source_url' ),
				'submitted_at' => rgar( $entry, 'date_created' ),
			),
			'context'  => array(
				'domain'         => $domain,
				'plugin_version' => MM_PLUGIN_VERSION,
				'backfill'       => true,
			),
			'fields'   => $fields,
		);
	}

	private static function build_wpforms_backfill_payload( $form, $entry, $domain ) {
		$fields_raw = json_decode( $entry->fields, true );
		$fields     = array();
		if ( is_array( $fields_raw ) ) {
			foreach ( $fields_raw as $field ) {
				$fields[] = array(
					'id'    => $field['id'] ?? '',
					'name'  => $field['name'] ?? '',
					'label' => $field['name'] ?? '',
					'type'  => $field['type'] ?? 'text',
					'value' => $field['value'] ?? '',
				);
			}
		}

		return array(
			'provider' => 'wpforms',
			'entry'    => array(
				'form_id'      => isset( $form->ID ) ? (string) $form->ID : '',
				'form_title'   => $form->post_title ?: 'WPForm',
				'entry_id'     => isset( $entry->entry_id ) ? (string) $entry->entry_id : '',
				'source_url'   => home_url(),
				'submitted_at' => $entry->date ?? current_time( 'c' ),
			),
			'context'  => array(
				'domain'         => $domain,
				'plugin_version' => MM_PLUGIN_VERSION,
				'backfill'       => true,
			),
			'fields'   => $fields,
		);
	}

	private static function dispatch_entry_backfill_batch( $key_hash, $state ) {
		$endpoint = rest_url( 'actv-trkr/v1/backfill-entries' );
		$payload  = array_merge( array(
			'triggered_from' => 'backfill_batch',
			'key_hash'       => $key_hash,
		), $state );

		wp_remote_post( $endpoint, array(
			'timeout'   => 0.01,
			'blocking'  => false,
			'sslverify' => false,
			'headers'   => array(
				'Content-Type' => 'application/json',
			),
			'body'      => wp_json_encode( $payload ),
		) );
	}

}
