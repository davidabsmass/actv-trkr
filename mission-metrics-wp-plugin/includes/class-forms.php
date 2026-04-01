<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Universal form capture — server-side hooks for known form plugins.
 * Supports: Gravity Forms, Contact Form 7, WPForms, Avada/Fusion Forms, Ninja Forms, Fluent Forms.
 * Falls back to JS-layer capture for all others.
 */
class MM_Forms {

	/** @var string|null Last Avada discovery strategy used (for diagnostics). */
	private static $last_avada_strategy = null;

	public static function init() {
		$opts = MM_Settings::get();

		// Register REST API route for dashboard-triggered sync
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );

		// Auto-sync forms on admin pages (once per 6 hours)
		if ( is_admin() && ! empty( $opts['api_key'] ) ) {
			add_action( 'admin_init', array( __CLASS__, 'maybe_auto_sync' ) );
		}

		if ( $opts['enable_gravity'] !== '1' || empty( $opts['api_key'] ) ) return;

		// Gravity Forms
		add_action( 'gform_after_submission', array( __CLASS__, 'handle_gravity' ), 10, 2 );

		// Contact Form 7
		add_action( 'wpcf7_mail_sent', array( __CLASS__, 'handle_cf7' ) );

		// WPForms
		add_action( 'wpforms_process_complete', array( __CLASS__, 'handle_wpforms' ), 10, 4 );

		// Avada / Fusion Forms (2 args: $form_data, $form_post_id)
		add_action( 'fusion_form_submission_data', array( __CLASS__, 'handle_avada' ), 10, 2 );

		// Ninja Forms
		add_action( 'ninja_forms_after_submission', array( __CLASS__, 'handle_ninja' ) );

		// Fluent Forms
		add_action( 'fluentform/submission_inserted', array( __CLASS__, 'handle_fluent' ), 10, 3 );
	}

	// ── REST API ───────────────────────────────────────────────────

	/**
	 * Register REST route so the dashboard can trigger a sync remotely.
	 */
	public static function register_rest_routes() {
		register_rest_route( 'actv-trkr/v1', '/sync', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_rest_sync' ),
			'permission_callback' => '__return_true',
		) );

		register_rest_route( 'actv-trkr/v1', '/backfill-avada', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_rest_backfill_avada' ),
			'permission_callback' => '__return_true',
		) );

		register_rest_route( 'actv-trkr/v1', '/backfill-entries', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_rest_backfill_entries' ),
			'permission_callback' => '__return_true',
		) );

		register_rest_route( 'actv-trkr/v1', '/avada-debug', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_rest_avada_debug' ),
			'permission_callback' => '__return_true',
		) );
	}

	/**
	 * Handle the REST sync request from the dashboard.
	 * Validates the key_hash against the stored API key hash.
	 */
	public static function handle_rest_sync( $request ) {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) {
			return new \WP_REST_Response( array( 'error' => 'Plugin not configured' ), 400 );
		}

		$body     = $request->get_json_params();
		$key_hash = $body['key_hash'] ?? '';

		// Verify: hash the stored key and compare
		$stored_hash = hash( 'sha256', $opts['api_key'] );
		if ( ! $key_hash || ! hash_equals( $stored_hash, $key_hash ) ) {
			return new \WP_REST_Response( array( 'error' => 'Unauthorized' ), 403 );
		}

		// Run the full sync
		$result = self::scan_all_forms();

		return new \WP_REST_Response( array( 'ok' => true, 'result' => $result ), 200 );
	}

	// ── Form Discovery / Sync ───────────────────────────────────────

	/**
	 * Auto-sync forms if the cooldown has expired (every 6 hours).
	 */
	public static function maybe_auto_sync() {
		if ( get_transient( 'actv_trkr_last_form_sync' ) ) return;
		self::scan_all_forms();
		set_transient( 'actv_trkr_last_form_sync', time(), 6 * HOUR_IN_SECONDS );
	}

	/**
	 * Scan all supported form plugins and return discovered forms.
	 */
	public static function scan_all_forms() {
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
		$discovered = self::enrich_with_page_urls( $discovered );

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

			$entry_ids = self::get_active_entry_ids( $provider, $form_id, $form_info['page_url'] ?? null, $form_info['form_title'] ?? null );
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
			'timeout'  => 30,
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
	private static function get_active_entry_ids( $provider, $form_id, $page_url = null, $form_title = null ) {
		global $wpdb;

		switch ( $provider ) {
			case 'gravity_forms':
				if ( ! class_exists( 'GFAPI' ) ) return null;
				$search = array( 'status' => 'active' );
				$entries = \GFAPI::get_entries( $form_id, $search, null, array( 'offset' => 0, 'page_size' => 5000 ) );
				if ( ! is_array( $entries ) ) return array();
				return array_map( function( $e ) { return (string) $e['id']; }, $entries );

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
					$wpdb->prefix . 'fusionbuilder_form_submissions',
					$wpdb->prefix . 'avada_form_submissions',
				);

				$table = null;
				foreach ( $candidate_tables as $candidate_table ) {
					if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $candidate_table ) ) === $candidate_table ) {
						$table = $candidate_table;
						break;
					}
				}

				if ( ! $table ) {
					error_log( '[MissionMetrics] Avada entry sync: no submission table found. Tried: ' . implode( ', ', $candidate_tables ) );
					self::$last_avada_strategy = 'no_table';
					return null;
				}

				// Detect columns dynamically
				$columns = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );
				if ( ! is_array( $columns ) || empty( $columns ) ) {
					error_log( '[MissionMetrics] Avada entry sync: could not read columns from ' . $table );
					self::$last_avada_strategy = 'no_columns';
					return null;
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
					error_log( '[MissionMetrics] Avada entry sync: no timestamp column found in ' . $table . '. Columns: ' . implode( ', ', $columns ) );
					$ts_col = 'id';
				}

				// Expanded form-ref column candidates
				$form_ref_candidates = array( 'form_id', 'fusion_form_id', 'post_id', 'parent_id', 'form_post_id' );
				// Expanded payload/blob column candidates for URL matching
				$blob_candidates = array( 'submission', 'data', 'fields', 'form_data', 'meta', 'content' );

				$rows = array();
				$strategy_used = 'none';

				// Layer 1: Try all form-ref columns for direct match
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
					// Also try string match (some tables store form_id as string)
					$rows = $wpdb->get_results( $wpdb->prepare(
						"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$frc} = %s ORDER BY id DESC LIMIT 5000",
						(string) $form_id
					) );
					if ( is_array( $rows ) && ! empty( $rows ) ) {
						$strategy_used = 'form_ref_col_str:' . $frc;
						break;
					}
				}

				// Layer 2: Search blob/payload columns for form_id or page_url markers
				if ( ( ! is_array( $rows ) || empty( $rows ) ) ) {
					foreach ( $blob_candidates as $bc ) {
						if ( ! in_array( $bc, $columns, true ) ) continue;

						// 2a: Search for form_id in blob
						$like_fid = '%' . $wpdb->esc_like( '"form_id":"' . $form_id . '"' ) . '%';
						$rows = $wpdb->get_results( $wpdb->prepare(
							"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$bc} LIKE %s ORDER BY id DESC LIMIT 5000",
							$like_fid
						) );
						if ( is_array( $rows ) && ! empty( $rows ) ) {
							$strategy_used = 'blob_form_id:' . $bc;
							break;
						}

						// 2b: Also try numeric form_id pattern in blob
						$like_fid2 = '%form_id%' . $wpdb->esc_like( $form_id ) . '%';
						$rows = $wpdb->get_results( $wpdb->prepare(
							"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$bc} LIKE %s ORDER BY id DESC LIMIT 5000",
							$like_fid2
						) );
						if ( is_array( $rows ) && ! empty( $rows ) ) {
							$strategy_used = 'blob_form_id_loose:' . $bc;
							break;
						}
					}
				}

				// Layer 3: page_url match in blob columns
				if ( ( ! is_array( $rows ) || empty( $rows ) ) && ! empty( $page_url ) ) {
					$normalized = esc_url_raw( $page_url );
					$url_candidates = array_values( array_unique( array_filter( array(
						$normalized,
						rtrim( $normalized, '/' ),
						trailingslashit( $normalized ),
					) ) ) );

					foreach ( $blob_candidates as $bc ) {
						if ( ! in_array( $bc, $columns, true ) ) continue;
						foreach ( $url_candidates as $url_candidate ) {
							$like = '%' . $wpdb->esc_like( $url_candidate ) . '%';
							$rows = $wpdb->get_results( $wpdb->prepare(
								"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$bc} LIKE %s ORDER BY id DESC LIMIT 5000",
								$like
							) );
							if ( is_array( $rows ) && ! empty( $rows ) ) {
								$strategy_used = 'blob_url:' . $bc;
								break 2;
							}
						}
					}
				}

				// Layer 4: Search by form title/name in form-ref columns and blob columns
				if ( ( ! is_array( $rows ) || empty( $rows ) ) && ! empty( $form_title ) ) {
					$form_title_clean = trim( wp_strip_all_tags( (string) $form_title ) );
					$normalized_title = trim( preg_replace( '/\s+/', ' ', str_replace( array( '-', '_' ), ' ', strtolower( $form_title_clean ) ) ) );
					$title_slug       = sanitize_title( $form_title_clean );
					$title_variants   = array_values( array_unique( array_filter( array(
						$form_title_clean,
						$normalized_title,
						$title_slug,
						str_replace( ' ', '', $normalized_title ),
					) ) ) );

					// 4a: Try form-ref columns with strict and loose title matching
					foreach ( $form_ref_candidates as $frc ) {
						if ( ! in_array( $frc, $columns, true ) ) continue;
						foreach ( $title_variants as $variant ) {
							$rows = $wpdb->get_results( $wpdb->prepare(
								"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$frc} = %s ORDER BY id DESC LIMIT 5000",
								$variant
							) );
							if ( is_array( $rows ) && ! empty( $rows ) ) {
								$strategy_used = 'form_title_ref:' . $frc;
								break 2;
							}
						}
						$rows = $wpdb->get_results( $wpdb->prepare(
							"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$frc} LIKE %s ORDER BY id DESC LIMIT 5000",
							'%' . $wpdb->esc_like( $form_title_clean ) . '%'
						) );
						if ( is_array( $rows ) && ! empty( $rows ) ) {
							$strategy_used = 'form_title_ref_like:' . $frc;
							break;
						}
					}

					// 4b: Search blob columns by title variants
					if ( ! is_array( $rows ) || empty( $rows ) ) {
						foreach ( $blob_candidates as $bc ) {
							if ( ! in_array( $bc, $columns, true ) ) continue;
							foreach ( $title_variants as $variant ) {
								$rows = $wpdb->get_results( $wpdb->prepare(
									"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$bc} LIKE %s ORDER BY id DESC LIMIT 5000",
									'%' . $wpdb->esc_like( $variant ) . '%'
								) );
								if ( is_array( $rows ) && ! empty( $rows ) ) {
									$strategy_used = 'blob_form_title:' . $bc;
									break 2;
								}
							}
						}
					}

					// 4c: Check name-ish columns with exact + LIKE matching
					$name_candidates = array( 'form_name', 'name', 'title', 'form_title' );
					if ( ! is_array( $rows ) || empty( $rows ) ) {
						foreach ( $name_candidates as $nc ) {
							if ( ! in_array( $nc, $columns, true ) ) continue;
							foreach ( $title_variants as $variant ) {
								$rows = $wpdb->get_results( $wpdb->prepare(
									"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$nc} = %s ORDER BY id DESC LIMIT 5000",
									$variant
								) );
								if ( is_array( $rows ) && ! empty( $rows ) ) {
									$strategy_used = 'name_col:' . $nc;
									break 2;
								}
							}
							$rows = $wpdb->get_results( $wpdb->prepare(
								"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$nc} LIKE %s ORDER BY id DESC LIMIT 5000",
								'%' . $wpdb->esc_like( $form_title_clean ) . '%'
							) );
							if ( is_array( $rows ) && ! empty( $rows ) ) {
								$strategy_used = 'name_col_like:' . $nc;
								break;
							}
						}
					}

					// 4d: Token-based matching for renamed forms (hyphen/space variants)
					if ( ! is_array( $rows ) || empty( $rows ) ) {
						$title_tokens = array_values( array_filter( preg_split( '/\s+/', $normalized_title ), function( $token ) {
							return strlen( $token ) >= 3;
						} ) );
						if ( ! empty( $title_tokens ) ) {
							$title_tokens = array_slice( $title_tokens, 0, 4 );
							foreach ( $blob_candidates as $bc ) {
								if ( ! in_array( $bc, $columns, true ) ) continue;
								$where_parts = array();
								$params = array();
								foreach ( $title_tokens as $token ) {
									$where_parts[] = "{$bc} LIKE %s";
									$params[] = '%' . $wpdb->esc_like( $token ) . '%';
								}
								$sql = "SELECT id, {$ts_col} AS ts FROM {$table} WHERE " . implode( ' AND ', $where_parts ) . " ORDER BY id DESC LIMIT 5000";
								$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ) );
								if ( is_array( $rows ) && ! empty( $rows ) ) {
									$strategy_used = 'blob_title_tokens:' . $bc;
									break;
								}
							}
						}
					}
				}

				// Layer 5: If form_id is numeric, scan blob columns for serialized/JSON markers
				if ( ( ! is_array( $rows ) || empty( $rows ) ) && is_numeric( $form_id ) ) {
					$markers = array(
						'"form_id":"' . (string) $form_id . '"',
						'"form_post_id":"' . (string) $form_id . '"',
						'form_id";i:' . (string) $form_id,
						'form_post_id";i:' . (string) $form_id,
						'form_post_id=' . (string) $form_id,
						'fusion_form_' . (string) $form_id,
						(string) $form_id,
					);
					foreach ( $blob_candidates as $bc ) {
						if ( ! in_array( $bc, $columns, true ) ) continue;
						foreach ( $markers as $marker ) {
							$rows = $wpdb->get_results( $wpdb->prepare(
								"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$bc} LIKE %s ORDER BY id DESC LIMIT 5000",
								'%' . $wpdb->esc_like( $marker ) . '%'
							) );
							if ( is_array( $rows ) && ! empty( $rows ) ) {
								$strategy_used = 'blob_post_id_marker:' . $bc;
								break 2;
							}
						}
					}
				}

				// Layer 6: If there's a form post slug, try matching refs and blobs
				if ( ( ! is_array( $rows ) || empty( $rows ) ) && is_numeric( $form_id ) ) {
					$form_post = get_post( intval( $form_id ) );
					if ( $form_post && $form_post->post_name ) {
						foreach ( $form_ref_candidates as $frc ) {
							if ( ! in_array( $frc, $columns, true ) ) continue;
							$rows = $wpdb->get_results( $wpdb->prepare(
								"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$frc} = %s OR {$frc} LIKE %s ORDER BY id DESC LIMIT 5000",
								$form_post->post_name,
								'%' . $wpdb->esc_like( $form_post->post_name ) . '%'
							) );
							if ( is_array( $rows ) && ! empty( $rows ) ) {
								$strategy_used = 'form_post_slug:' . $frc;
								break;
							}
						}
						if ( ! is_array( $rows ) || empty( $rows ) ) {
							foreach ( $blob_candidates as $bc ) {
								if ( ! in_array( $bc, $columns, true ) ) continue;
								$rows = $wpdb->get_results( $wpdb->prepare(
									"SELECT id, {$ts_col} AS ts FROM {$table} WHERE {$bc} LIKE %s ORDER BY id DESC LIMIT 5000",
									'%' . $wpdb->esc_like( $form_post->post_name ) . '%'
								) );
								if ( is_array( $rows ) && ! empty( $rows ) ) {
									$strategy_used = 'blob_form_slug:' . $bc;
									break;
								}
							}
						}
					}
				}

			// No global fallback — safe failure
			self::$last_avada_strategy = $strategy_used;

			if ( ! is_array( $rows ) || empty( $rows ) ) {
				error_log( '[MissionMetrics] Avada entry sync: form_id=' . $form_id . ' table=' . $table . ' — 0 rows (strategy=' . $strategy_used . ', columns=' . implode( ',', $columns ) . ')' );
				return array();
			}

				error_log( '[MissionMetrics] Avada entry sync: form_id=' . $form_id . ' table=' . $table . ' — found ' . count( $rows ) . ' entries (strategy=' . $strategy_used . ')' );

				$result = array();
				foreach ( $rows as $row ) {
					$result[] = array(
						'id' => 'avada_db_' . $row->id,
						'ts' => $row->ts,
					);
				}
				return $result;

			case 'ninja_forms':
				// Ninja Forms stores submissions in nf3_objects table (type = 'submission')
				$table = $wpdb->prefix . 'nf3_objects';
				if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) ) !== $table ) {
					return null;
				}
				// Ninja Forms uses nf3_objects with type='submission' and parent_id=form_id
				// But the actual data is in nf3_object_meta. Let's query the objects table.
				$rows = $wpdb->get_results( $wpdb->prepare(
					"SELECT id FROM {$table} WHERE type = 'submission' LIMIT 5000"
				) );
				if ( ! is_array( $rows ) || empty( $rows ) ) return array();
				return array_map( function( $r ) { return 'ninja_db_' . $r->id; }, $rows );

			case 'fluent_forms':
				// Fluent Forms stores submissions in fluentform_submissions table
				$table = $wpdb->prefix . 'fluentform_submissions';
				if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) ) !== $table ) {
					return null;
				}
				$rows = $wpdb->get_results( $wpdb->prepare(
					"SELECT id FROM {$table} WHERE form_id = %d AND status = 'read' OR status = 'unread' ORDER BY id DESC LIMIT 5000",
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
	 * Look up which published page/post contains shortcodes or blocks for each form.
	 * Appends 'page_url' to each discovered form entry.
	 */
	private static function enrich_with_page_urls( $discovered ) {
		// Build shortcode patterns per provider + form_id
		$patterns = array();
		foreach ( $discovered as $idx => $form ) {
			$fid      = $form['form_id'];
			$provider = $form['provider'];
			$searches = array();

			switch ( $provider ) {
				case 'gravity_forms':
					$searches[] = '[gravityform id="' . $fid . '"';
					$searches[] = '[gravityform id=\'' . $fid . '\'';
					$searches[] = 'wp:gravityforms/form {"formId":"' . $fid . '"';
					break;
				case 'cf7':
					$searches[] = '[contact-form-7 id="' . $fid . '"';
					$searches[] = '[contact-form-7 id=\'' . $fid . '\'';
					break;
				case 'wpforms':
					$searches[] = '[wpforms id="' . $fid . '"';
					$searches[] = '[wpforms id=\'' . $fid . '\'';
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

		if ( empty( $patterns ) ) return $discovered;

		// Query published posts/pages in batches
		$posts = get_posts( array(
			'post_type'      => array( 'page', 'post' ),
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'fields'         => 'ids',
		) );

		foreach ( $posts as $post_id ) {
			$content = get_post_field( 'post_content', $post_id );
			if ( empty( $content ) ) continue;

			foreach ( $patterns as $idx => $searches ) {
				if ( ! empty( $discovered[ $idx ]['page_url'] ) ) continue; // already found

				foreach ( $searches as $needle ) {
					if ( stripos( $content, $needle ) !== false ) {
						$discovered[ $idx ]['page_url'] = get_permalink( $post_id );
						break;
					}
				}
			}
		}

		// Also check Avada/Fusion — scan post content for builder form elements
		foreach ( $discovered as $idx => &$form ) {
			if ( ! empty( $form['page_url'] ) ) continue;
			if ( $form['provider'] !== 'avada' ) continue;

			$fid = $form['form_id'];
			// Avada builder embeds forms via [fusion_form form_post_id="ID"] or
			// builder element attributes like form_post_id="ID"
			foreach ( $posts as $post_id ) {
				$content = get_post_field( 'post_content', $post_id );
				if ( empty( $content ) ) continue;

				$avada_needles = array(
					'form_post_id="' . $fid . '"',
					"form_post_id='" . $fid . "'",
					'[fusion_form form_post_id="' . $fid . '"',
					"[fusion_form form_post_id='" . $fid . "'",
				);

				foreach ( $avada_needles as $needle ) {
					if ( stripos( $content, $needle ) !== false ) {
						$discovered[ $idx ]['page_url'] = get_permalink( $post_id );
						break 2;
					}
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
			'timeout'  => 10,
			'blocking' => true,
			'headers'  => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( $payload ),
		) );

		if ( is_wp_error( $response ) ) {
			error_log( '[MissionMetrics] Form send error: ' . $response->get_error_message() );
			MM_Retry_Queue::enqueue( $endpoint, $opts['api_key'], $payload );
		} else {
			$code = wp_remote_retrieve_response_code( $response );
			if ( $code >= 400 ) {
				error_log( '[MissionMetrics] Form send HTTP ' . $code . ': ' . wp_remote_retrieve_body( $response ) );
			}
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

		$entry_id = self::get_avada_db_entry_id( $form_post_id, $data );
		$entry_id_type = strpos( $entry_id, 'avada_db_' ) === 0 ? 'canonical' : 'legacy_fallback';

		// Merge secondary table fields to capture any fields missing from CSV (e.g. Phone)
		$rid = intval( str_replace( 'avada_db_', '', $entry_id ) );
		if ( $rid > 0 ) {
			$secondary_fields = self::extract_avada_secondary_fields( $rid );
			if ( ! empty( $secondary_fields ) ) {
				if ( empty( $fields ) ) {
					$fields = $secondary_fields;
				} else {
					$existing_labels = array();
					foreach ( $fields as $f ) {
						$existing_labels[] = strtolower( trim( $f['label'] ?? $f['name'] ?? '' ) );
					}
					foreach ( $secondary_fields as $sf ) {
						$sf_label = strtolower( trim( $sf['label'] ?? $sf['name'] ?? '' ) );
						if ( $sf_label !== '' && ! in_array( $sf_label, $existing_labels, true ) ) {
							$fields[] = $sf;
							$existing_labels[] = $sf_label;
						}
					}
				}
			}
		}

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
	 * REST endpoint to export all Avada form entries with stable avada_db_* IDs
	 * so the dashboard can reimport historical data after a reset.
	 */
	public static function handle_rest_backfill_avada( $request ) {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) {
			return new \WP_REST_Response( array( 'error' => 'Plugin not configured' ), 400 );
		}

		$body     = $request->get_json_params();
		$key_hash = $body['key_hash'] ?? '';

		$stored_hash = hash( 'sha256', $opts['api_key'] );
		if ( ! $key_hash || ! hash_equals( $stored_hash, $key_hash ) ) {
			return new \WP_REST_Response( array( 'error' => 'Unauthorized' ), 403 );
		}

		global $wpdb;
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
			return new \WP_REST_Response( array( 'ok' => true, 'entries' => 0, 'error' => 'No Avada submission table found' ), 200 );
		}

		$columns = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );
		$ts_col = 'id';
		foreach ( array( 'date_time', 'created_at', 'submitted_at', 'date', 'created' ) as $tc ) {
			if ( in_array( $tc, $columns, true ) ) {
				$ts_col = $tc;
				break;
			}
		}

		$has_submission_col = in_array( 'submission', $columns, true );
		$has_source_url     = in_array( 'source_url', $columns, true );
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-form';

		$discovered = array();
		foreach ( $avada_forms as $form_post_id ) {
			$discovered[] = array(
				'form_id'  => (string) $form_post_id,
				'provider' => 'avada',
			);
		}
		$discovered = self::enrich_with_page_urls( $discovered );

		$sent = 0;

		foreach ( $discovered as $form_info ) {
			$form_post_id = (string) ( $form_info['form_id'] ?? '' );
			if ( ! $form_post_id ) continue;

			$form_title = get_the_title( intval( $form_post_id ) ) ?: 'Avada Form';
			$page_url   = $form_info['page_url'] ?? null;

			$entry_refs = self::get_active_entry_ids( 'avada', $form_post_id, $page_url, $form_title );
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

			$rows_by_id = array();
			if ( ! empty( $numeric_ids ) ) {
				$placeholders = implode( ',', array_fill( 0, count( $numeric_ids ), '%d' ) );
				$query = $wpdb->prepare( "SELECT * FROM {$table} WHERE id IN ({$placeholders}) ORDER BY id ASC", $numeric_ids );
				$rows = $wpdb->get_results( $query );
				if ( is_array( $rows ) ) {
					foreach ( $rows as $row ) {
						$rows_by_id[ (string) $row->id ] = $row;
					}
				}
			}

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
				$row = ( $rid > 0 && isset( $rows_by_id[ (string) $rid ] ) ) ? $rows_by_id[ (string) $rid ] : null;
				if ( ! $submitted_at && $row && isset( $row->$ts_col ) ) {
					$submitted_at = $row->$ts_col;
				}

		$fields = array();
				if ( $row ) {
					$fields = self::extract_avada_backfill_fields( $row, $columns, $has_submission_col );
				}

				// ALWAYS query Avada secondary tables to fill in any fields missing from primary extraction.
				// Some fields (e.g. Phone) are stored only in secondary tables like wp_fusion_form_submission_data.
				if ( $rid > 0 ) {
					$secondary_fields = self::extract_avada_secondary_fields( $rid );
					if ( ! empty( $secondary_fields ) ) {
						if ( empty( $fields ) ) {
							$fields = $secondary_fields;
						} else {
							// Merge: add any secondary fields whose labels aren't already present
							$existing_labels = array();
							foreach ( $fields as $f ) {
								$existing_labels[] = strtolower( trim( $f['label'] ?? $f['name'] ?? '' ) );
							}
							$next_id = count( $fields );
							foreach ( $secondary_fields as $sf ) {
								$sf_label = strtolower( trim( $sf['label'] ?? $sf['name'] ?? '' ) );
								if ( $sf_label !== '' && ! in_array( $sf_label, $existing_labels, true ) ) {
									$sf['id'] = $next_id++;
									$fields[] = $sf;
									$existing_labels[] = $sf_label;
								}
							}
						}
					}
				}

				$source_url = ( $row && $has_source_url && ! empty( $row->source_url ) )
					? $row->source_url
					: $page_url;

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

		for ( $fi = 0; $fi < count( $real_types ); $fi++ ) {
			$type = strtolower( $real_types[ $fi ]['type'] );
			$val  = $values[ $fi ] ?? '';
			$val  = trim( (string) $val );
			if ( $val === '' || strtolower( $val ) === 'array' ) continue;

			$raw_label = $labels[ $real_types[ $fi ]['index'] ] ?? '';
			$label = $raw_label ?: self::infer_avada_field_name( $type, $val, $fi + 1 );

			$fields[] = array(
				'id'    => $fi,
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
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) {
			return new \WP_REST_Response( array( 'error' => 'Plugin not configured' ), 400 );
		}

		$body     = $request->get_json_params();
		$key_hash = $body['key_hash'] ?? '';

		$stored_hash = hash( 'sha256', $opts['api_key'] );
		if ( ! $key_hash || ! hash_equals( $stored_hash, $key_hash ) ) {
			return new \WP_REST_Response( array( 'error' => 'Unauthorized' ), 403 );
		}

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
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) {
			return new \WP_REST_Response( array( 'error' => 'Plugin not configured' ), 400 );
		}

		$body     = $request->get_json_params();
		$key_hash = $body['key_hash'] ?? '';

		$stored_hash = hash( 'sha256', $opts['api_key'] );
		if ( ! $key_hash || ! hash_equals( $stored_hash, $key_hash ) ) {
			return new \WP_REST_Response( array( 'error' => 'Unauthorized' ), 403 );
		}

		$domain  = wp_parse_url( home_url(), PHP_URL_HOST );
		$sent    = 0;
		$errors  = 0;
		// ── Gravity Forms ──
		if ( class_exists( 'GFAPI' ) ) {
			$gf_forms = \GFAPI::get_forms();
			if ( is_array( $gf_forms ) ) {
				foreach ( $gf_forms as $form ) {
					$form_id = $form['id'] ?? '';
					if ( ! $form_id ) continue;

					$search    = array( 'status' => 'active' );
					$page_size = 200;
					$offset    = 0;

					while ( true ) {
						$paging  = array( 'offset' => $offset, 'page_size' => $page_size );
						$entries = \GFAPI::get_entries( $form_id, $search, null, $paging );

						if ( ! is_array( $entries ) || empty( $entries ) ) break;

					foreach ( $entries as $entry ) {
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

						$payload = array(
							'provider' => 'gravity_forms',
							'entry'    => array(
								'form_id'      => (string) $form_id,
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

						self::send( $payload );
						$sent++;
					}
				}
			}
		}

		// ── WPForms ──
		if ( function_exists( 'wpforms' ) && isset( wpforms()->entry ) ) {
			$wp_forms = wpforms()->form->get( '', array( 'posts_per_page' => -1 ) );
			if ( is_array( $wp_forms ) ) {
				foreach ( $wp_forms as $form ) {
					$form_id = $form->ID;
					$entries = wpforms()->entry->get_entries( array( 'form_id' => $form_id, 'number' => $max_entries ) );
					if ( ! is_array( $entries ) || empty( $entries ) ) continue;

					foreach ( $entries as $wp_entry ) {
						$fields_raw = json_decode( $wp_entry->fields, true );
						$fields = array();
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

						$payload = array(
							'provider' => 'wpforms',
							'entry'    => array(
								'form_id'      => (string) $form_id,
								'form_title'   => $form->post_title ?: 'WPForm',
								'entry_id'     => (string) $wp_entry->entry_id,
								'source_url'   => home_url(),
								'submitted_at' => $wp_entry->date ?? current_time( 'c' ),
							),
							'context'  => array(
								'domain'         => $domain,
								'plugin_version' => MM_PLUGIN_VERSION,
								'backfill'       => true,
							),
							'fields'   => $fields,
						);

						self::send( $payload );
						$sent++;
					}
				}
			}
		}

		return new \WP_REST_Response( array(
			'ok'      => true,
			'entries' => $sent,
			'errors'  => $errors,
			'plugin_version' => MM_PLUGIN_VERSION,
		), 200 );
	}

}
