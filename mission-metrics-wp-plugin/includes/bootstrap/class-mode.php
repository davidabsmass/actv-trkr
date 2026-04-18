<?php
/**
 * Plugin state machine.
 *
 * States:
 *   - healthy           Normal operation, all modules load.
 *   - degraded          Non-critical modules disabled (scans, AI, imports).
 *   - reduced_mode      Only tracker + forms + consent + recovery load.
 *   - migration_locked  All features blocked except recovery + magic login.
 *
 * Auto-exit policy:
 *   - reduced_mode  → degraded after 5 successful boots
 *   - degraded      → healthy  after 10 successful boots with no module failures
 *   - migration_locked exits only via successful migration replay
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Mode {

	const OPTION_KEY = 'actv_trkr_state';
	const HISTORY_KEY = 'actv_trkr_state_history';

	const HEALTHY          = 'healthy';
	const DEGRADED         = 'degraded';
	const REDUCED_MODE     = 'reduced_mode';
	const MIGRATION_LOCKED = 'migration_locked';

	const REDUCED_TO_DEGRADED_THRESHOLD = 5;
	const DEGRADED_TO_HEALTHY_THRESHOLD = 10;

	/**
	 * Resolve current effective mode, accounting for wp-config overrides.
	 *
	 * @return string
	 */
	public static function resolve() {
		// wp-config emergency override.
		if ( defined( 'ACTV_TRKR_FORCE_SAFE_MODE' ) && ACTV_TRKR_FORCE_SAFE_MODE ) {
			return self::REDUCED_MODE;
		}

		$state = get_option( self::OPTION_KEY, self::HEALTHY );
		if ( ! in_array( $state, array( self::HEALTHY, self::DEGRADED, self::REDUCED_MODE, self::MIGRATION_LOCKED ), true ) ) {
			$state = self::HEALTHY;
		}
		return $state;
	}

	/**
	 * Persist a new state. No-op if forced via constant.
	 *
	 * @param string $new_state
	 * @param string $reason
	 */
	public static function set( $new_state, $reason = '' ) {
		if ( defined( 'ACTV_TRKR_FORCE_SAFE_MODE' ) && ACTV_TRKR_FORCE_SAFE_MODE ) {
			return; // Cannot transition out of forced safe mode.
		}

		$current = get_option( self::OPTION_KEY, self::HEALTHY );
		if ( $current === $new_state ) {
			return;
		}

		update_option( self::OPTION_KEY, $new_state, true );

		// Append to bounded history (last 20 transitions).
		$history = get_option( self::HISTORY_KEY, array() );
		if ( ! is_array( $history ) ) {
			$history = array();
		}
		$history[] = array(
			'from'   => $current,
			'to'     => $new_state,
			'reason' => substr( (string) $reason, 0, 200 ),
			'at'     => gmdate( 'c' ),
		);
		if ( count( $history ) > 20 ) {
			$history = array_slice( $history, -20 );
		}
		update_option( self::HISTORY_KEY, $history, false );

		// Best-effort log; don't fail state transition if logger is broken.
		if ( class_exists( 'ACTV_Logger' ) ) {
			try {
				ACTV_Logger::warn( 'core', 'mode_changed', array(
					'from'   => $current,
					'to'     => $new_state,
					'reason' => $reason,
				) );
			} catch ( \Throwable $e ) {
				// Swallow — never let logging break state transitions.
			}
		}
	}

	/**
	 * Determine whether a given module key should load in the current mode.
	 *
	 * @param string $module_key
	 * @param string $mode
	 * @return bool
	 */
	public static function should_load( $module_key, $mode ) {
		// Critical modules always load (except in migration_locked).
		$critical = array( 'tracker', 'forms', 'consent_banner', 'recovery_banner', 'magic_login' );

		if ( $mode === self::MIGRATION_LOCKED ) {
			// Only modules that don't touch our schema.
			return in_array( $module_key, array( 'recovery_banner', 'magic_login' ), true );
		}

		if ( $mode === self::REDUCED_MODE ) {
			return in_array( $module_key, $critical, true );
		}

		if ( $mode === self::DEGRADED ) {
			// Skip heavy / nonessential modules.
			$skip = array( 'broken_links', 'seo_fixes', 'import_engine' );
			return ! in_array( $module_key, $skip, true );
		}

		// healthy: everything loads.
		return true;
	}

	/**
	 * Called after a successful boot — possibly auto-exit toward healthy.
	 */
	public static function record_successful_boot() {
		$current = self::resolve();

		if ( $current === self::HEALTHY || $current === self::MIGRATION_LOCKED ) {
			return;
		}

		$counter_key = 'actv_trkr_clean_boot_count';
		$count       = (int) get_option( $counter_key, 0 ) + 1;
		update_option( $counter_key, $count, false );

		if ( $current === self::REDUCED_MODE && $count >= self::REDUCED_TO_DEGRADED_THRESHOLD ) {
			self::set( self::DEGRADED, sprintf( 'auto-exit after %d clean boots', $count ) );
			update_option( $counter_key, 0, false );
			return;
		}

		if ( $current === self::DEGRADED && $count >= self::DEGRADED_TO_HEALTHY_THRESHOLD ) {
			self::set( self::HEALTHY, sprintf( 'auto-exit after %d clean boots', $count ) );
			update_option( $counter_key, 0, false );
		}
	}

	/**
	 * Reset clean-boot counter when any failure occurs.
	 */
	public static function reset_clean_counter() {
		update_option( 'actv_trkr_clean_boot_count', 0, false );
	}
}
