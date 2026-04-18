<?php
/**
 * MM_Health_Reporter — fleet telemetry beacon.
 *
 * Sends a single, low-volume snapshot of plugin crash-containment state to the
 * dashboard once per day so operators can see which sites are stuck in
 * reduced_mode or migration_locked across the entire fleet.
 *
 * Wire characteristics:
 *   - WP-Cron only. No frontend traffic. No blocking calls on admin pages.
 *   - Daily, jittered by site (hash of siteurl) so we don't all-fire at midnight.
 *   - No PII. No log bodies. Counters and version strings only.
 *   - Best-effort: any error is swallowed; the host site never sees it.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MM_Health_Reporter {

	const CRON_HOOK = 'actv_trkr_health_report_cron';
	const LAST_SENT_OPTION = 'actv_trkr_health_report_last_sent';

	public static function init() {
		add_action( self::CRON_HOOK, array( __CLASS__, 'send_report' ) );

		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			// Spread sites across the day using siteurl hash → 0-86399 second offset.
			$offset = abs( crc32( get_option( 'siteurl', 'unknown' ) ) ) % DAY_IN_SECONDS;
			wp_schedule_event( time() + $offset, 'daily', self::CRON_HOOK );
		}
	}

	/**
	 * Build and send the daily health report.
	 * Called by WP-Cron. Always returns void; never throws.
	 */
	public static function send_report() {
		try {
			$payload = self::build_payload();
			if ( empty( $payload ) ) {
				return;
			}

			$opts     = class_exists( 'MM_Settings' ) ? MM_Settings::get() : array();
			$api_key  = isset( $opts['api_key'] ) ? trim( (string) $opts['api_key'] ) : '';
			$endpoint = isset( $opts['endpoint_url'] ) ? rtrim( (string) $opts['endpoint_url'], '/' ) : '';
			if ( $api_key === '' || $endpoint === '' ) {
				return;
			}

			$url = $endpoint . '/plugin-health-report';

			// Use SafeHTTP if available (respects circuit breakers + timeouts).
			$args = array(
				'method'  => 'POST',
				'timeout' => 10,
				'headers' => array(
					'Content-Type' => 'application/json',
					'x-api-key'    => $api_key,
				),
				'body'    => wp_json_encode( $payload ),
			);

			$response = null;
			if ( class_exists( 'ACTV_Safe_HTTP' ) ) {
				$response = ACTV_Safe_HTTP::request( $url, $args );
			} else {
				$response = wp_remote_post( $url, $args );
			}

			$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
			update_option( self::LAST_SENT_OPTION, array(
				'at'   => time(),
				'code' => $code,
				'mode' => $payload['mode'] ?? 'unknown',
			), false );

			if ( class_exists( 'ACTV_Logger' ) ) {
				if ( is_wp_error( $response ) ) {
					ACTV_Logger::warn( 'core', 'health_report_failed', array(
						'error' => $response->get_error_message(),
					) );
				} elseif ( $code >= 400 ) {
					ACTV_Logger::warn( 'core', 'health_report_rejected', array(
						'code' => $code,
					) );
				} else {
					ACTV_Logger::info( 'core', 'health_report_sent', array(
						'code' => $code,
						'mode' => $payload['mode'] ?? 'unknown',
					) );
				}
			}
		} catch ( \Throwable $e ) {
			// Best-effort. Telemetry must never break the site.
			if ( class_exists( 'ACTV_Logger' ) ) {
				try {
					ACTV_Logger::error( 'core', 'health_report_exception', array(
						'message' => $e->getMessage(),
					) );
				} catch ( \Throwable $inner ) {
					// Truly nothing we can do.
				}
			}
		}
	}

	/**
	 * Compose the telemetry payload from local recovery state.
	 *
	 * @return array
	 */
	private static function build_payload() {
		$snapshot = class_exists( 'ACTV_Recovery' ) ? ACTV_Recovery::status() : array( 'ok' => false );
		if ( empty( $snapshot['ok'] ) ) {
			return array();
		}

		$boot = isset( $snapshot['boot_counter'] ) && is_array( $snapshot['boot_counter'] )
			? $snapshot['boot_counter']
			: array();

		$mig = isset( $snapshot['migration'] ) && is_array( $snapshot['migration'] )
			? $snapshot['migration']
			: array();

		$mig_lock = isset( $mig['lock'] ) && is_array( $mig['lock'] ) ? $mig['lock'] : array();

		// Derive disabled / open lists.
		$disabled_modules = array();
		if ( ! empty( $snapshot['modules'] ) && is_array( $snapshot['modules'] ) ) {
			foreach ( $snapshot['modules'] as $key => $state ) {
				if ( is_array( $state ) && empty( $state['enabled'] ) ) {
					$disabled_modules[] = (string) $key;
				}
			}
		}

		$open_breakers = array();
		if ( ! empty( $snapshot['breakers'] ) && is_array( $snapshot['breakers'] ) ) {
			foreach ( $snapshot['breakers'] as $key => $bstate ) {
				if ( is_array( $bstate ) && ! empty( $bstate['tripped'] ) ) {
					$open_breakers[] = (string) $key;
				}
			}
		}

		$update_health = isset( $snapshot['update_health'] ) && is_array( $snapshot['update_health'] )
			? $snapshot['update_health']
			: array();

		$blocked_versions = array();
		if ( ! empty( $update_health['blocked_versions'] ) && is_array( $update_health['blocked_versions'] ) ) {
			$blocked_versions = array_map( 'strval', array_keys( $update_health['blocked_versions'] ) );
		}

		// Last error: scan the most recent state history for a reason field.
		$last_error = null;
		if ( ! empty( $snapshot['state_history'] ) && is_array( $snapshot['state_history'] ) ) {
			$recent = end( $snapshot['state_history'] );
			if ( is_array( $recent ) && ! empty( $recent['reason'] ) ) {
				$last_error = (string) $recent['reason'];
			}
		}

		$home = function_exists( 'home_url' ) ? home_url() : get_option( 'siteurl', '' );
		$host = wp_parse_url( $home, PHP_URL_HOST );

		return array(
			'domain'                => $host ? strtolower( $host ) : '',
			'plugin_version'        => $snapshot['version'] ?? '',
			'mode'                  => $snapshot['mode'] ?? 'unknown',
			'forced_safe_mode'      => ! empty( $snapshot['forced_safe_mode'] ),
			'boot_failure_count'    => isset( $boot['failure_count'] ) ? (int) $boot['failure_count'] : 0,
			'in_boot_loop'          => ! empty( $boot['in_loop'] ),
			'migration_version'     => isset( $mig['current_version'] ) ? (int) $mig['current_version'] : null,
			'migration_lock_held'   => ! empty( $mig_lock['held'] ),
			'disabled_modules'      => $disabled_modules,
			'open_breakers'         => $open_breakers,
			'last_error'            => $last_error,
			'blocked_versions'      => $blocked_versions,
			'last_healthy_version'  => isset( $update_health['last_healthy_version'] ) ? (string) $update_health['last_healthy_version'] : '',
		);
	}

	/**
	 * Clear the scheduled cron. Called on plugin deactivation.
	 */
	public static function deactivate() {
		$ts = wp_next_scheduled( self::CRON_HOOK );
		if ( $ts ) {
			wp_unschedule_event( $ts, self::CRON_HOOK );
		}
	}
}
