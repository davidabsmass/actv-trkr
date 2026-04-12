<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Plugin-side import engine.
 * Receives job instructions from the ACTV TRKR backend and processes
 * batches locally using the appropriate builder adapter.
 *
 * Flow:
 * 1. Backend calls /actv-trkr/v1/import-batch with job params
 * 2. Engine fetches entries locally via adapter
 * 3. Sends normalized batch to ingest-form-batch endpoint
 * 4. Returns cursor + status for the backend to checkpoint
 */
class MM_Import_Engine {

	const MAX_BATCH_SIZE = 250;
	const MAX_RETRIES    = 3;

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes() {
		register_rest_route( 'actv-trkr/v1', '/import-batch', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_import_batch' ),
			'permission_callback' => array( 'MM_Forms', 'verify_key_hash' ),
		) );

		register_rest_route( 'actv-trkr/v1', '/import-count', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_import_count' ),
			'permission_callback' => array( 'MM_Forms', 'verify_key_hash' ),
		) );

		register_rest_route( 'actv-trkr/v1', '/import-discover', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_discover' ),
			'permission_callback' => array( 'MM_Forms', 'verify_key_hash' ),
		) );
	}

	/**
	 * Discover all forms across all adapters.
	 */
	public static function handle_discover( $request ) {
		MM_Adapter_Registry::init();
		$all_forms = array();

		foreach ( MM_Adapter_Registry::all() as $adapter ) {
			try {
				$forms = $adapter->discover_forms();
				foreach ( $forms as $form ) {
					$form['builder_type'] = $adapter->get_builder_type();
					$form['entry_count']  = $adapter->count_entries( $form['external_form_id'] );
					$all_forms[] = $form;
				}
			} catch ( \Throwable $e ) {
				error_log( '[ACTV TRKR] Adapter discover error (' . $adapter->get_builder_type() . '): ' . $e->getMessage() );
			}
		}

		return new \WP_REST_Response( array(
			'ok'    => true,
			'forms' => $all_forms,
			'domain' => wp_parse_url( home_url(), PHP_URL_HOST ),
		), 200 );
	}

	/**
	 * Count entries for a specific form.
	 */
	public static function handle_import_count( $request ) {
		$body = $request->get_json_params();
		$builder_type = sanitize_text_field( $body['builder_type'] ?? '' );
		$form_id      = sanitize_text_field( $body['form_id'] ?? '' );

		if ( ! $builder_type || ! $form_id ) {
			return new \WP_REST_Response( array( 'error' => 'Missing builder_type or form_id' ), 400 );
		}

		MM_Adapter_Registry::init();
		$adapter = MM_Adapter_Registry::get( $builder_type );
		if ( ! $adapter ) {
			return new \WP_REST_Response( array( 'error' => "Unknown builder: $builder_type" ), 400 );
		}

		$count = $adapter->count_entries( $form_id );

		return new \WP_REST_Response( array(
			'ok'    => true,
			'count' => $count,
		), 200 );
	}

	/**
	 * Process one batch of entries for a given form.
	 *
	 * Expects:
	 *   builder_type, form_id, cursor (nullable), batch_size
	 *
	 * Returns:
	 *   ok, processed, next_cursor, has_more
	 */
	public static function handle_import_batch( $request ) {
		$body = $request->get_json_params();

		$builder_type = sanitize_text_field( $body['builder_type'] ?? '' );
		$form_id      = sanitize_text_field( $body['form_id'] ?? '' );
		$cursor       = isset( $body['cursor'] ) ? sanitize_text_field( $body['cursor'] ) : null;
		$batch_size   = min( (int) ( $body['batch_size'] ?? 100 ), self::MAX_BATCH_SIZE );

		if ( ! $builder_type || ! $form_id ) {
			return new \WP_REST_Response( array( 'error' => 'Missing builder_type or form_id' ), 400 );
		}

		MM_Adapter_Registry::init();
		$adapter = MM_Adapter_Registry::get( $builder_type );
		if ( ! $adapter ) {
			return new \WP_REST_Response( array( 'error' => "Unknown builder: $builder_type" ), 400 );
		}

		try {
			// Fetch page of entries
			$page = $adapter->fetch_entries_page( $form_id, $cursor, $batch_size );
			$entries     = $page['entries'] ?? array();
			$next_cursor = $page['next_cursor'] ?? null;

			if ( empty( $entries ) ) {
				return new \WP_REST_Response( array(
					'ok'          => true,
					'processed'   => 0,
					'next_cursor' => null,
					'has_more'    => false,
				), 200 );
			}

			// Normalize and build ingestion payloads
			$opts     = MM_Settings::get();
			$domain   = wp_parse_url( home_url(), PHP_URL_HOST );
			$payloads = array();

			foreach ( $entries as $raw ) {
				$stable_id  = $adapter->get_stable_entry_id( $raw );
				$normalized = $adapter->normalize_entry( $raw, $form_id );

				if ( ! $stable_id ) continue;

				$fields_arr = array();
				$fields = $normalized['fields'] ?? array();
				if ( is_array( $fields ) ) {
					foreach ( $fields as $key => $value ) {
						if ( is_string( $value ) || is_numeric( $value ) ) {
							$fields_arr[] = array(
								'name'  => $key,
								'label' => $key,
								'type'  => 'text',
								'value' => (string) $value,
							);
						}
					}
				}

				$payloads[] = array(
					'entry' => array(
						'form_id'      => $form_id,
						'form_title'   => '',
						'entry_id'     => $stable_id,
						'source_url'   => $normalized['source_url'] ?? '',
						'submitted_at' => $normalized['submitted_at'] ?? '',
					),
					'context' => array(
						'domain'         => $domain,
						'plugin_version' => MM_PLUGIN_VERSION,
					),
					'fields'   => $fields_arr,
					'provider' => $builder_type,
				);
			}

			// Send batch to ingest-form-batch endpoint
			$ingested = 0;
			$errors   = 0;

			if ( ! empty( $payloads ) ) {
				$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-form-batch';
				$result   = self::send_batch( $endpoint, $opts['api_key'], $payloads );
				$ingested = $result['processed'] ?? 0;
				$errors   = $result['errors'] ?? 0;
			}

			return new \WP_REST_Response( array(
				'ok'          => true,
				'processed'   => $ingested,
				'errors'      => $errors,
				'next_cursor' => $next_cursor,
				'has_more'    => $next_cursor !== null,
				'batch_count' => count( $payloads ),
			), 200 );

		} catch ( \Throwable $e ) {
			error_log( '[ACTV TRKR] Import batch error: ' . $e->getMessage() );
			return new \WP_REST_Response( array(
				'error' => $e->getMessage(),
			), 500 );
		}
	}

	/**
	 * Send a batch of entries to the ingest-form-batch endpoint.
	 */
	private static function send_batch( string $endpoint, string $api_key, array $payloads ): array {
		$response = wp_remote_post( $endpoint, array(
			'timeout' => 60,
			'headers' => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $api_key,
			),
			'body' => wp_json_encode( array( 'entries' => $payloads ) ),
		) );

		if ( is_wp_error( $response ) ) {
			// Queue for retry via existing retry mechanism
			MM_Retry_Queue::enqueue( $endpoint, $api_key, array( 'entries' => $payloads ) );
			return array( 'processed' => 0, 'errors' => count( $payloads ), 'error' => $response->get_error_message() );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code >= 200 && $code < 300 ) {
			return array(
				'processed' => $body['processed'] ?? count( $payloads ),
				'errors'    => $body['errors'] ?? 0,
			);
		}

		return array( 'processed' => 0, 'errors' => count( $payloads ), 'error' => "HTTP $code" );
	}
}
