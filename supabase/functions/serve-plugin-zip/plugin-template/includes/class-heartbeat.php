<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Heartbeat – JS beacon + WP-Cron fallback.
 */
class MM_Heartbeat {

	public static function init() {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) return;
		if ( empty( $opts['enable_heartbeat'] ) || $opts['enable_heartbeat'] !== '1' ) return;

		// JS beacon (front-end, debounced per session)
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_beacon' ) );

		// WP-Cron fallback every 5 min
		add_action( 'mm_heartbeat_cron', array( __CLASS__, 'send_cron_heartbeat' ) );
		if ( ! wp_next_scheduled( 'mm_heartbeat_cron' ) ) {
			wp_schedule_event( time(), 'mm_every_5_min', 'mm_heartbeat_cron' );
		}
	}

	public static function enqueue_beacon() {
		if ( is_admin() ) return;

		$opts = MM_Settings::get();
		wp_enqueue_script(
			'mm-heartbeat',
			MM_PLUGIN_URL . 'assets/heartbeat.js',
			array(),
			MM_PLUGIN_VERSION,
			true
		);

		wp_localize_script( 'mm-heartbeat', 'mmHeartbeat', array(
			'endpoint'      => rtrim( $opts['endpoint_url'], '/' ) . '/ingest-heartbeat',
			'apiKey'         => $opts['api_key'],
			'domain'         => wp_parse_url( home_url(), PHP_URL_HOST ),
			'interval'       => 60000, // 60s debounce
			'pluginVersion'  => MM_PLUGIN_VERSION,
		) );
	}

	public static function send_cron_heartbeat() {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) return;

		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-heartbeat';
		$domain   = wp_parse_url( home_url(), PHP_URL_HOST );

		wp_remote_post( $endpoint, array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type'   => 'application/json',
				'x-actvtrkr-key' => $opts['api_key'],
			),
			'body' => wp_json_encode( array(
				'domain'         => $domain,
				'source'         => 'cron',
				'plugin_version' => MM_PLUGIN_VERSION,
				'meta'   => array( 'php_version' => PHP_VERSION, 'wp_version' => get_bloginfo( 'version' ) ),
			) ),
		) );
	}
}
