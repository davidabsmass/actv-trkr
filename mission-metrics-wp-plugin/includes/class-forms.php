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
		if ( is_array( $data ) ) {
			foreach ( $data as $key => $value ) {
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
