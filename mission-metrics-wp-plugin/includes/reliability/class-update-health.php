<?php
/**
 * Update health gate.
 *
 * Tracks which plugin versions have booted successfully on this site and
 * which have repeatedly failed. Used by the updater to refuse to re-install
 * a version that already bricked this site, and by Bootstrap to record
 * post-update health.
 *
 * Storage (single non-autoloaded option `actv_trkr_update_health`):
 *   {
 *     "last_healthy_version": "1.12.0",
 *     "current_version": "1.13.0",
 *     "current_install_at": 1730000000,
 *     "current_clean_boots": 4,
 *     "current_failure_boots": 0,
 *     "blocked_versions": {
 *       "1.13.1": { "blocked_at": 1730001234, "reason": "critical module failed: forms" }
 *     }
 *   }
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Update_Health {

	const OPTION_KEY = 'actv_trkr_update_health';

	// A version becomes "blocked" after this many failure-boots within the first
	// CONFIRM_WINDOW boots after install. After that, normal Mode/BootCounter
	// handling takes over.
	const FAIL_THRESHOLD = 2;
	const CONFIRM_WINDOW = 5;

	/**
	 * Read current state with defaults.
	 *
	 * @return array
	 */
	public static function state() {
		$default = array(
			'last_healthy_version'   => '',
			'current_version'        => defined( 'MM_PLUGIN_VERSION' ) ? MM_PLUGIN_VERSION : '',
			'current_install_at'    => 0,
			'current_clean_boots'    => 0,
			'current_failure_boots'  => 0,
			'blocked_versions'       => array(),
		);
		$v = get_option( self::OPTION_KEY, $default );
		if ( ! is_array( $v ) ) {
			return $default;
		}
		// Ensure blocked_versions is always an array.
		if ( ! isset( $v['blocked_versions'] ) || ! is_array( $v['blocked_versions'] ) ) {
			$v['blocked_versions'] = array();
		}
		return wp_parse_args( $v, $default );
	}

	private static function save( array $state ) {
		update_option( self::OPTION_KEY, $state, false );
	}

	/**
	 * Called at the start of every boot. Detects a version change (= upgrade
	 * just happened) and resets the per-version counters.
	 */
	public static function note_boot_started() {
		if ( ! defined( 'MM_PLUGIN_VERSION' ) ) {
			return;
		}
		$state   = self::state();
		$running = MM_PLUGIN_VERSION;

		if ( $state['current_version'] !== $running ) {
			// Version changed — record install moment.
			if ( class_exists( 'ACTV_Logger' ) ) {
				try {
					ACTV_Logger::info( 'core', 'version_changed', array(
						'from' => (string) $state['current_version'],
						'to'   => $running,
					) );
				} catch ( \Throwable $e ) {
					// best-effort.
				}
			}
			$state['current_version']       = $running;
			$state['current_install_at']    = time();
			$state['current_clean_boots']   = 0;
			$state['current_failure_boots'] = 0;
			self::save( $state );
		}
	}

	/**
	 * Record a clean boot — bumps the per-version success counter and may
	 * promote the running version to "last_healthy_version".
	 */
	public static function record_clean_boot() {
		if ( ! defined( 'MM_PLUGIN_VERSION' ) ) {
			return;
		}
		$state   = self::state();
		$running = MM_PLUGIN_VERSION;

		if ( $state['current_version'] !== $running ) {
			$state['current_version']       = $running;
			$state['current_install_at']    = time();
			$state['current_clean_boots']   = 0;
			$state['current_failure_boots'] = 0;
		}

		$state['current_clean_boots'] = (int) $state['current_clean_boots'] + 1;

		// Promote to last_healthy_version after 2 clean boots — enough to confirm
		// the install is real and not a one-off.
		if ( $state['current_clean_boots'] >= 2 && $state['last_healthy_version'] !== $running ) {
			$state['last_healthy_version'] = $running;
			if ( class_exists( 'ACTV_Logger' ) ) {
				try {
					ACTV_Logger::info( 'core', 'version_marked_healthy', array( 'version' => $running ) );
				} catch ( \Throwable $e ) {}
			}
		}
		self::save( $state );
	}

	/**
	 * Record a failure boot. If the running version exceeds FAIL_THRESHOLD
	 * within the first CONFIRM_WINDOW boots after install, block it.
	 *
	 * @param string $reason
	 */
	public static function record_failure_boot( $reason = '' ) {
		if ( ! defined( 'MM_PLUGIN_VERSION' ) ) {
			return;
		}
		$state   = self::state();
		$running = MM_PLUGIN_VERSION;

		if ( $state['current_version'] !== $running ) {
			$state['current_version']       = $running;
			$state['current_install_at']    = time();
			$state['current_clean_boots']   = 0;
			$state['current_failure_boots'] = 0;
		}
		$state['current_failure_boots'] = (int) $state['current_failure_boots'] + 1;

		$total_boots = $state['current_clean_boots'] + $state['current_failure_boots'];

		// Only auto-block while we're still in the early confirmation window.
		// After that, BootCounter/Mode handle it.
		if (
			$state['current_failure_boots'] >= self::FAIL_THRESHOLD
			&& $total_boots <= self::CONFIRM_WINDOW
			&& ! self::is_blocked( $running )
			// Never block our very first install when there's no known-good fallback.
			&& $state['last_healthy_version'] !== ''
		) {
			$state['blocked_versions'][ $running ] = array(
				'blocked_at' => time(),
				'reason'     => substr( (string) $reason, 0, 200 ),
			);
			if ( class_exists( 'ACTV_Logger' ) ) {
				try {
					ACTV_Logger::fatal( 'core', 'version_blocked', array(
						'version' => $running,
						'reason'  => $reason,
						'last_healthy' => $state['last_healthy_version'],
					) );
				} catch ( \Throwable $e ) {}
			}
		}

		self::save( $state );
	}

	/**
	 * Is this exact version on the local block list?
	 *
	 * @param string $version
	 * @return bool
	 */
	public static function is_blocked( $version ) {
		$state = self::state();
		return isset( $state['blocked_versions'][ $version ] );
	}

	/**
	 * Was the currently running version blocked? (i.e. do we need to scream
	 * at the admin to roll back?)
	 *
	 * @return bool
	 */
	public static function current_is_blocked() {
		if ( ! defined( 'MM_PLUGIN_VERSION' ) ) {
			return false;
		}
		return self::is_blocked( MM_PLUGIN_VERSION );
	}

	/**
	 * Remove a version from the block list (admin override).
	 *
	 * @param string $version
	 * @return bool true if it was present and removed.
	 */
	public static function unblock( $version ) {
		$state = self::state();
		if ( ! isset( $state['blocked_versions'][ $version ] ) ) {
			return false;
		}
		unset( $state['blocked_versions'][ $version ] );
		self::save( $state );
		if ( class_exists( 'ACTV_Logger' ) ) {
			try {
				ACTV_Logger::warn( 'core', 'version_unblocked', array( 'version' => $version ) );
			} catch ( \Throwable $e ) {}
		}
		return true;
	}

	/**
	 * Diagnostic snapshot for status output.
	 */
	public static function snapshot() {
		return self::state();
	}
}
