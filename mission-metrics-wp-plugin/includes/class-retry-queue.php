<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Retry_Queue {

	const TABLE = 'mm_retry_queue';
	const MAX_ATTEMPTS = 5;

	public static function table_name() {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	public static function create_table() {
		global $wpdb;
		$table   = self::table_name();
		$charset = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS {$table} (
			id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			endpoint VARCHAR(500) NOT NULL,
			payload LONGTEXT NOT NULL,
			attempts TINYINT UNSIGNED DEFAULT 0,
			last_error TEXT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			next_retry_at DATETIME DEFAULT CURRENT_TIMESTAMP
		) {$charset};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	public static function enqueue( $endpoint, $api_key, $payload ) {
		global $wpdb;
		// No longer store the API key — retrieve from settings at retry time
		$wpdb->insert( self::table_name(), array(
			'endpoint' => $endpoint,
			'payload'  => wp_json_encode( $payload ),
		) );
	}

	public static function process() {
		global $wpdb;
		$table = self::table_name();
		$now   = current_time( 'mysql' );
		$opts  = MM_Settings::get();

		if ( empty( $opts['api_key'] ) ) return;

		$rows = $wpdb->get_results( $wpdb->prepare(
			"SELECT * FROM {$table} WHERE attempts < %d AND next_retry_at <= %s ORDER BY created_at ASC LIMIT 20",
			self::MAX_ATTEMPTS,
			$now
		) );

		foreach ( $rows as $row ) {
			$response = wp_remote_post( $row->endpoint, array(
				'timeout' => 15,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $opts['api_key'],
				),
				'body' => $row->payload,
			) );

			$code = is_wp_error( $response ) ? 0 : wp_remote_retrieve_response_code( $response );

			if ( $code >= 200 && $code < 300 ) {
				$wpdb->delete( $table, array( 'id' => $row->id ) );
			} else {
				$attempts = (int) $row->attempts + 1;
				$error    = is_wp_error( $response ) ? $response->get_error_message() : 'HTTP ' . $code;
				$delay    = min( pow( 2, $attempts ) * 60, 3600 );
				$next     = gmdate( 'Y-m-d H:i:s', time() + $delay );

				$wpdb->update( $table, array(
					'attempts'      => $attempts,
					'last_error'    => $error,
					'next_retry_at' => $next,
				), array( 'id' => $row->id ) );
			}
		}

		// Purge old failures.
		$wpdb->query( $wpdb->prepare(
			"DELETE FROM {$table} WHERE attempts >= %d",
			self::MAX_ATTEMPTS
		) );
	}
}
