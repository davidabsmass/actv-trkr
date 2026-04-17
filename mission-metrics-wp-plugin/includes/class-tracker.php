<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * MM_Tracker — enqueues the in-page tracking script.
 *
 * SECURITY (v1.9.17+):
 *   We no longer expose the org's admin API key in page source. Instead a
 *   site-bound, ingestion-only token is minted server-side via
 *   MM_Ingest_Token::get() and passed to JS as `mmConfig.ingestToken`.
 *   That token can ONLY hit /track-pageview and /track-event — nothing
 *   privileged, nothing magic-login, nothing settings-related.
 *
 *   If minting fails (e.g. backend unreachable on first pageview after
 *   install), we suppress the tracker entirely rather than fall back to
 *   embedding the admin key. The next pageview will retry the mint.
 */
class MM_Tracker {

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	public static function enqueue() {
		if ( is_admin() ) return;

		$opts = MM_Settings::get();
		if ( $opts['enable_tracking'] !== '1' || empty( $opts['api_key'] ) ) return;

		// Mint or load the narrow-scope ingest token. Never embed the admin key.
		$ingest_token = MM_Ingest_Token::get();
		if ( empty( $ingest_token ) ) {
			// Don't fall back to the admin key — better to skip a few
			// pageviews than to leak the privileged credential.
			return;
		}

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

		// Pass logged-in WordPress user identity for visitor tracking.
		// SECURITY: only ID + role — never email or display name.
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
