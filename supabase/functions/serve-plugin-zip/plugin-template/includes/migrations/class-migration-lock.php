<?php
/**
 * Migration lock — prevents two requests from running migrations concurrently.
 *
 * Uses a non-autoloaded option as the lock store (transients can be evicted
 * by object cache plugins mid-migration, which is exactly what we want to
 * avoid). Includes a TTL so a crashed holder can't lock the system forever.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Migration_Lock {

	const OPTION_KEY = 'actv_trkr_migration_lock';
	const TTL_SECONDS = 300; // 5 min — longer than any sane migration

	/**
	 * Try to acquire the lock. Returns a token on success, false on failure.
	 *
	 * @return string|false
	 */
	public static function acquire() {
		$existing = get_option( self::OPTION_KEY, null );
		if ( is_array( $existing ) && isset( $existing['expires_at'] ) ) {
			if ( (int) $existing['expires_at'] > time() ) {
				return false; // Held by someone else, not yet expired.
			}
			// Expired — fall through and overwrite.
		}

		$token = wp_generate_password( 24, false );
		$ok    = update_option( self::OPTION_KEY, array(
			'token'      => $token,
			'acquired_at' => time(),
			'expires_at' => time() + self::TTL_SECONDS,
		), false );

		return $ok ? $token : false;
	}

	/**
	 * Release the lock if we hold it.
	 *
	 * @param string $token
	 */
	public static function release( $token ) {
		$existing = get_option( self::OPTION_KEY, null );
		if ( is_array( $existing ) && isset( $existing['token'] ) && hash_equals( (string) $existing['token'], (string) $token ) ) {
			delete_option( self::OPTION_KEY );
		}
	}

	/**
	 * Force-release without token (CLI emergency).
	 */
	public static function force_release() {
		delete_option( self::OPTION_KEY );
	}

	/**
	 * Inspect current lock holder.
	 *
	 * @return array|null
	 */
	public static function status() {
		$v = get_option( self::OPTION_KEY, null );
		return is_array( $v ) ? $v : null;
	}
}
