<?php
/**
 * Structured event logger.
 *
 * Writes to the wp_mm_health_log custom table when available.
 * Degrades gracefully — if the table is missing or insertion fails,
 * the logger silently no-ops rather than crashing the caller.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Logger {

	const TABLE         = 'mm_health_log';
	const MAX_ROWS      = 1000;       // Ring-buffer cap (per project decision)
	const PRUNE_TO_ROWS = 800;        // Hysteresis to avoid pruning every write

	const LEVEL_INFO  = 'info';
	const LEVEL_WARN  = 'warn';
	const LEVEL_ERROR = 'error';
	const LEVEL_FATAL = 'fatal';

	/**
	 * Resolve full table name.
	 *
	 * @return string
	 */
	public static function table_name() {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	/**
	 * Create the log table. Idempotent.
	 */
	public static function create_table() {
		global $wpdb;
		$table   = self::table_name();
		$charset = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS {$table} (
			id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			level VARCHAR(10) NOT NULL DEFAULT 'info',
			module VARCHAR(60) NOT NULL DEFAULT '',
			event VARCHAR(80) NOT NULL DEFAULT '',
			fingerprint CHAR(16) NOT NULL DEFAULT '',
			context_json LONGTEXT NULL,
			KEY idx_ts (ts),
			KEY idx_module (module),
			KEY idx_fingerprint (fingerprint)
		) {$charset};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	public static function info( $module, $event, $context = array() )  { self::log( self::LEVEL_INFO,  $module, $event, $context ); }
	public static function warn( $module, $event, $context = array() )  { self::log( self::LEVEL_WARN,  $module, $event, $context ); }
	public static function error( $module, $event, $context = array() ) { self::log( self::LEVEL_ERROR, $module, $event, $context ); }
	public static function fatal( $module, $event, $context = array() ) { self::log( self::LEVEL_FATAL, $module, $event, $context ); }

	/**
	 * Append a structured log entry. Never throws.
	 *
	 * @param string $level
	 * @param string $module
	 * @param string $event
	 * @param array  $context
	 */
	public static function log( $level, $module, $event, $context = array() ) {
		try {
			global $wpdb;
			if ( ! isset( $wpdb ) ) {
				return;
			}

			$table = self::table_name();

			// Redact secrets before persistence.
			$safe_context = class_exists( 'ACTV_Redactor' )
				? ACTV_Redactor::scrub( $context )
				: $context;

			$json = wp_json_encode( $safe_context );
			if ( false === $json ) {
				$json = '{"_encode_error":true}';
			}
			// Cap context size to keep table light on shared hosting.
			if ( strlen( $json ) > 8000 ) {
				$json = substr( $json, 0, 8000 ) . '...[truncated]';
			}

			$fingerprint = self::fingerprint( $module, $event, $json );

			// Suppress wpdb errors — never let logging cascade.
			$prev_show = $wpdb->show_errors;
			$wpdb->show_errors = false;

			$wpdb->insert(
				$table,
				array(
					'level'        => substr( (string) $level, 0, 10 ),
					'module'       => substr( (string) $module, 0, 60 ),
					'event'        => substr( (string) $event, 0, 80 ),
					'fingerprint'  => $fingerprint,
					'context_json' => $json,
				),
				array( '%s', '%s', '%s', '%s', '%s' )
			);

			$wpdb->show_errors = $prev_show;
		} catch ( \Throwable $e ) {
			// Swallow — logger must never break the caller.
			return;
		}
	}

	/**
	 * Build a stable fingerprint for dedup.
	 *
	 * @param string $module
	 * @param string $event
	 * @param string $context_json
	 * @return string
	 */
	private static function fingerprint( $module, $event, $context_json ) {
		// Use first 80 chars of context for stable hashing across minor variations.
		$basis = $module . '|' . $event . '|' . substr( $context_json, 0, 80 );
		return substr( md5( $basis ), 0, 16 );
	}

	/**
	 * Prune oldest rows beyond MAX_ROWS. Called from a weekly cron.
	 *
	 * @return int Rows deleted.
	 */
	public static function prune() {
		try {
			global $wpdb;
			$table = self::table_name();
			$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
			if ( $total <= self::MAX_ROWS ) {
				return 0;
			}
			$to_delete = $total - self::PRUNE_TO_ROWS;
			$cutoff_id = (int) $wpdb->get_var( $wpdb->prepare(
				"SELECT id FROM {$table} ORDER BY id ASC LIMIT 1 OFFSET %d",
				$to_delete - 1
			) );
			if ( $cutoff_id <= 0 ) {
				return 0;
			}
			return (int) $wpdb->query( $wpdb->prepare(
				"DELETE FROM {$table} WHERE id <= %d",
				$cutoff_id
			) );
		} catch ( \Throwable $e ) {
			return 0;
		}
	}

	/**
	 * Fetch recent log rows for diagnostics / recovery UI.
	 *
	 * @param int $limit
	 * @return array
	 */
	public static function tail( $limit = 50 ) {
		try {
			global $wpdb;
			$table = self::table_name();
			$limit = max( 1, min( 500, (int) $limit ) );
			$rows  = $wpdb->get_results( $wpdb->prepare(
				"SELECT id, ts, level, module, event, fingerprint, context_json
				 FROM {$table} ORDER BY id DESC LIMIT %d",
				$limit
			), ARRAY_A );
			return is_array( $rows ) ? $rows : array();
		} catch ( \Throwable $e ) {
			return array();
		}
	}
}
