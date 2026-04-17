<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * MM_Tracker (v1.9.17+) — passes a narrow-scope ingest token to the in-page
 * tracker instead of the admin API key. See class-ingest-token.php.
 */
class MM_Tracker {

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	public static function enqueue() {
		if ( is_admin() ) return;

		$opts = MM_Settings::get();
		if ( $opts['enable_tracking'] !== '1' || empty( $opts['api_key'] ) ) return;

		$ingest_token = MM_Ingest_Token::get();
		if ( empty( $ingest_token ) ) return;

		wp_enqueue_script(
			'mm-tracker',
			MM_PLUGIN_URL . 'assets/tracker.js',
			array(),
			MM_PLUGIN_VERSION,
			true
		);

		$config = array(
			'endpoint'      => rtrim( $opts['endpoint_url'], '/' ) . '/track-pageview',
			'ingestToken'   => $ingest_token,
			'domain'        => wp_parse_url( home_url(), PHP_URL_HOST ),
			'pluginVersion' => MM_PLUGIN_VERSION,
			'consentMode'   => $opts['consent_mode'] ?? 'strict',
		);

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
