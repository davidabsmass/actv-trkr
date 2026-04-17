<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * MM_Ingest_Token — manages the narrow-scope ingest token used by tracker.js.
 *
 * Why this exists (v1.9.17+):
 *   Prior to v1.9.17 the WordPress plugin embedded the org's *admin* API key
 *   directly into page source via wp_localize_script (`mmConfig.apiKey`).
 *   That key has broad authority — magic-login requests, settings sync,
 *   ingest, etc. — so exposing it in HTML was a serious credential leak.
 *
 *   This helper requests a separate, *site-bound, ingest-only* token from
 *   the ACTV TRKR backend. That token is what the in-page tracker uses.
 *   It can ONLY hit the public ingestion endpoints and cannot be replayed
 *   against any privileged endpoint.
 *
 * Lifecycle:
 *   - Lazy-minted on first use, cached in a WP option (`mm_ingest_token`).
 *   - Auto-refreshed if the cached token is older than 30 days, the cached
 *     domain has changed, or the backend rejects it (handled at next mint).
 *   - Server-to-server only — the admin API key is sent in PHP request
 *     headers and never reaches the browser.
 */
class MM_Ingest_Token {

	const OPTION_KEY     = 'mm_ingest_token';
	const REFRESH_AFTER  = 2592000; // 30 days

	/**
	 * Return a usable ingest token for this site, minting one if necessary.
	 *
	 * @return string|null token on success, null if minting failed (caller
	 *                     should suppress tracker output to avoid embedding
	 *                     the admin key as a fallback).
	 */
	public static function get() {
		$cached = get_option( self::OPTION_KEY );
		$domain = self::current_domain();

		if ( is_array( $cached )
			&& ! empty( $cached['token'] )
			&& ! empty( $cached['domain'] )
			&& strtolower( $cached['domain'] ) === strtolower( $domain )
			&& ! empty( $cached['minted_at'] )
			&& ( time() - intval( $cached['minted_at'] ) ) < self::REFRESH_AFTER
		) {
			return $cached['token'];
		}

		return self::mint();
	}

	/**
	 * Force re-mint (called when the backend rejects the current token, or
	 * from an admin "rotate ingest token" action). Returns the new token
	 * on success, or null on failure.
	 */
	public static function mint() {
		$opts     = MM_Settings::get();
		$endpoint = rtrim( $opts['endpoint_url'] ?? '', '/' );
		$api_key  = $opts['api_key'] ?? '';
		$domain   = self::current_domain();

		if ( empty( $endpoint ) || empty( $api_key ) || empty( $domain ) ) {
			return null;
		}

		$response = wp_remote_post( $endpoint . '/issue-site-ingest-token', array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type' => 'application/json',
				'X-Api-Key'    => $api_key,
			),
			'body'    => wp_json_encode( array( 'domain' => $domain ) ),
		) );

		if ( is_wp_error( $response ) ) {
			return null;
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return null;
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || empty( $data['ingest_token'] ) ) {
			return null;
		}

		$token = preg_replace( '/[^a-f0-9]/i', '', (string) $data['ingest_token'] );
		if ( strlen( $token ) < 32 ) {
			return null;
		}

		update_option( self::OPTION_KEY, array(
			'token'     => $token,
			'domain'    => $domain,
			'site_id'   => isset( $data['site_id'] ) ? (string) $data['site_id'] : '',
			'minted_at' => time(),
		), false );

		return $token;
	}

	/**
	 * Clear the cached token. Used when the API key changes or on manual rotation.
	 */
	public static function clear() {
		delete_option( self::OPTION_KEY );
	}

	private static function current_domain() {
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		if ( ! $host ) return '';
		return strtolower( preg_replace( '/^www\./i', '', $host ) );
	}
}
