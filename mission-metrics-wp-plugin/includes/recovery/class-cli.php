<?php
/**
 * WP-CLI commands for ACTV TRKR recovery.
 *
 * Registered only when WP_CLI is defined. All commands are thin wrappers
 * around ACTV_Recovery. They never throw — failures are surfaced via
 * WP_CLI::error() with the structured error string.
 *
 * Available commands (run from the WordPress install root):
 *   wp actv-trkr status
 *   wp actv-trkr reset
 *   wp actv-trkr clear-migration-lock
 *   wp actv-trkr migrate [--retry]
 *   wp actv-trkr breakers reset [<key>]
 *   wp actv-trkr module disable <key>
 *   wp actv-trkr module enable  <key>
 *   wp actv-trkr log [--limit=<n>]
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

class ACTV_CLI_Command {

	/**
	 * Print a full diagnostics snapshot.
	 *
	 * ## OPTIONS
	 *
	 * [--format=<format>]
	 * : Output format. Accepts: table, json, yaml. Default: table.
	 *
	 * @when after_wp_load
	 */
	public function status( $args, $assoc_args ) {
		$format = isset( $assoc_args['format'] ) ? $assoc_args['format'] : 'table';
		$snap = ACTV_Recovery::status();

		if ( empty( $snap['ok'] ) ) {
			WP_CLI::error( $snap['error'] ?? 'Unknown error.' );
			return;
		}

		if ( $format === 'json' ) {
			WP_CLI::log( wp_json_encode( $snap, JSON_PRETTY_PRINT ) );
			return;
		}

		WP_CLI::log( '' );
		WP_CLI::log( 'ACTV TRKR — recovery status' );
		WP_CLI::log( '────────────────────────────' );
		WP_CLI::log( sprintf( 'Plugin version    : %s', $snap['version'] ) );
		WP_CLI::log( sprintf( 'Effective mode    : %s', $snap['mode'] ) );
		WP_CLI::log( sprintf( 'Forced safe mode  : %s', $snap['forced_safe_mode'] ? 'YES (wp-config)' : 'no' ) );
		if ( ! empty( $snap['disabled_modules_const'] ) ) {
			WP_CLI::log( sprintf( 'Disabled (const)  : %s', $snap['disabled_modules_const'] ) );
		}
		WP_CLI::log( '' );

		$bc = $snap['boot_counter'];
		WP_CLI::log( sprintf(
			'Boot counter      : %d consecutive failures (last fail: %s, last success: %s)',
			(int) ( $bc['consecutive_failures'] ?? 0 ),
			! empty( $bc['last_failure_at'] ) ? gmdate( 'c', (int) $bc['last_failure_at'] ) : 'never',
			! empty( $bc['last_success_at'] ) ? gmdate( 'c', (int) $bc['last_success_at'] ) : 'never'
		) );

		$mig = $snap['migration'];
		WP_CLI::log( sprintf( 'Schema version    : %d', (int) $mig['current_version'] ) );
		if ( ! empty( $mig['lock'] ) ) {
			WP_CLI::log( sprintf( 'Migration lock    : HELD until %s', gmdate( 'c', (int) ( $mig['lock']['expires_at'] ?? 0 ) ) ) );
		}
		if ( ! empty( $mig['status']['error'] ) ) {
			WP_CLI::log( sprintf( 'Last migration    : ERROR — %s', $mig['status']['error'] ) );
		}
		WP_CLI::log( '' );

		// Breakers.
		$tripped = array();
		foreach ( (array) $snap['breakers'] as $key => $b ) {
			if ( ! empty( $b['tripped'] ) ) {
				$tripped[] = sprintf( '%s (cooldown until %s, trips=%d)',
					$key,
					gmdate( 'c', (int) $b['cooldown_until'] ),
					(int) $b['trip_count']
				);
			}
		}
		if ( $tripped ) {
			WP_CLI::log( 'Tripped breakers  :' );
			foreach ( $tripped as $line ) {
				WP_CLI::log( '  - ' . $line );
			}
		} else {
			WP_CLI::log( 'Tripped breakers  : none' );
		}
		WP_CLI::log( '' );

		// Modules.
		$unhealthy = array();
		$disabled  = array();
		foreach ( (array) $snap['modules'] as $key => $m ) {
			if ( empty( $m['enabled'] ) ) {
				$disabled[] = $key;
			} elseif ( empty( $m['healthy'] ) ) {
				$unhealthy[] = sprintf( '%s (failures=%d, last: %s)',
					$key,
					(int) ( $m['failure_count'] ?? 0 ),
					(string) ( $m['last_error'] ?? '' )
				);
			}
		}
		WP_CLI::log( 'Disabled modules  : ' . ( $disabled ? implode( ', ', $disabled ) : 'none' ) );
		WP_CLI::log( 'Unhealthy modules :' );
		if ( $unhealthy ) {
			foreach ( $unhealthy as $line ) {
				WP_CLI::log( '  - ' . $line );
			}
		} else {
			WP_CLI::log( '  none' );
		}
		WP_CLI::log( '' );
	}

	/**
	 * Reset plugin state to healthy and clear the boot counter.
	 *
	 * Does not touch the migration lock or circuit breakers — use the
	 * dedicated commands for those.
	 *
	 * @when after_wp_load
	 */
	public function reset( $args, $assoc_args ) {
		$res = ACTV_Recovery::reset_state();
		if ( empty( $res['ok'] ) ) {
			WP_CLI::error( $res['error'] ?? 'Reset failed.' );
			return;
		}
		WP_CLI::success( $res['message'] );
	}

	/**
	 * Force-release the migration lock.
	 *
	 * Use only when a migration crashed mid-run and the lock is stuck.
	 *
	 * @when after_wp_load
	 */
	public function clear_migration_lock( $args, $assoc_args ) {
		$res = ACTV_Recovery::clear_migration_lock();
		if ( empty( $res['ok'] ) ) {
			WP_CLI::error( $res['error'] ?? 'Clear failed.' );
			return;
		}
		WP_CLI::success( $res['message'] );
	}

	/**
	 * Run pending schema migrations.
	 *
	 * ## OPTIONS
	 *
	 * [--retry]
	 * : First exit migration_locked mode, then attempt to apply pending migrations.
	 *
	 * @when after_wp_load
	 */
	public function migrate( $args, $assoc_args ) {
		$res = ACTV_Recovery::run_migrations( array(
			'exit_locked' => isset( $assoc_args['retry'] ),
		) );
		if ( empty( $res['ok'] ) ) {
			WP_CLI::error( $res['error'] ?? 'Migration failed.' );
			return;
		}
		$applied = $res['applied'] ?? array();
		if ( empty( $applied ) ) {
			WP_CLI::success( 'No pending migrations.' );
		} else {
			WP_CLI::success( sprintf( 'Applied migrations: %s', implode( ', ', array_map( 'strval', $applied ) ) ) );
		}
	}

	/**
	 * Manage circuit breakers.
	 *
	 * ## OPTIONS
	 *
	 * <action>
	 * : Action to perform. Accepts: reset, list.
	 *
	 * [<key>]
	 * : Optional breaker key. Use "all" or omit to target every breaker on reset.
	 *
	 * @when after_wp_load
	 */
	public function breakers( $args, $assoc_args ) {
		$action = isset( $args[0] ) ? $args[0] : 'list';
		$key    = isset( $args[1] ) ? $args[1] : null;

		if ( $action === 'list' ) {
			$snap = ACTV_Circuit_Breaker::snapshot();
			foreach ( $snap as $k => $b ) {
				WP_CLI::log( sprintf(
					'%-16s  tripped=%s  failures=%d  trips=%d  reason=%s',
					$k,
					! empty( $b['tripped'] ) ? 'yes' : 'no ',
					(int) $b['failure_count'],
					(int) $b['trip_count'],
					(string) $b['last_reason']
				) );
			}
			return;
		}

		if ( $action === 'reset' ) {
			$res = ACTV_Recovery::reset_breakers( $key );
			if ( empty( $res['ok'] ) ) {
				WP_CLI::error( $res['error'] ?? 'Reset failed.' );
				return;
			}
			WP_CLI::success( $res['message'] );
			return;
		}

		WP_CLI::error( sprintf( 'Unknown action "%s". Use: list | reset', $action ) );
	}

	/**
	 * Enable or disable a single module.
	 *
	 * ## OPTIONS
	 *
	 * <action>
	 * : enable or disable.
	 *
	 * <key>
	 * : Module key (e.g. broken_links, seo_fixes).
	 *
	 * @when after_wp_load
	 */
	public function module( $args, $assoc_args ) {
		$action = isset( $args[0] ) ? $args[0] : '';
		$key    = isset( $args[1] ) ? $args[1] : '';

		if ( $key === '' ) {
			WP_CLI::error( 'Module key is required.' );
			return;
		}

		if ( $action === 'disable' ) {
			$res = ACTV_Recovery::disable_module( $key );
		} elseif ( $action === 'enable' ) {
			$res = ACTV_Recovery::enable_module( $key );
		} else {
			WP_CLI::error( sprintf( 'Unknown action "%s". Use: enable | disable', $action ) );
			return;
		}

		if ( empty( $res['ok'] ) ) {
			WP_CLI::error( $res['error'] ?? 'Module action failed.' );
			return;
		}
		WP_CLI::success( $res['message'] );
	}

	/**
	 * Tail the health log.
	 *
	 * ## OPTIONS
	 *
	 * [--limit=<n>]
	 * : Number of recent rows. Default: 50. Max: 500.
	 *
	 * @when after_wp_load
	 */
	public function log( $args, $assoc_args ) {
		$limit = isset( $assoc_args['limit'] ) ? (int) $assoc_args['limit'] : 50;
		$res   = ACTV_Recovery::tail_log( $limit );

		if ( empty( $res['ok'] ) ) {
			WP_CLI::error( $res['error'] ?? 'Log unavailable.' );
			return;
		}

		foreach ( array_reverse( $res['rows'] ) as $row ) {
			WP_CLI::log( sprintf(
				'%s  %-5s  %-18s  %s',
				$row['ts'],
				strtoupper( (string) $row['level'] ),
				(string) $row['module'] . '.' . (string) $row['event'],
				(string) $row['context_json']
			) );
		}
	}
}

WP_CLI::add_command( 'actv-trkr', 'ACTV_CLI_Command' );
