<?php
/**
 * ACTV_Safe_HTTP
 *
 * Thin wrapper around wp_remote_* that:
 *   - Routes the call through ACTV_Circuit_Breaker::guard() under a named key.
 *   - Treats WP_Error and HTTP >= 500 as failures (counts toward tripping).
 *   - Returns a WP_Error sentinel ('actv_breaker_open') when the breaker is
 *     open OR the call fails, so existing callers that check is_wp_error()
 *     keep working unchanged.
 *
 * NOTE: This is intentionally a passive shim. Hot-path, fire-and-forget
 * ingest calls (form ingest, heartbeat) keep their existing wp_remote_post()
 * usage — guarding them with breakers would suppress legitimate retries.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Safe_HTTP {

	/**
	 * Guarded POST.
	 *
	 * @param string $breaker_key One of ACTV_Circuit_Breaker::configs() keys.
	 * @param string $url
	 * @param array  $args        Standard wp_remote_post args.
	 * @return array|\WP_Error
	 */
	public static function post( $breaker_key, $url, array $args = array() ) {
		return self::guard( $breaker_key, function () use ( $url, $args ) {
			return wp_remote_post( $url, $args );
		} );
	}

	/**
	 * Guarded GET.
	 *
	 * @param string $breaker_key
	 * @param string $url
	 * @param array  $args
	 * @return array|\WP_Error
	 */
	public static function get( $breaker_key, $url, array $args = array() ) {
		return self::guard( $breaker_key, function () use ( $url, $args ) {
			return wp_remote_get( $url, $args );
		} );
	}

	/**
	 * Internal guard wrapper that returns a WP_Error sentinel on
	 * trip / failure so callers can check is_wp_error() uniformly.
	 *
	 * @param string   $breaker_key
	 * @param callable $fn
	 * @return array|\WP_Error
	 */
	private static function guard( $breaker_key, callable $fn ) {
		// Defensive: if the breaker class isn't loaded, run the call directly.
		if ( ! class_exists( 'ACTV_Circuit_Breaker' ) ) {
			try {
				return $fn();
			} catch ( \Throwable $e ) {
				return new \WP_Error( 'actv_call_threw', $e->getMessage() );
			}
		}

		$fallback = new \WP_Error(
			'actv_breaker_open',
			sprintf( 'ACTV TRKR breaker "%s" is open or call failed', $breaker_key )
		);

		$result = ACTV_Circuit_Breaker::guard( $breaker_key, $fn, $fallback );

		// If breaker returned the fallback (open or threw), normalise to WP_Error.
		if ( $result === $fallback ) {
			return $fallback;
		}
		return $result;
	}

	/**
	 * Convenience: is this WP_Error our open-breaker sentinel?
	 */
	public static function is_breaker_open( $maybe_error ) {
		return is_wp_error( $maybe_error )
			&& $maybe_error->get_error_code() === 'actv_breaker_open';
	}
}
