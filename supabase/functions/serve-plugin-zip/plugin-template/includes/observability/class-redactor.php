<?php
/**
 * Secret redaction for log/diagnostic output.
 *
 * Pattern-based scrubbing applied before any log entry is persisted
 * or any diagnostic bundle is exported. Conservative — when in doubt, redact.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Redactor {

	const PLACEHOLDER = '[REDACTED]';

	/**
	 * Keys whose values are always redacted regardless of value shape.
	 */
	const SENSITIVE_KEYS = array(
		'api_key', 'apikey', 'api-key',
		'token', 'access_token', 'refresh_token', 'ingest_token', 'auth_token',
		'password', 'pass', 'pwd', 'secret',
		'authorization', 'x-api-key', 'x-actvtrkr-api-key', 'x-ingest-token',
		'cookie', 'set-cookie',
		'private_key', 'client_secret',
		'nonce', '_wpnonce',
		'stripe_secret', 'sk_live_', 'sk_test_',
	);

	/**
	 * Recursively redact any array/object/string value.
	 *
	 * @param mixed $value
	 * @return mixed
	 */
	public static function scrub( $value ) {
		if ( is_array( $value ) ) {
			$out = array();
			foreach ( $value as $k => $v ) {
				if ( is_string( $k ) && self::is_sensitive_key( $k ) ) {
					$out[ $k ] = self::PLACEHOLDER;
				} else {
					$out[ $k ] = self::scrub( $v );
				}
			}
			return $out;
		}

		if ( is_object( $value ) ) {
			return self::scrub( (array) $value );
		}

		if ( is_string( $value ) ) {
			return self::scrub_string( $value );
		}

		return $value;
	}

	/**
	 * Check whether a key name looks sensitive.
	 *
	 * @param string $key
	 * @return bool
	 */
	private static function is_sensitive_key( $key ) {
		$lower = strtolower( $key );
		foreach ( self::SENSITIVE_KEYS as $needle ) {
			if ( strpos( $lower, $needle ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Strip obvious tokens/keys embedded in free-form strings.
	 *
	 * @param string $str
	 * @return string
	 */
	private static function scrub_string( $str ) {
		// Bearer tokens.
		$str = preg_replace( '/Bearer\s+[A-Za-z0-9._\-]+/i', 'Bearer ' . self::PLACEHOLDER, $str );
		// Long hex strings (likely API keys).
		$str = preg_replace( '/\b[a-f0-9]{40,}\b/i', self::PLACEHOLDER, $str );
		// JWT-shaped strings.
		$str = preg_replace( '/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/', self::PLACEHOLDER, $str );
		// Stripe-shaped secrets.
		$str = preg_replace( '/sk_(live|test)_[A-Za-z0-9]+/', self::PLACEHOLDER, $str );
		return $str;
	}
}
