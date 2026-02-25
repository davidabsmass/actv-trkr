<?php
/**
 * Plugin Name: Mission Metrics — ACTV TRKR
 * Plugin URI:  https://actvtrkr.com
 * Description: First-party pageview tracking and Gravity Forms lead ingestion for ACTV TRKR.
 * Version:     1.0.0
 * Author:      ACTV TRKR
 * License:     GPL-2.0-or-later
 * Text Domain: mission-metrics
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MM_PLUGIN_VERSION', '1.0.0' );
define( 'MM_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'MM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once MM_PLUGIN_DIR . 'includes/class-settings.php';
require_once MM_PLUGIN_DIR . 'includes/class-tracker.php';
require_once MM_PLUGIN_DIR . 'includes/class-gravity.php';
require_once MM_PLUGIN_DIR . 'includes/class-retry-queue.php';

/**
 * Activation: create retry-queue table and schedule cron.
 */
function mm_activate() {
	MM_Retry_Queue::create_table();
	if ( ! wp_next_scheduled( 'mm_retry_cron' ) ) {
		wp_schedule_event( time(), 'mm_every_5_min', 'mm_retry_cron' );
	}
}
register_activation_hook( __FILE__, 'mm_activate' );

/**
 * Deactivation: clear cron.
 */
function mm_deactivate() {
	wp_clear_scheduled_hook( 'mm_retry_cron' );
}
register_deactivation_hook( __FILE__, 'mm_deactivate' );

/**
 * Custom cron interval.
 */
add_filter( 'cron_schedules', function ( $schedules ) {
	$schedules['mm_every_5_min'] = array(
		'interval' => 300,
		'display'  => __( 'Every 5 Minutes', 'mission-metrics' ),
	);
	return $schedules;
} );

// Boot components.
MM_Settings::init();
MM_Tracker::init();
MM_Gravity::init();

// Cron hook.
add_action( 'mm_retry_cron', array( 'MM_Retry_Queue', 'process' ) );
