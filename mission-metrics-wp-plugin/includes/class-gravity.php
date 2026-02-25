<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Gravity {

	public static function init() {
		add_action( 'gform_after_submission', array( __CLASS__, 'handle_submission' ), 10, 2 );
	}

	public static function handle_submission( $entry, $form ) {
		$opts = MM_Settings::get();
		if ( $opts['enable_gravity'] !== '1' || empty( $opts['api_key'] ) ) return;

		// Read tracking cookies from the server-side request.
		$visitor_id = isset( $_COOKIE['mm_vid'] ) ? sanitize_text_field( $_COOKIE['mm_vid'] ) : null;
		$session_id = isset( $_COOKIE['mm_sid'] ) ? sanitize_text_field( $_COOKIE['mm_sid'] ) : null;
		$utm_raw    = isset( $_COOKIE['mm_utm'] ) ? json_decode( stripslashes( $_COOKIE['mm_utm'] ), true ) : array();
		if ( ! is_array( $utm_raw ) ) $utm_raw = array();

		// Build fields array.
		$fields = array();
		if ( ! empty( $form['fields'] ) ) {
			foreach ( $form['fields'] as $field ) {
				$fid   = $field->id;
				$value = rgar( $entry, (string) $fid );
				$fields[] = array(
					'id'    => $fid,
					'label' => $field->label,
					'type'  => $field->type,
					'value' => $value,
				);
			}
		}

		$domain = wp_parse_url( home_url(), PHP_URL_HOST );

		$payload = array(
			'entry' => array(
				'form_id'      => rgar( $entry, 'form_id' ),
				'form_title'   => $form['title'] ?? '',
				'entry_id'     => rgar( $entry, 'id' ),
				'source_url'   => rgar( $entry, 'source_url' ),
				'submitted_at' => rgar( $entry, 'date_created' ),
			),
			'context' => array(
				'domain'     => $domain,
				'referrer'   => wp_get_referer() ?: null,
				'visitor_id' => $visitor_id,
				'session_id' => $session_id,
				'utm'        => $utm_raw,
				'plugin_version' => MM_PLUGIN_VERSION,
			),
			'fields' => $fields,
		);

		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-gravity';

		$response = wp_remote_post( $endpoint, array(
			'timeout'  => 5,
			'blocking' => false,
			'headers'  => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( $payload ),
		) );

		// If the request failed, queue for retry.
		if ( is_wp_error( $response ) ) {
			MM_Retry_Queue::enqueue( $endpoint, $opts['api_key'], $payload );
		}
	}
}
