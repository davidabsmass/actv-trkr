<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * MM_Ingest_Token — see canonical implementation in mission-metrics-wp-plugin.
 * (Mirror copy used by serve-plugin-zip when building the downloadable ZIP.)
 */
class MM_Ingest_Token {

	const OPTION_KEY    = 'mm_ingest_token';
	const REFRESH_AFTER = 2592000; // 30 days

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

		if ( is_wp_error( $response ) ) return null;

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) return null;

		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || empty( $data['ingest_token'] ) ) return null;

		$token = preg_replace( '/[^a-f0-9]/i', '', (string) $data['ingest_token'] );
		if ( strlen( $token ) < 32 ) return null;

		update_option( self::OPTION_KEY, array(
			'token'     => $token,
			'domain'    => $domain,
			'site_id'   => isset( $data['site_id'] ) ? (string) $data['site_id'] : '',
			'minted_at' => time(),
		), false );

		return $token;
	}

	public static function clear() {
		delete_option( self::OPTION_KEY );
	}

	private static function current_domain() {
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		if ( ! $host ) return '';
		return strtolower( preg_replace( '/^www\./i', '', $host ) );
	}
}
