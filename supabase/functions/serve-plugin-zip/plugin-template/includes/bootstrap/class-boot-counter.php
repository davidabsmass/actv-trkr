<?php
/**
 * Boot failure counter — detects boot loops.
 *
 * Records consecutive bootstrap failures within a sliding window.
 * Triggers reduced_mode when threshold exceeded.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Boot_Counter {

	const OPTION_KEY = 'actv_trkr_boot_counter';

	const FAILURE_THRESHOLD = 3;     // 3 fails within window → loop detected
	const FAILURE_WINDOW    = 300;   // 5 minutes

	/**
	 * Get current counter state.
	 *
	 * @return array { consecutive_failures:int, last_failure_at:int, last_success_at:int }
	 */
	public static function get() {
		$default = array(
			'consecutive_failures' => 0,
			'last_failure_at'      => 0,
			'last_success_at'      => 0,
		);
		$value = get_option( self::OPTION_KEY, $default );
		if ( ! is_array( $value ) ) {
			return $default;
		}
		return wp_parse_args( $value, $default );
	}

	/**
	 * Are we currently in a detected boot loop?
	 *
	 * @return bool
	 */
	public static function is_in_loop() {
		$state = self::get();
		if ( $state['consecutive_failures'] < self::FAILURE_THRESHOLD ) {
			return false;
		}
		// Failures must be recent to count as a loop.
		return ( time() - $state['last_failure_at'] ) <= self::FAILURE_WINDOW;
	}

	/**
	 * Record a bootstrap failure.
	 *
	 * @param string $reason
	 */
	public static function record_failure( $reason = '' ) {
		$state = self::get();
		// If last failure was outside the window, reset counter.
		if ( $state['last_failure_at'] && ( time() - $state['last_failure_at'] ) > self::FAILURE_WINDOW ) {
			$state['consecutive_failures'] = 0;
		}
		$state['consecutive_failures']++;
		$state['last_failure_at'] = time();
		update_option( self::OPTION_KEY, $state, true );

		if ( class_exists( 'ACTV_Logger' ) ) {
			try {
				ACTV_Logger::error( 'core', 'boot_fail', array(
					'reason'               => substr( (string) $reason, 0, 500 ),
					'consecutive_failures' => $state['consecutive_failures'],
				) );
			} catch ( \Throwable $e ) {
				// Swallow.
			}
		}
	}

	/**
	 * Record a successful boot — resets failure counter.
	 */
	public static function record_success() {
		$state                         = self::get();
		$state['consecutive_failures'] = 0;
		$state['last_success_at']      = time();
		update_option( self::OPTION_KEY, $state, true );
	}
}
