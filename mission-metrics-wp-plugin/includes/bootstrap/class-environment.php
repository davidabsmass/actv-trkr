<?php
/**
 * Environment validation — pure, side-effect free.
 *
 * Runs before any feature module loads. If any required check fails,
 * the bootstrap will skip risky modules and surface an admin notice.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Environment {

	const MIN_PHP_VERSION = '7.4';
	const MIN_WP_VERSION  = '6.0';

	/**
	 * Required PHP extensions.
	 */
	const REQUIRED_EXTENSIONS = array( 'json', 'mbstring' );

	/**
	 * Run all checks. Returns array of failure messages (empty array = healthy).
	 *
	 * @return string[]
	 */
	public static function check() {
		$failures = array();

		// PHP version.
		if ( version_compare( PHP_VERSION, self::MIN_PHP_VERSION, '<' ) ) {
			$failures[] = sprintf(
				'PHP %s or higher is required (running %s).',
				self::MIN_PHP_VERSION,
				PHP_VERSION
			);
		}

		// WordPress version.
		if ( function_exists( 'get_bloginfo' ) ) {
			$wp_version = get_bloginfo( 'version' );
			if ( $wp_version && version_compare( $wp_version, self::MIN_WP_VERSION, '<' ) ) {
				$failures[] = sprintf(
					'WordPress %s or higher is required (running %s).',
					self::MIN_WP_VERSION,
					$wp_version
				);
			}
		}

		// Required PHP extensions.
		foreach ( self::REQUIRED_EXTENSIONS as $ext ) {
			if ( ! extension_loaded( $ext ) ) {
				$failures[] = sprintf( 'PHP extension "%s" is required.', $ext );
			}
		}

		// Database connectivity (lightweight check — wpdb already loaded by this point).
		global $wpdb;
		if ( ! isset( $wpdb ) || ! is_object( $wpdb ) ) {
			$failures[] = 'WordPress database connection is unavailable.';
		}

		return $failures;
	}

	/**
	 * Snapshot of environment for diagnostics. Safe to log — no secrets.
	 *
	 * @return array
	 */
	public static function snapshot() {
		global $wpdb;

		return array(
			'php_version'    => PHP_VERSION,
			'wp_version'     => function_exists( 'get_bloginfo' ) ? get_bloginfo( 'version' ) : null,
			'mysql_version'  => isset( $wpdb ) && is_object( $wpdb ) && method_exists( $wpdb, 'db_version' ) ? $wpdb->db_version() : null,
			'memory_limit'   => ini_get( 'memory_limit' ),
			'max_execution'  => ini_get( 'max_execution_time' ),
			'extensions'     => array_values( array_filter( self::REQUIRED_EXTENSIONS, 'extension_loaded' ) ),
			'is_multisite'   => function_exists( 'is_multisite' ) ? is_multisite() : false,
			'wp_debug'       => defined( 'WP_DEBUG' ) && WP_DEBUG,
		);
	}
}
