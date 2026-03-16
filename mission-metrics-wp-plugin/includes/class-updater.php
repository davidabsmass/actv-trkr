<?php
/**
 * Self-hosted plugin updater.
 *
 * Hooks into WordPress's plugin update system to check our backend
 * for newer versions and show update notices in wp-admin.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MM_Updater {

	const SLUG        = 'actv-trkr/actv-trkr.php';
	const TRANSIENT   = 'mm_update_data';
	const CHECK_HOURS = 1;

	public static function init() {
		add_filter( 'pre_set_site_transient_update_plugins', array( __CLASS__, 'check_update' ) );
		add_filter( 'plugins_api', array( __CLASS__, 'plugin_info' ), 20, 3 );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'row_meta' ), 10, 2 );

		// Force-clear update transient when viewing the plugins page
		add_action( 'load-plugins.php', array( __CLASS__, 'force_check' ) );
		add_action( 'load-options-general.php', array( __CLASS__, 'force_check' ) );
	}

	/**
	 * Clear the cached update transient so the next check is fresh.
	 */
	public static function force_check() {
		delete_transient( self::TRANSIENT );
	}

	/**
	 * Build the update-check endpoint URL.
	 */
	private static function endpoint() {
		$opts = MM_Settings::get();
		return rtrim( $opts['endpoint_url'], '/' ) . '/plugin-update-check';
	}

	/**
	 * Check our backend for a newer version.
	 */
	public static function check_update( $transient ) {
		if ( empty( $transient->checked ) ) {
			return $transient;
		}

		$remote = self::get_remote_data();
		if ( ! $remote || empty( $remote['has_update'] ) ) {
			return $transient;
		}

		$package     = ! empty( $remote['download_url'] ) ? $remote['download_url'] : '';

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

	/**
	 * Show plugin info in the WordPress "View details" modal.
	 */
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

	/**
	 * Add a "Check for updates" link on the plugins page.
	 */
	public static function row_meta( $links, $file ) {
		if ( $file !== self::SLUG ) {
			return $links;
		}
		$links[] = '<a href="' . esc_url( admin_url( 'options-general.php?page=actv-trkr' ) ) . '">Settings</a>';
		return $links;
	}

	/**
	 * Fetch update data from our backend (cached).
	 */
	private static function get_remote_data() {
		$cached = get_transient( self::TRANSIENT );
		if ( $cached !== false ) {
			return $cached;
		}

		$domain  = wp_parse_url( home_url(), PHP_URL_HOST );
		$url     = self::endpoint() . '?' . http_build_query( array(
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

	/**
	 * Fetch full plugin info from our backend.
	 */
	private static function get_remote_info() {
		$url      = self::endpoint() . '?action=info';
		$response = wp_remote_get( $url, array( 'timeout' => 10 ) );
		if ( is_wp_error( $response ) ) {
			return null;
		}
		return json_decode( wp_remote_retrieve_body( $response ), true );
	}
}
