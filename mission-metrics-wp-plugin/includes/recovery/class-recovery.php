<?php
/**
 * Recovery API — central operator-facing escape hatches.
 *
 * Every method here is callable from WP-CLI (and could later be wired to an
 * admin page). They are intentionally side-effect-explicit and idempotent so
 * they're safe to run from a panicked operator's terminal at 2am.
 *
 * No method here should ever throw; failures are returned as structured
 * arrays so the CLI layer can format them.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Recovery {

	/**
	 * Build a full diagnostics snapshot of the plugin's current state.
	 *
	 * @return array
	 */
	public static function status() {
		try {
			$mode = class_exists( 'ACTV_Mode' ) ? ACTV_Mode::resolve() : 'unknown';
			$boot = class_exists( 'ACTV_Boot_Counter' ) ? ACTV_Boot_Counter::get() : array();
			$mig_status   = class_exists( 'ACTV_Migration_Runner' ) ? ACTV_Migration_Runner::status() : null;
			$mig_version  = class_exists( 'ACTV_Migration_Runner' ) ? ACTV_Migration_Runner::current_version() : 0;
			$mig_lock     = class_exists( 'ACTV_Migration_Lock' ) ? ACTV_Migration_Lock::status() : null;
			$breakers     = class_exists( 'ACTV_Circuit_Breaker' ) ? ACTV_Circuit_Breaker::snapshot() : array();
			$modules      = class_exists( 'ACTV_Module_Registry' ) ? ACTV_Module_Registry::load_state() : array();
			$history      = get_option( 'actv_trkr_state_history', array() );
			$update_health = class_exists( 'ACTV_Update_Health' ) ? ACTV_Update_Health::snapshot() : null;

			return array(
				'ok'      => true,
				'version' => defined( 'MM_PLUGIN_VERSION' ) ? MM_PLUGIN_VERSION : 'unknown',
				'mode'    => $mode,
				'forced_safe_mode' => defined( 'ACTV_TRKR_FORCE_SAFE_MODE' ) && ACTV_TRKR_FORCE_SAFE_MODE,
				'disabled_modules_const' => defined( 'ACTV_TRKR_DISABLE_MODULES' ) ? (string) ACTV_TRKR_DISABLE_MODULES : '',
				'boot_counter' => $boot,
				'migration' => array(
					'current_version' => $mig_version,
					'status'          => $mig_status,
					'lock'            => $mig_lock,
				),
				'breakers'      => $breakers,
				'modules'       => $modules,
				'state_history' => is_array( $history ) ? array_slice( $history, -10 ) : array(),
				'update_health' => $update_health,
			);
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Reset plugin to healthy mode, clear boot counter, and zero clean-boot count.
	 * Does NOT touch the migration lock or breakers.
	 *
	 * @return array
	 */
	public static function reset_state() {
		try {
			delete_option( 'actv_trkr_state' );
			delete_option( 'actv_trkr_boot_counter' );
			update_option( 'actv_trkr_clean_boot_count', 0, false );

			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::warn( 'core', 'recovery_reset_state', array( 'actor' => self::actor() ) );
			}
			return array( 'ok' => true, 'message' => 'Plugin state reset to healthy. Boot counter cleared.' );
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Force-release the migration lock.
	 *
	 * @return array
	 */
	public static function clear_migration_lock() {
		try {
			if ( class_exists( 'ACTV_Migration_Lock' ) ) {
				ACTV_Migration_Lock::force_release();
			}
			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::warn( 'core', 'recovery_clear_migration_lock', array( 'actor' => self::actor() ) );
			}
			return array( 'ok' => true, 'message' => 'Migration lock cleared.' );
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Replay pending migrations. Optionally exits migration_locked first.
	 *
	 * @param array $args { exit_locked?: bool }
	 * @return array
	 */
	public static function run_migrations( array $args = array() ) {
		try {
			$exit_locked = ! empty( $args['exit_locked'] );

			if ( $exit_locked && class_exists( 'ACTV_Mode' ) ) {
				ACTV_Mode::set( ACTV_Mode::HEALTHY, 'migration retry via recovery' );
			}

			if ( ! class_exists( 'ACTV_Migration_Runner' ) ) {
				return array( 'ok' => false, 'error' => 'Migration runner unavailable.' );
			}

			$dir = MM_PLUGIN_DIR . 'includes/migrations/versions';
			$res = ACTV_Migration_Runner::ensure_pending( $dir );

			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::warn( 'core', 'recovery_run_migrations', array(
					'actor'   => self::actor(),
					'applied' => $res['applied'] ?? array(),
					'error'   => $res['error'] ?? null,
				) );
			}

			return $res;
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Reset one or all circuit breakers.
	 *
	 * @param string|null $key Specific breaker name, or null for all.
	 * @return array
	 */
	public static function reset_breakers( $key = null ) {
		try {
			if ( ! class_exists( 'ACTV_Circuit_Breaker' ) ) {
				return array( 'ok' => false, 'error' => 'Circuit breaker unavailable.' );
			}
			if ( $key === null || $key === '' || $key === 'all' ) {
				delete_option( 'actv_trkr_breakers' );
				$msg = 'All circuit breakers reset.';
			} else {
				ACTV_Circuit_Breaker::reset( $key );
				$msg = sprintf( 'Breaker "%s" reset.', $key );
			}
			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::warn( 'core', 'recovery_reset_breakers', array(
					'actor' => self::actor(),
					'key'   => $key,
				) );
			}
			return array( 'ok' => true, 'message' => $msg );
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Disable a single module until re-enabled.
	 *
	 * @param string $key
	 * @return array
	 */
	public static function disable_module( $key ) {
		try {
			if ( ! class_exists( 'ACTV_Module_Registry' ) ) {
				return array( 'ok' => false, 'error' => 'Module registry unavailable.' );
			}
			$ok = ACTV_Module_Registry::set_enabled( $key, false );
			if ( ! $ok ) {
				return array( 'ok' => false, 'error' => sprintf( 'Unknown module: %s', $key ) );
			}
			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::warn( 'core', 'recovery_disable_module', array(
					'actor' => self::actor(),
					'key'   => $key,
				) );
			}
			return array( 'ok' => true, 'message' => sprintf( 'Module "%s" disabled. Will not load until re-enabled.', $key ) );
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Re-enable a previously-disabled module.
	 *
	 * @param string $key
	 * @return array
	 */
	public static function enable_module( $key ) {
		try {
			if ( ! class_exists( 'ACTV_Module_Registry' ) ) {
				return array( 'ok' => false, 'error' => 'Module registry unavailable.' );
			}
			$ok = ACTV_Module_Registry::set_enabled( $key, true );
			if ( ! $ok ) {
				return array( 'ok' => false, 'error' => sprintf( 'Unknown module: %s', $key ) );
			}
			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::warn( 'core', 'recovery_enable_module', array(
					'actor' => self::actor(),
					'key'   => $key,
				) );
			}
			return array( 'ok' => true, 'message' => sprintf( 'Module "%s" re-enabled.', $key ) );
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Remove a version from the local block list.
	 *
	 * @param string $version
	 * @return array
	 */
	public static function unblock_version( $version ) {
		try {
			if ( ! class_exists( 'ACTV_Update_Health' ) ) {
				return array( 'ok' => false, 'error' => 'Update health gate unavailable.' );
			}
			$version = trim( (string) $version );
			if ( $version === '' ) {
				return array( 'ok' => false, 'error' => 'Version is required.' );
			}
			$existed = ACTV_Update_Health::unblock( $version );
			if ( class_exists( 'ACTV_Logger' ) ) {
				ACTV_Logger::warn( 'core', 'recovery_unblock_version', array(
					'actor'   => self::actor(),
					'version' => $version,
					'existed' => $existed,
				) );
			}
			return array(
				'ok'      => true,
				'message' => $existed
					? sprintf( 'Version "%s" unblocked. Future update checks may now offer it.', $version )
					: sprintf( 'Version "%s" was not on the block list.', $version ),
			);
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}
	 *
	 * @param int $limit
	 * @return array
	 */
	public static function tail_log( $limit = 50 ) {
		try {
			if ( ! class_exists( 'ACTV_Logger' ) ) {
				return array( 'ok' => false, 'error' => 'Logger unavailable.', 'rows' => array() );
			}
			$rows = ACTV_Logger::tail( $limit );
			return array( 'ok' => true, 'rows' => $rows );
		} catch ( \Throwable $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage(), 'rows' => array() );
		}
	}

	/**
	 * Best-effort identification of who triggered a recovery action.
	 */
	private static function actor() {
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			return 'wp-cli';
		}
		if ( function_exists( 'wp_get_current_user' ) ) {
			$u = wp_get_current_user();
			if ( $u && ! empty( $u->user_login ) ) {
				return 'admin:' . $u->user_login;
			}
		}
		return 'unknown';
	}
}
