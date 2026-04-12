<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Tracker {

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	public static function enqueue() {
		if ( is_admin() ) return;

		$opts = MM_Settings::get();
		if ( $opts['enable_tracking'] !== '1' || empty( $opts['api_key'] ) ) return;

		wp_enqueue_script(
			'mm-tracker',
			MM_PLUGIN_URL . 'assets/tracker.js',
			array(),
			MM_PLUGIN_VERSION,
			true
		);

		$config = array(
			'endpoint'       => rtrim( $opts['endpoint_url'], '/' ) . '/track-pageview',
			'apiKey'         => $opts['api_key'],
			'domain'         => wp_parse_url( home_url(), PHP_URL_HOST ),
			'pluginVersion'  => MM_PLUGIN_VERSION,
		);

		// Pass logged-in WordPress user identity for visitor tracking
		// SECURITY: Only pass user ID and role — never expose email or name in page source
		if ( is_user_logged_in() ) {
			$current_user = wp_get_current_user();
			$config['wpUser'] = array(
				'id'   => $current_user->ID,
				'role' => implode( ',', $current_user->roles ),
			);
		}

		wp_localize_script( 'mm-tracker', 'mmConfig', $config );
	}
}
