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
