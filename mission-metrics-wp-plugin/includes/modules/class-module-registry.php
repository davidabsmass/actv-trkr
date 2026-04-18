<?php
/**
 * Module registry — central isolation boundary.
 *
 * Holds all registered modules, tracks their health state, and boots
 * them in the right order while catching per-module failures.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Module_Registry {

	const STATE_OPTION_KEY = 'actv_trkr_module_state';

	/** @var ACTV_Module[] */
	private static $modules = array();

	/**
	 * Register a module instance. First-wins on duplicate key.
	 *
	 * @param ACTV_Module $module
	 */
	public static function register( ACTV_Module $module ) {
		$key = $module->key();
		if ( ! isset( self::$modules[ $key ] ) ) {
			self::$modules[ $key ] = $module;
		}
	}

	/**
	 * @return ACTV_Module[]
	 */
	public static function all() {
		return self::$modules;
	}

	/**
	 * Boot all registered modules under the current plugin mode.
	 *
	 * Returns array of init results keyed by module key:
	 *   [ key => [ 'ok' => bool, 'skipped' => bool, 'reason' => string|null, 'duration_ms' => int ] ]
	 *
	 * @param string $mode
	 * @return array
	 */
	public static function boot( $mode ) {
		$results = array();
		$state   = self::load_state();

		// Honor wp-config disable list.
		$disabled_const = defined( 'ACTV_TRKR_DISABLE_MODULES' ) ? (string) ACTV_TRKR_DISABLE_MODULES : '';
		$disabled_keys  = array_filter( array_map( 'trim', explode( ',', $disabled_const ) ) );

		foreach ( self::$modules as $key => $module ) {
			$module_state = isset( $state[ $key ] ) ? $state[ $key ] : self::default_state();

			// 1. Skip if explicitly disabled.
			if ( in_array( $key, $disabled_keys, true ) || ! $module_state['enabled'] ) {
				$results[ $key ] = array( 'ok' => false, 'skipped' => true, 'reason' => 'disabled', 'duration_ms' => 0 );
				continue;
			}

			// 2. Skip if mode says no.
			if ( ! ACTV_Mode::should_load( $key, $mode ) ) {
				$results[ $key ] = array( 'ok' => false, 'skipped' => true, 'reason' => 'mode_skip:' . $mode, 'duration_ms' => 0 );
				continue;
			}

			// 3. Skip if a dependency is unhealthy or skipped.
			$dep_failure = null;
			foreach ( $module->dependencies() as $dep ) {
				if ( ! isset( $results[ $dep ] ) || ! $results[ $dep ]['ok'] ) {
					$dep_failure = $dep;
					break;
				}
			}
			if ( $dep_failure !== null ) {
				$results[ $key ] = array( 'ok' => false, 'skipped' => true, 'reason' => 'dep_failed:' . $dep_failure, 'duration_ms' => 0 );
				continue;
			}

			// 4. Boot in isolation.
			$start = microtime( true );
			try {
				$module->init();
				$ok = true;
				$err = null;
			} catch ( \Throwable $e ) {
				$ok  = false;
				$err = $e->getMessage();
				ACTV_Logger::error( $key, 'module_init_failed', array(
					'message' => $err,
					'file'    => $e->getFile(),
					'line'    => $e->getLine(),
				) );
			}
			$duration = (int) round( ( microtime( true ) - $start ) * 1000 );

			// 5. Update per-module state.
			$module_state['last_init_at'] = time();
			if ( $ok ) {
				$module_state['healthy']        = true;
				$module_state['failure_count']  = 0;
				$module_state['last_error']     = null;
				$results[ $key ] = array( 'ok' => true, 'skipped' => false, 'reason' => null, 'duration_ms' => $duration );
			} else {
				$module_state['healthy']        = false;
				$module_state['failure_count']  = (int) $module_state['failure_count'] + 1;
				$module_state['last_error']     = substr( (string) $err, 0, 500 );
				$results[ $key ] = array( 'ok' => false, 'skipped' => false, 'reason' => 'init_error', 'duration_ms' => $duration );

				// Critical module failed → escalate to reduced_mode.
				if ( $module->is_critical() ) {
					ACTV_Mode::set( ACTV_Mode::REDUCED_MODE, sprintf( 'critical module "%s" failed: %s', $key, $err ) );
				}
			}

			$state[ $key ] = $module_state;
		}

		self::save_state( $state );
		return $results;
	}

	/**
	 * Load module health state. Tolerates corrupted option.
	 *
	 * @return array
	 */
	public static function load_state() {
		$value = get_option( self::STATE_OPTION_KEY, array() );
		return is_array( $value ) ? $value : array();
	}

	/**
	 * Persist module health state.
	 *
	 * @param array $state
	 */
	private static function save_state( $state ) {
		// Non-autoloaded — only read in admin / recovery / cron.
		update_option( self::STATE_OPTION_KEY, $state, false );
	}

	/**
	 * Default per-module state.
	 *
	 * @return array
	 */
	public static function default_state() {
		return array(
			'enabled'       => true,
			'healthy'       => true,
			'failure_count' => 0,
			'last_error'    => null,
			'last_init_at'  => 0,
		);
	}

	/**
	 * Toggle a module's enabled flag. Used by recovery CLI.
	 *
	 * @param string $key
	 * @param bool   $enabled
	 * @return bool Whether the module exists.
	 */
	public static function set_enabled( $key, $enabled ) {
		if ( ! isset( self::$modules[ $key ] ) ) {
			return false;
		}
		$state = self::load_state();
		$module_state = isset( $state[ $key ] ) ? $state[ $key ] : self::default_state();
		$module_state['enabled'] = (bool) $enabled;
		// On re-enable, reset health so the next boot gets a clean shot.
		if ( $enabled ) {
			$module_state['healthy']       = true;
			$module_state['failure_count'] = 0;
			$module_state['last_error']    = null;
		}
		$state[ $key ] = $module_state;
		self::save_state( $state );
		return true;
	}
}
