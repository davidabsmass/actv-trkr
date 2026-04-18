<?php
/**
 * Activation + runtime preflight checks.
 *
 * Runs on plugin activation (hard-abort on critical failures) and on every
 * boot (soft-degrade — surfaces issues without crashing). Distinct from
 * ACTV_Environment which only checks PHP/WP versions and extensions; this
 * class checks WordPress capabilities the plugin actively depends on:
 * options, transients, custom tables, REST registration, cron.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Preflight {

	const ACTIVATION_RESULT_OPTION = 'actv_trkr_activation_result';
	const RUNTIME_RESULT_TRANSIENT = 'actv_trkr_runtime_preflight';
	const RUNTIME_TTL              = 3600; // re-run hourly at most

	/**
	 * Activation check. Hard-aborts only on truly critical conditions:
	 *   - PHP/WP version unmet
	 *   - cannot write to wp_options
	 *   - cannot create custom tables
	 *
	 * Non-critical issues (REST/cron) are recorded but allowed; they will
	 * downgrade the runtime mode to reduced_mode rather than block activation.
	 *
	 * @return array { ok: bool, critical: string[], warnings: string[] }
	 */
	public static function run_activation() {
		$critical = array();
		$warnings = array();

		// 1. Environment baseline (PHP/WP/extensions).
		if ( class_exists( 'ACTV_Environment' ) ) {
			$env = ACTV_Environment::check();
			foreach ( $env as $msg ) {
				$critical[] = $msg;
			}
		}

		// 2. Options write probe.
		$probe_key = 'actv_trkr_preflight_probe_' . wp_generate_password( 8, false );
		$probe_val = (string) time();
		$set_ok    = update_option( $probe_key, $probe_val, false );
		$read_back = get_option( $probe_key, null );
		delete_option( $probe_key );
		if ( ! $set_ok || $read_back !== $probe_val ) {
			$critical[] = 'Cannot read/write WordPress options (database may be read-only).';
		}

		// 3. Transient probe.
		$tprobe = 'actv_trkr_preflight_t_' . wp_generate_password( 8, false );
		set_transient( $tprobe, '1', 30 );
		$tread = get_transient( $tprobe );
		delete_transient( $tprobe );
		if ( $tread !== '1' ) {
			$warnings[] = 'Transient storage is unreliable; some caching features may misbehave.';
		}

		// 4. Custom-table create probe (use the logger table — it's the only one
		// the foundation needs). Failure here is critical: nothing can be logged.
		try {
			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::create_table();
				global $wpdb;
				$tbl    = ACTV_Logger::table_name();
				$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $tbl ) );
				if ( $exists !== $tbl ) {
					$critical[] = 'Cannot create plugin database tables (insufficient MySQL privileges).';
				}
			}
		} catch ( \Throwable $e ) {
			$critical[] = 'Database table creation failed: ' . $e->getMessage();
		}

		// 5. REST API availability (warning only — many sites disable REST).
		if ( ! function_exists( 'register_rest_route' ) ) {
			$warnings[] = 'WordPress REST API is unavailable; remote sync features will be disabled.';
		}

		// 6. wp-cron availability (warning only — many sites use system cron).
		if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
			$warnings[] = 'WP-Cron is disabled; ensure system cron is configured to hit wp-cron.php.';
		}

		$result = array(
			'ok'        => empty( $critical ),
			'critical'  => $critical,
			'warnings'  => $warnings,
			'checked_at' => gmdate( 'c' ),
		);

		update_option( self::ACTIVATION_RESULT_OPTION, $result, false );

		if ( class_exists( 'ACTV_Logger' ) ) {
			try {
				if ( ! empty( $critical ) ) {
					ACTV_Logger::fatal( 'core', 'activation_preflight_failed', $result );
				} elseif ( ! empty( $warnings ) ) {
					ACTV_Logger::warn( 'core', 'activation_preflight_warnings', $result );
				} else {
					ACTV_Logger::info( 'core', 'activation_preflight_ok', $result );
				}
			} catch ( \Throwable $e ) {
				// best-effort.
			}
		}

		return $result;
	}

	/**
	 * Runtime preflight — cached. Called from bootstrap; light-touch.
	 *
	 * @return array { ok, critical, warnings }
	 */
	public static function run_runtime() {
		$cached = get_transient( self::RUNTIME_RESULT_TRANSIENT );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$critical = array();
		$warnings = array();

		// Environment.
		if ( class_exists( 'ACTV_Environment' ) ) {
			foreach ( ACTV_Environment::check() as $msg ) {
				$critical[] = $msg;
			}
		}

		// Logger table presence (don't try to create — that's activation's job).
		try {
			if ( class_exists( 'ACTV_Logger' ) ) {
				global $wpdb;
				$tbl    = ACTV_Logger::table_name();
				$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $tbl ) );
				if ( $exists !== $tbl ) {
					$warnings[] = 'Health log table missing — will attempt recreation.';
					ACTV_Logger::create_table();
				}
			}
		} catch ( \Throwable $e ) {
			$warnings[] = 'Health log probe failed: ' . $e->getMessage();
		}

		$result = array(
			'ok'         => empty( $critical ),
			'critical'   => $critical,
			'warnings'   => $warnings,
			'checked_at' => gmdate( 'c' ),
		);

		set_transient( self::RUNTIME_RESULT_TRANSIENT, $result, self::RUNTIME_TTL );
		return $result;
	}

	/**
	 * Last activation result (for admin UI / diagnostics).
	 *
	 * @return array|null
	 */
	public static function last_activation_result() {
		$r = get_option( self::ACTIVATION_RESULT_OPTION, null );
		return is_array( $r ) ? $r : null;
	}
}
