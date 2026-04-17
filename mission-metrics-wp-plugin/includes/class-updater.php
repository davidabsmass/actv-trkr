<?php
/**
 * Self-hosted plugin updater.
 *
 * Hooks into WordPress's plugin update system to check our backend
 * for newer versions and show update notices in wp-admin.
 *
 * SECURITY: As of v1.9.16, the backend signs (version, download_url,
 * issued_at) with HMAC-SHA256. We verify that signature here BEFORE
 * surfacing the update to WordPress. If verification fails, the
 * update is suppressed and an admin notice is shown.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MM_Updater {

	const SLUG        = 'actv-trkr/actv-trkr.php';
	const TRANSIENT   = 'mm_update_data';
	const CHECK_HOURS = 0;

	// Trusted shared secret for HMAC verification of update payloads.
	// This MUST match PLUGIN_RELEASE_SIGNING_SECRET on the backend.
	// Distributed via the plugin source on download — see SECURITY notes.
	const TRUSTED_FINGERPRINT = ''; // legacy unused
	// Maximum acceptable signature age (seconds)
	const MAX_SIG_AGE = 86400; // 24h

	public static function init() {
		add_filter( 'pre_set_site_transient_update_plugins', array( __CLASS__, 'check_update' ) );
		add_filter( 'plugins_api', array( __CLASS__, 'plugin_info' ), 20, 3 );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'row_meta' ), 10, 2 );

		add_action( 'load-plugins.php', array( __CLASS__, 'force_check' ) );
		add_action( 'load-options-general.php', array( __CLASS__, 'force_check' ) );
		add_action( 'upgrader_process_complete', array( __CLASS__, 'after_upgrade' ), 10, 2 );

		// Surface verification failures to admins
		add_action( 'admin_notices', array( __CLASS__, 'maybe_show_signature_warning' ) );
	}

	public static function force_check() {
		delete_transient( self::TRANSIENT );
		delete_site_transient( 'update_plugins' );
	}

	public static function after_upgrade( $upgrader, $options ) {
		if ( isset( $options['plugins'] ) && is_array( $options['plugins'] ) ) {
			if ( in_array( self::SLUG, $options['plugins'], true ) ) {
				delete_transient( self::TRANSIENT );
				delete_site_transient( 'update_plugins' );
			}
		}
	}

	private static function endpoint() {
		$opts = MM_Settings::get();
		return rtrim( $opts['endpoint_url'], '/' ) . '/plugin-update-check';
	}

	/**
	 * Returns the trusted signing secret.
	 *
	 * NOTE: The secret is intentionally NOT hardcoded here — it ships
	 * via a separate distributable file when the plugin is downloaded
	 * from the dashboard, and is stored in WP options at install time.
	 * This means a fresh install without the secret will fall back to
	 * "unsigned, untrusted" behavior (update notices suppressed).
	 */
	private static function get_signing_secret() {
		$opts = MM_Settings::get();
		$secret = $opts['release_signing_secret'] ?? '';
		// Allow override via constant for emergency rotation.
		if ( defined( 'MM_RELEASE_SIGNING_SECRET' ) ) {
			$secret = MM_RELEASE_SIGNING_SECRET;
		}
		return $secret;
	}

	/**
	 * Verify the HMAC-SHA256 signature on an update payload.
	 *
	 * @param array $remote The decoded JSON response from the backend.
	 * @return true|WP_Error
	 */
	private static function verify_signature( $remote ) {
		if ( empty( $remote['version'] ) || empty( $remote['download_url'] ) ) {
			return new WP_Error( 'incomplete_payload', 'Missing version or download URL' );
		}
		$alg       = $remote['signature_alg'] ?? '';
		$signature = $remote['signature'] ?? '';
		$signed_at = $remote['signed_at'] ?? '';

		if ( $alg !== 'HMAC-SHA256' || empty( $signature ) || empty( $signed_at ) ) {
			return new WP_Error( 'unsigned', 'Update payload is unsigned' );
		}

		$secret = self::get_signing_secret();
		if ( empty( $secret ) ) {
			// Fail-closed: no trusted secret = cannot verify.
			return new WP_Error( 'no_secret', 'No release signing secret configured on this site' );
		}

		// Reject stale signatures (replay defense).
		$signed_ts = strtotime( $signed_at );
		if ( ! $signed_ts || abs( time() - $signed_ts ) > self::MAX_SIG_AGE ) {
			return new WP_Error( 'stale_signature', 'Signature too old or invalid timestamp' );
		}

		$message  = $remote['version'] . "\n" . $remote['download_url'] . "\n" . $signed_at;
		$expected = hash_hmac( 'sha256', $message, $secret );

		if ( ! hash_equals( $expected, $signature ) ) {
			return new WP_Error( 'bad_signature', 'Signature verification failed' );
		}
		return true;
	}

	public static function check_update( $transient ) {
		if ( empty( $transient->checked ) ) {
			return $transient;
		}

		$remote = self::get_remote_data();
		if ( ! $remote || empty( $remote['has_update'] ) ) {
			return $transient;
		}

		$verified = self::verify_signature( $remote );
		if ( is_wp_error( $verified ) ) {
			// SECURITY: do not surface an update we can't trust.
			set_transient( 'mm_update_signature_error', $verified->get_error_message(), HOUR_IN_SECONDS );
			return $transient;
		}
		delete_transient( 'mm_update_signature_error' );

		$package = $remote['download_url'];

		$plugin_data = (object) array(
			'slug'        => 'actv-trkr',
			'plugin'      => self::SLUG,
			'new_version' => $remote['version'],
			'url'         => 'https://actvtrkr.com',
			'package'     => $package,
			'icons'       => array(),
			'banners'     => array(),
			'tested'      => $remote['tested_wp'] ?? '6.7',
			'requires'    => $remote['requires_wp'] ?? '5.8',
		);

		$transient->response[ self::SLUG ] = $plugin_data;
		return $transient;
	}

	public static function maybe_show_signature_warning() {
		$err = get_transient( 'mm_update_signature_error' );
		if ( ! $err ) return;
		$screen = get_current_screen();
		if ( ! $screen || ! in_array( $screen->id, array( 'plugins', 'update-core', 'dashboard' ), true ) ) {
			return;
		}
		echo '<div class="notice notice-warning"><p><strong>ACTV TRKR:</strong> '
			. esc_html( 'A plugin update is available but the signature could not be verified (' . $err . '). The update has been suppressed for safety. Re-download the plugin from the ACTV TRKR dashboard to refresh credentials.' )
			. '</p></div>';
	}

	public static function plugin_info( $result, $action, $args ) {
		if ( $action !== 'plugin_information' ) {
			return $result;
		}
		if ( ! isset( $args->slug ) || $args->slug !== 'actv-trkr' ) {
			return $result;
		}

		$remote = self::get_remote_info();
		if ( ! $remote ) {
			return $result;
		}

		$info = new stdClass();
		$info->name          = $remote['name'] ?? 'ACTV TRKR';
		$info->slug          = 'actv-trkr';
		$info->version       = $remote['version'] ?? MM_PLUGIN_VERSION;
		$info->author        = $remote['author'] ?? 'ACTV TRKR';
		$info->homepage      = $remote['homepage'] ?? 'https://actvtrkr.com';
		$info->requires      = $remote['requires'] ?? '5.8';
		$info->tested        = $remote['tested'] ?? '6.7';
		$info->requires_php  = $remote['requires_php'] ?? '7.4';
		$info->download_link = $remote['download_url'] ?? '';
		$info->sections      = array(
			'description' => $remote['sections']['description'] ?? '',
			'changelog'   => nl2br( esc_html( $remote['sections']['changelog'] ?? '' ) ),
		);

		return $info;
	}

	public static function row_meta( $links, $file ) {
		if ( $file !== self::SLUG ) {
			return $links;
		}
		$links[] = '<a href="' . esc_url( admin_url( 'options-general.php?page=actv-trkr' ) ) . '">Settings</a>';
		return $links;
	}

	private static function get_remote_data() {
		$cached = get_transient( self::TRANSIENT );
		if ( $cached !== false ) {
			return $cached;
		}

		$domain = wp_parse_url( home_url(), PHP_URL_HOST );
		$url    = self::endpoint() . '?' . http_build_query( array(
			'action'  => 'check',
			'version' => MM_PLUGIN_VERSION,
			'domain'  => $domain,
		) );

		$response = wp_remote_get( $url, array( 'timeout' => 10 ) );
		if ( is_wp_error( $response ) ) {
			return null;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $body ) ) {
			return null;
		}

		set_transient( self::TRANSIENT, $body, self::CHECK_HOURS * HOUR_IN_SECONDS );
		return $body;
	}

	private static function get_remote_info() {
		$url      = self::endpoint() . '?action=info';
		$response = wp_remote_get( $url, array( 'timeout' => 10 ) );
		if ( is_wp_error( $response ) ) {
			return null;
		}
		return json_decode( wp_remote_retrieve_body( $response ), true );
	}
}
