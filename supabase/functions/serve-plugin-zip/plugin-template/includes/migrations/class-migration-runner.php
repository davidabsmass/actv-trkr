<?php
/**
 * Versioned migration runner.
 *
 * Loads migration files from includes/migrations/versions/NNN-name.php where
 * each file returns an object with `version`, `name`, `up( wpdb )`, and
 * `check( wpdb )`. The runner walks every file with version > the persisted
 * schema_version, runs it under a lock, asserts post-conditions, and
 * advances the schema version atomically.
 *
 * On any failure, the plugin enters migration_locked mode. The site
 * front-end stays alive (recovery_banner + magic_login still load); admins
 * see a notice with WP-CLI recovery instructions.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Migration_Runner {

	const SCHEMA_VERSION_OPTION = 'actv_trkr_schema_version';
	const MIGRATION_STATUS_OPTION = 'actv_trkr_migration_status';

	/**
	 * Ensure all pending migrations have been applied.
	 *
	 * Cheap fast-path: if the highest version on disk equals the persisted
	 * schema_version, returns immediately without acquiring the lock.
	 *
	 * @param string $migrations_dir Absolute path to versions/ directory.
	 * @return array { ok, applied: int[], error?: string }
	 */
	public static function ensure_pending( $migrations_dir ) {
		$current = (int) get_option( self::SCHEMA_VERSION_OPTION, 0 );
		$pending = self::pending_migrations( $migrations_dir, $current );

		if ( empty( $pending ) ) {
			return array( 'ok' => true, 'applied' => array() );
		}

		// Acquire lock before doing any work.
		$token = ACTV_Migration_Lock::acquire();
		if ( ! $token ) {
			return array(
				'ok'      => false,
				'applied' => array(),
				'error'   => 'Migration lock held by another process; will retry next request.',
				'skipped' => true,
			);
		}

		$applied = array();
		$error   = null;

		foreach ( $pending as $entry ) {
			$version = $entry['version'];
			$file    = $entry['file'];

			self::write_status( array(
				'running'      => true,
				'started_at'   => gmdate( 'c' ),
				'version_from' => $current,
				'version_to'   => $version,
				'name'         => $entry['name'],
			) );

			try {
				$migration = require $file;
				if ( ! is_object( $migration ) || ! method_exists( $migration, 'up' ) ) {
					throw new \RuntimeException( 'Migration file did not return a valid migration object.' );
				}

				global $wpdb;
				$migration->up( $wpdb );

				if ( method_exists( $migration, 'check' ) ) {
					$ok = (bool) $migration->check( $wpdb );
					if ( ! $ok ) {
						throw new \RuntimeException( 'Post-migration check failed.' );
					}
				}

				update_option( self::SCHEMA_VERSION_OPTION, $version, true );
				$current = $version;
				$applied[] = $version;

				if ( class_exists( 'ACTV_Logger' ) ) {
					ACTV_Logger::info( 'core', 'migration_applied', array(
						'version' => $version,
						'name'    => $entry['name'],
					) );
				}
			} catch ( \Throwable $e ) {
				$error = sprintf( 'Migration v%d (%s) failed: %s', $version, $entry['name'], $e->getMessage() );

				self::write_status( array(
					'running'      => false,
					'finished_at'  => gmdate( 'c' ),
					'version_from' => $current,
					'version_to'   => $version,
					'error'        => $error,
				) );

				if ( class_exists( 'ACTV_Logger' ) ) {
					ACTV_Logger::fatal( 'core', 'migration_failed', array(
						'version' => $version,
						'name'    => $entry['name'],
						'message' => $e->getMessage(),
						'file'    => $e->getFile(),
						'line'    => $e->getLine(),
					) );
				}

				if ( class_exists( 'ACTV_Mode' ) ) {
					ACTV_Mode::set( ACTV_Mode::MIGRATION_LOCKED, $error );
				}

				ACTV_Migration_Lock::release( $token );
				return array( 'ok' => false, 'applied' => $applied, 'error' => $error );
			}
		}

		self::write_status( array(
			'running'      => false,
			'finished_at'  => gmdate( 'c' ),
			'version_from' => $current,
			'version_to'   => $current,
			'error'        => null,
		) );

		ACTV_Migration_Lock::release( $token );
		return array( 'ok' => true, 'applied' => $applied );
	}

	/**
	 * List pending migration files sorted by version ascending.
	 *
	 * @param string $dir
	 * @param int    $current_version
	 * @return array<int, array{version:int,name:string,file:string}>
	 */
	private static function pending_migrations( $dir, $current_version ) {
		if ( ! is_dir( $dir ) ) {
			return array();
		}
		$files = glob( rtrim( $dir, '/\\' ) . '/*.php' );
		if ( ! is_array( $files ) ) {
			return array();
		}

		$entries = array();
		foreach ( $files as $f ) {
			$base = basename( $f );
			if ( ! preg_match( '/^(\d+)[-_](.+)\.php$/', $base, $m ) ) {
				continue;
			}
			$v = (int) $m[1];
			if ( $v <= $current_version ) {
				continue;
			}
			$entries[] = array(
				'version' => $v,
				'name'    => str_replace( array( '-', '_' ), ' ', $m[2] ),
				'file'    => $f,
			);
		}

		usort( $entries, function( $a, $b ) {
			return $a['version'] <=> $b['version'];
		} );
		return $entries;
	}

	/**
	 * Persist current migration status (small JSON-shaped option).
	 *
	 * @param array $status
	 */
	private static function write_status( array $status ) {
		update_option( self::MIGRATION_STATUS_OPTION, $status, false );
	}

	/**
	 * Read last persisted status.
	 *
	 * @return array|null
	 */
	public static function status() {
		$s = get_option( self::MIGRATION_STATUS_OPTION, null );
		return is_array( $s ) ? $s : null;
	}

	/**
	 * Current applied schema version.
	 */
	public static function current_version() {
		return (int) get_option( self::SCHEMA_VERSION_OPTION, 0 );
	}
}
