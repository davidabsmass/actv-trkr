<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * MM_Hmac — HMAC-SHA256 verification for backend → plugin requests.
 *
 * SECURITY (C-2):
 *   The stored `key_hash` is no longer accepted as a credential when a
 *   signing_secret is configured. Every backend → plugin REST call must
 *   carry:
 *     X-Actv-Timestamp: <unix seconds>
 *     X-Actv-Nonce:     <16-byte hex>
 *     X-Actv-Signature: <hex hmac_sha256(secret, "ts\nnonce\nbody")>
 *
 *   Plugin v1.18.x: accepts EITHER a valid signature OR the legacy hash.
 *   Plugin v1.19.0: rejects legacy hash; signed-only.
 *
 * The signing secret is provisioned by the backend via the one-time
 * `/bootstrap-signing-secret` REST route, called by the dashboard during
 * the v1.18.0 → v1.18.1 upgrade. It is stored in `mm_options['signing_secret']`.
 */
class MM_Hmac {

	const TIMESTAMP_TOLERANCE = 300; // 5 minutes
	const NONCE_TRANSIENT_PREFIX = 'mm_nonce_';
	const NONCE_TTL = 600; // 10 minutes — must exceed TIMESTAMP_TOLERANCE * 2

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes() {
		// One-time bootstrap: backend pushes the signing secret to the plugin.
		// Guarded by the LEGACY hash credential — this is the single transitional
		// call where the legacy credential is intentionally accepted.
		register_rest_route( 'actv-trkr/v1', '/bootstrap-signing-secret', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'bootstrap_route' ),
			'permission_callback' => array( __CLASS__, 'verify_bootstrap_legacy' ),
		) );
	}

	/**
	 * Permission callback for the bootstrap route — accepts the legacy hash
	 * credential ONLY (not HMAC, since the secret hasn't been provisioned yet).
	 * Once a signing_secret is stored, this route refuses further calls so an
	 * attacker cannot rotate the secret without admin intervention.
	 */
	public static function verify_bootstrap_legacy( $request ) {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) {
			return new WP_Error( 'not_configured', 'Plugin not configured', array( 'status' => 400 ) );
		}
		// Lock-out: refuse to overwrite an existing secret.
		if ( ! empty( $opts['signing_secret'] ) ) {
			return new WP_Error( 'already_provisioned', 'Signing secret already set', array( 'status' => 409 ) );
		}
		$auth = $request->get_header( 'X-Api-Key' );
		if ( empty( $auth ) ) {
			$body = $request->get_json_params();
			$auth = is_array( $body ) && isset( $body['key_hash'] ) ? (string) $body['key_hash'] : '';
		}
		if ( empty( $auth ) ) {
			return new WP_Error( 'unauthorized', 'Missing credential', array( 'status' => 401 ) );
		}
		$stored_hash = hash( 'sha256', $opts['api_key'] );
		if ( hash_equals( $opts['api_key'], $auth ) || hash_equals( $stored_hash, $auth ) ) {
			return true;
		}
		return new WP_Error( 'forbidden', 'Invalid credential', array( 'status' => 403 ) );
	}

	/**
	 * Verify a signed request. Returns true on success, WP_Error on failure.
	 * Returns null if no signing headers are present (caller decides whether
	 * to fall back to the legacy hash check).
	 */
	public static function verify( $request ) {
		$ts  = $request->get_header( 'X-Actv-Timestamp' );
		$non = $request->get_header( 'X-Actv-Nonce' );
		$sig = $request->get_header( 'X-Actv-Signature' );

		if ( empty( $ts ) && empty( $non ) && empty( $sig ) ) {
			return null; // No signature attempted.
		}
		if ( empty( $ts ) || empty( $non ) || empty( $sig ) ) {
			return new WP_Error( 'mm_signed_incomplete', 'Incomplete signed-request headers', array( 'status' => 400 ) );
		}

		$ts_int = absint( $ts );
		if ( $ts_int <= 0 ) {
			return new WP_Error( 'mm_signed_bad_ts', 'Invalid timestamp', array( 'status' => 400 ) );
		}
		$drift = abs( time() - $ts_int );
		if ( $drift > self::TIMESTAMP_TOLERANCE ) {
			return new WP_Error( 'mm_signed_skew', 'Timestamp outside tolerance', array( 'status' => 401 ) );
		}

		// Nonce must be hex-only and not previously seen.
		if ( ! preg_match( '/^[a-f0-9]{16,64}$/i', $non ) ) {
			return new WP_Error( 'mm_signed_bad_nonce', 'Invalid nonce format', array( 'status' => 400 ) );
		}
		$nonce_key = self::NONCE_TRANSIENT_PREFIX . hash( 'sha256', $non );
		if ( get_transient( $nonce_key ) ) {
			return new WP_Error( 'mm_signed_replay', 'Nonce replay detected', array( 'status' => 401 ) );
		}

		$secret = self::get_signing_secret();
		if ( empty( $secret ) ) {
			// No secret provisioned yet — caller must fall back to legacy hash.
			return null;
		}

		$body     = $request->get_body();
		$expected = hash_hmac( 'sha256', $ts . "\n" . $non . "\n" . (string) $body, $secret );
		if ( ! hash_equals( $expected, strtolower( $sig ) ) ) {
			return new WP_Error( 'mm_signed_mismatch', 'Signature mismatch', array( 'status' => 403 ) );
		}

		// Mark nonce as seen (TTL > 2× drift tolerance).
		set_transient( $nonce_key, 1, self::NONCE_TTL );
		return true;
	}

	public static function get_signing_secret() {
		$opts = MM_Settings::get();
		return isset( $opts['signing_secret'] ) ? (string) $opts['signing_secret'] : '';
	}

	/**
	 * REST callback: store the signing secret provisioned by the backend.
	 * This route is itself guarded by the LEGACY hash credential — it is
	 * the one bootstrap call where the legacy credential is required.
	 */
	public static function bootstrap_route( $request ) {
		$body = $request->get_json_params();
		$incoming = isset( $body['signing_secret'] ) ? (string) $body['signing_secret'] : '';
		if ( ! preg_match( '/^[a-f0-9]{32,128}$/', $incoming ) ) {
			return new WP_Error( 'bad_secret', 'Invalid signing secret format', array( 'status' => 400 ) );
		}
		$opts = MM_Settings::get();
		$opts['signing_secret'] = $incoming;
		update_option( MM_Settings::OPTION_NAME, $opts );
		return rest_ensure_response( array( 'ok' => true ) );
	}
}
