<?php
/**
 * Per-key circuit breaker for risky operations.
 *
 * Pattern:
 *   $result = ACTV_Circuit_Breaker::guard( 'remote_sync', function() {
 *       return wp_remote_post( $url, $args );
 *   }, $fallback = null );
 *
 * The guard:
 *   - Short-circuits to $fallback if the breaker is currently tripped.
 *   - Catches \Throwable and counts WP_Error / HTTP >= 500 as failures.
 *   - Trips the breaker when failure_count >= threshold within window.
 *   - Stays tripped for `cooldown` seconds, then half-opens (one trial call).
 *
 * State is stored in a single non-autoloaded option to avoid wp_options bloat.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Circuit_Breaker {

	const OPTION_KEY = 'actv_trkr_breakers';

	/**
	 * Per-breaker config. Threshold / window (seconds) / cooldown (seconds).
	 *
	 * @return array
	 */
	public static function configs() {
		return array(
			'remote_sync'    => array( 'threshold' => 5,  'window' => 600, 'cooldown' => 1800 ),
			'cron_seo_fix'   => array( 'threshold' => 3,  'window' => 900, 'cooldown' => 3600 ),
			'cron_links'     => array( 'threshold' => 3,  'window' => 900, 'cooldown' => 3600 ),
			'cron_heartbeat' => array( 'threshold' => 10, 'window' => 600, 'cooldown' => 600  ),
			'webhook_in'     => array( 'threshold' => 20, 'window' => 300, 'cooldown' => 600  ),
			'ai_request'     => array( 'threshold' => 5,  'window' => 600, 'cooldown' => 1800 ),
			'form_probe'     => array( 'threshold' => 5,  'window' => 600, 'cooldown' => 1800 ),
		);
	}

	/**
	 * Guard a callable with the named breaker.
	 *
	 * @param string   $key
	 * @param callable $fn
	 * @param mixed    $fallback Returned when breaker is tripped or call fails.
	 * @return mixed
	 */
	public static function guard( $key, callable $fn, $fallback = null ) {
		if ( self::is_tripped( $key ) ) {
			return $fallback;
		}

		try {
			$result = $fn();

			if ( self::is_failure_result( $result ) ) {
				self::record_failure( $key, 'callable returned error result' );
				return $fallback;
			}

			self::record_success( $key );
			return $result;
		} catch ( \Throwable $e ) {
			self::record_failure( $key, $e->getMessage() );
			return $fallback;
		}
	}

	/**
	 * Detect failure-shaped return values without throwing.
	 *
	 * @param mixed $r
	 * @return bool
	 */
	private static function is_failure_result( $r ) {
		if ( is_wp_error( $r ) ) {
			return true;
		}
		if ( is_array( $r ) && isset( $r['response']['code'] ) && (int) $r['response']['code'] >= 500 ) {
			return true;
		}
		return false;
	}

	/**
	 * Is the named breaker currently open (tripped + within cooldown)?
	 */
	public static function is_tripped( $key ) {
		$state = self::state_for( $key );
		if ( empty( $state['tripped'] ) ) {
			return false;
		}
		if ( ! empty( $state['cooldown_until'] ) && (int) $state['cooldown_until'] <= time() ) {
			// Half-open: clear tripped flag so the next call gets a trial.
			$state['tripped']        = false;
			$state['cooldown_until'] = 0;
			$state['failures']       = array();
			self::write_state( $key, $state );
			return false;
		}
		return true;
	}

	/**
	 * Record a successful call — clears recent failure history.
	 */
	public static function record_success( $key ) {
		$state = self::state_for( $key );
		if ( ! empty( $state['failures'] ) || ! empty( $state['tripped'] ) ) {
			$state['failures']       = array();
			$state['tripped']        = false;
			$state['cooldown_until'] = 0;
			$state['last_success_at'] = time();
			self::write_state( $key, $state );
		}
	}

	/**
	 * Record a failure; trip the breaker if threshold reached.
	 *
	 * @param string $key
	 * @param string $reason
	 */
	public static function record_failure( $key, $reason = '' ) {
		$cfg = self::config_for( $key );
		$state = self::state_for( $key );

		$now = time();
		$cutoff = $now - (int) $cfg['window'];

		// Drop failures older than the rolling window.
		$state['failures'] = array_values( array_filter(
			isset( $state['failures'] ) && is_array( $state['failures'] ) ? $state['failures'] : array(),
			function( $ts ) use ( $cutoff ) {
				return (int) $ts >= $cutoff;
			}
		) );
		$state['failures'][] = $now;
		$state['last_failure_at'] = $now;
		$state['last_failure_reason'] = substr( (string) $reason, 0, 200 );

		if ( count( $state['failures'] ) >= (int) $cfg['threshold'] && empty( $state['tripped'] ) ) {
			$state['tripped']        = true;
			$state['opened_at']      = $now;
			$state['cooldown_until'] = $now + (int) $cfg['cooldown'];
			$state['trip_count']     = (int) ( $state['trip_count'] ?? 0 ) + 1;

			if ( class_exists( 'ACTV_Logger' ) ) {
				try {
					ACTV_Logger::warn( 'core', 'breaker_tripped', array(
						'key'           => $key,
						'failures'      => count( $state['failures'] ),
						'cooldown_secs' => (int) $cfg['cooldown'],
						'reason'        => $state['last_failure_reason'],
					) );
				} catch ( \Throwable $e ) {
					// best-effort.
				}
			}
		}

		self::write_state( $key, $state );
	}

	/**
	 * Manually reset a single breaker (admin / WP-CLI).
	 */
	public static function reset( $key ) {
		$all = self::all_state();
		unset( $all[ $key ] );
		update_option( self::OPTION_KEY, $all, false );
	}

	/**
	 * Snapshot of every breaker's current state — for diagnostics.
	 *
	 * @return array
	 */
	public static function snapshot() {
		$out = array();
		$state = self::all_state();
		foreach ( array_keys( self::configs() ) as $key ) {
			$s = isset( $state[ $key ] ) ? $state[ $key ] : array();
			$out[ $key ] = array(
				'tripped'         => ! empty( $s['tripped'] ),
				'cooldown_until'  => isset( $s['cooldown_until'] ) ? (int) $s['cooldown_until'] : 0,
				'failure_count'   => isset( $s['failures'] ) ? count( $s['failures'] ) : 0,
				'trip_count'      => isset( $s['trip_count'] ) ? (int) $s['trip_count'] : 0,
				'last_failure_at' => isset( $s['last_failure_at'] ) ? (int) $s['last_failure_at'] : 0,
				'last_reason'     => isset( $s['last_failure_reason'] ) ? $s['last_failure_reason'] : '',
			);
		}
		return $out;
	}

	private static function config_for( $key ) {
		$all = self::configs();
		return isset( $all[ $key ] ) ? $all[ $key ] : array( 'threshold' => 5, 'window' => 600, 'cooldown' => 1800 );
	}

	private static function state_for( $key ) {
		$all = self::all_state();
		return isset( $all[ $key ] ) && is_array( $all[ $key ] ) ? $all[ $key ] : array();
	}

	private static function all_state() {
		$v = get_option( self::OPTION_KEY, array() );
		return is_array( $v ) ? $v : array();
	}

	private static function write_state( $key, array $state ) {
		$all = self::all_state();
		$all[ $key ] = $state;
		update_option( self::OPTION_KEY, $all, false );
	}
}
