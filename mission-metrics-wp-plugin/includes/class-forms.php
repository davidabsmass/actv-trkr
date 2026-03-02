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
		return array(
			'synced'     => $body['synced'] ?? 0,
			'discovered' => count( $discovered ),
		);
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

				// Use label as name if available, otherwise generate a field name
				$name = $label ?: 'field_' . ( $i + 1 );

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
}
