<?php
/**
 * Baseline migration v1 — captures the schema needed by the v1.10.x
 * crash-containment foundation. Idempotent: only ensures the health log
 * table exists. The legacy retry-queue table is created on demand by
 * MM_Retry_Queue::create_table() during plugin activation, so it does not
 * need to be re-asserted here.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return new class {
	public $version = 1;
	public $name    = 'baseline health tables';
	public $destructive = false;

	public function up( $wpdb ) {
		if ( class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::create_table();
		}
	}

	public function check( $wpdb ) {
		if ( ! class_exists( 'ACTV_Logger' ) ) {
			return false;
		}
		$tbl = ACTV_Logger::table_name();
		$got = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $tbl ) );
		return $got === $tbl;
	}
};
