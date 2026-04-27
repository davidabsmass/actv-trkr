<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Signal – WP-Cron only.
 */
class MM_Heartbeat {

	public static function init() {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) return;
		if ( empty( $opts['enable_heartbeat'] ) || $opts['enable_heartbeat'] !== '1' ) return;

		// Front-end signal is intentionally disabled so visitor requests stay untouched.

		// WP-Cron fallback every 5 min
		add_action( 'mm_heartbeat_cron', array( __CLASS__, 'send_cron_heartbeat' ) );
		if ( ! wp_next_scheduled( 'mm_heartbeat_cron' ) ) {
			wp_schedule_event( time(), 'mm_every_5_min', 'mm_heartbeat_cron' );
		}
	}

	public static function enqueue_beacon() {
		return;
	}

	/**
	 * Collect WP environment details for the cron signal.
	 */
	private static function get_wp_environment() {
		$env = array(
			'php_version' => PHP_VERSION,
			'wp_version'  => get_bloginfo( 'version' ),
		);

		// Active theme
		$theme = wp_get_theme();
		if ( $theme->exists() ) {
			$env['theme_name']    = $theme->get( 'Name' );
			$env['theme_version'] = $theme->get( 'Version' );
		}

		// Active plugins
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$all_plugins    = get_plugins();
		$active_slugs   = get_option( 'active_plugins', array() );
		$active_plugins = array();

		foreach ( $active_slugs as $slug ) {
			if ( isset( $all_plugins[ $slug ] ) ) {
				$p = $all_plugins[ $slug ];
				$active_plugins[] = array(
					'slug'    => $slug,
					'name'    => $p['Name'],
					'version' => $p['Version'],
				);
			}
		}
		$env['active_plugins'] = $active_plugins;

		// Plugin updates available
		$update_plugins = get_site_transient( 'update_plugins' );
		$plugin_updates = array();
		if ( $update_plugins && ! empty( $update_plugins->response ) ) {
			foreach ( $update_plugins->response as $slug => $info ) {
				$name = isset( $all_plugins[ $slug ] ) ? $all_plugins[ $slug ]['Name'] : $slug;
				$plugin_updates[] = array(
					'slug'        => $slug,
					'name'        => $name,
					'new_version' => isset( $info->new_version ) ? $info->new_version : '',
				);
			}
		}
		$env['plugin_updates'] = $plugin_updates;

		// Core update available
		$update_core = get_site_transient( 'update_core' );
		if ( $update_core && ! empty( $update_core->updates ) ) {
			foreach ( $update_core->updates as $update ) {
				if ( $update->response === 'upgrade' ) {
					$env['core_update_available'] = $update->current;
					break;
				}
			}
		}

		return $env;
	}

	public static function send_cron_heartbeat() {
		$opts = MM_Settings::get();
		if ( empty( $opts['api_key'] ) ) return;

		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-heartbeat';
		$domain   = wp_parse_url( home_url(), PHP_URL_HOST );
		$env      = self::get_wp_environment();

		wp_remote_post( $endpoint, array(
			'timeout' => 15,
			'headers' => array(
				'Content-Type'   => 'application/json',
				'x-actvtrkr-key' => $opts['api_key'],
			),
			'body' => wp_json_encode( array(
				'domain'         => $domain,
				'source'         => 'cron',
				'plugin_version' => MM_PLUGIN_VERSION,
				'wp_environment' => $env,
				// F-6 (Phase 0): php_version + wp_version are already inside
				// $env (wp_environment); the duplicate `meta` block was removed.
			) ),
		) );
	}
}
