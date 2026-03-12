<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Universal form capture — server-side hooks for known form plugins.
 * Supports: Gravity Forms, Contact Form 7, WPForms, Avada/Fusion Forms, Ninja Forms, Fluent Forms.
 * Falls back to JS-layer capture for all others.
 */
class MM_Forms {

	public static function init() {
		$opts = MM_Settings::get();

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

		if ( empty( $discovered ) ) {
			return array( 'synced' => 0, 'discovered' => 0 );
		}

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
			return array( 'synced' => 0, 'discovered' => count( $discovered ), 'error' => $response->get_error_message() );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		// Sync entry IDs to detect deletions
		self::sync_entry_ids( $discovered, $domain, $opts );

		return array(
			'synced'     => $body['synced'] ?? 0,
			'discovered' => count( $discovered ),
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

		foreach ( $discovered as $form_info ) {
			$provider = $form_info['provider'] ?? '';
			$form_id  = $form_info['form_id'] ?? '';
			if ( ! $form_id ) continue;

			$entry_ids = self::get_active_entry_ids( $provider, $form_id );
			if ( $entry_ids === null ) continue;

			$forms_with_entries[] = array(
				'form_id'   => $form_id,
				'provider'  => $provider,
				'entry_ids' => $entry_ids,
			);
		}

		if ( empty( $forms_with_entries ) ) return array( 'trashed' => 0, 'restored' => 0 );

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
			return array( 'trashed' => 0, 'restored' => 0, 'error' => $response->get_error_message() );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		return array(
			'trashed'  => $body['trashed'] ?? 0,
			'restored' => $body['restored'] ?? 0,
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
		return $discovered;
	}

	/**
	 * Get active (non-trashed) entry IDs for a given form provider + form ID.
	 * Returns null if the provider doesn't support entry listing.
	 */
	private static function get_active_entry_ids( $provider, $form_id ) {
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

			default:
				// CF7, Ninja Forms, Fluent Forms, Avada — these don't reliably store entries
				// or use generated IDs (timestamps), so we can't reconcile them.
				return null;
		}
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
				'entry_id'     => 'cf7_' . time() . '_' . wp_rand(),
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

			$field_index = 0;
			for ( $i = 0; $i < count( $types ); $i++ ) {
				$type = strtolower( $types[ $i ] );
				if ( in_array( $type, $skip_types, true ) ) {
					continue;
				}

				$value = isset( $values[ $field_index ] ) ? $values[ $field_index ] : '';
				$label = isset( $labels[ $field_index ] ) ? $labels[ $field_index ] : '';
				$field_index++;

				if ( '' === $value ) {
					continue;
				}

			// Use label as name if available, otherwise infer from type/value
				if ( $label ) {
					$name = $label;
				} else {
					$name = self::infer_avada_field_name( $type, $value, $field_index );
				}

				$fields[] = array(
					'name'  => $name,
					'label' => $label ?: $name,
					'type'  => $types[ $i ],
					'value' => $value,
				);
			}

			// If parsing produced no fields, fall back to raw approach
			if ( empty( $fields ) ) {
				foreach ( $data as $key => $value ) {
					if ( in_array( $key, $skip_keys, true ) || 'field_labels' === $key || 'field_types' === $key || 'data' === $key ) {
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
		} elseif ( is_array( $data ) ) {
			// Simple key-value format (non-structured Avada or older versions)
			foreach ( $data as $key => $value ) {
				if ( in_array( $key, $skip_keys, true ) || 'field_labels' === $key || 'field_types' === $key ) {
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

	$form_title = 'Avada Form';
		$form_post  = get_post( $form_post_id );
		if ( $form_post ) {
			$form_title = $form_post->post_title ?: $form_title;
		}

		self::send( array(
			'provider' => 'avada',
			'entry'    => array(
				'form_id'      => $form_post_id,
				'form_title'   => $form_title,
				'entry_id'     => 'avada_' . time() . '_' . wp_rand(),
				'source_url'   => wp_get_referer() ?: home_url(),
				'submitted_at' => current_time( 'c' ),
			),
			'context' => self::get_tracking_context(),
			'fields'  => $fields,
		) );
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
				'entry_id'     => 'ninja_' . time() . '_' . wp_rand(),
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
}
