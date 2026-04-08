<?php
/**
 * Plugin Name: ACTV TRKR
 * Plugin URI:  https://actvtrkr.com
 * Description: First-party pageview tracking and universal form capture for ACTV TRKR.
 * Version:     1.8.11
 * Author:      Absolutely Massive
 * License:     GPL-2.0-or-later
 * Text Domain: actv-trkr
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MM_PLUGIN_VERSION', '1.8.11' );
define( 'MM_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'MM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once MM_PLUGIN_DIR . 'includes/class-settings.php';
require_once MM_PLUGIN_DIR . 'includes/class-tracker.php';
require_once MM_PLUGIN_DIR . 'includes/class-forms.php';
require_once MM_PLUGIN_DIR . 'includes/class-retry-queue.php';
require_once MM_PLUGIN_DIR . 'includes/class-updater.php';
require_once MM_PLUGIN_DIR . 'includes/class-heartbeat.php';
require_once MM_PLUGIN_DIR . 'includes/class-broken-links.php';
require_once MM_PLUGIN_DIR . 'includes/class-seo-fixes.php';
require_once MM_PLUGIN_DIR . 'includes/class-security.php';
require_once MM_PLUGIN_DIR . 'includes/class-magic-login.php';

// WooCommerce integration (only load if WooCommerce is active)
if ( in_array( 'woocommerce/woocommerce.php', apply_filters( 'active_plugins', get_option( 'active_plugins' ) ), true ) ) {
	require_once MM_PLUGIN_DIR . 'includes/class-woocommerce.php';
	new MM_WooCommerce();
}

/**
 * Activation: create retry-queue table and schedule cron.
 */
function mm_activate() {
	MM_Retry_Queue::create_table();
	if ( ! wp_next_scheduled( 'mm_retry_cron' ) ) {
		wp_schedule_event( time(), 'mm_every_5_min', 'mm_retry_cron' );
	}
	if ( ! wp_next_scheduled( 'mm_form_probe_cron' ) ) {
		wp_schedule_event( time(), 'hourly', 'mm_form_probe_cron' );
	}
	if ( ! wp_next_scheduled( 'mm_seo_fix_cron' ) ) {
		wp_schedule_event( time(), 'mm_every_5_min', 'mm_seo_fix_cron' );
	}
	// Schedule a one-time auto-sync of forms + entries 30 seconds after activation
	// (delayed so all plugins are fully loaded)
	if ( ! wp_next_scheduled( 'mm_first_install_sync' ) ) {
		wp_schedule_single_event( time() + 30, 'mm_first_install_sync' );
	}
}
register_activation_hook( __FILE__, 'mm_activate' );

/**
 * Deactivation: clear cron.
 */
function mm_deactivate() {
	wp_clear_scheduled_hook( 'mm_retry_cron' );
	wp_clear_scheduled_hook( 'mm_form_probe_cron' );
	wp_clear_scheduled_hook( 'mm_seo_fix_cron' );
}
register_deactivation_hook( __FILE__, 'mm_deactivate' );

/**
 * Custom cron interval.
 */
add_filter( 'cron_schedules', function ( $schedules ) {
	$schedules['mm_every_5_min'] = array(
		'interval' => 300,
		'display'  => __( 'Every 5 Minutes', 'actv-trkr' ),
	);
	return $schedules;
} );

// Boot components.
MM_Settings::init();
MM_Tracker::init();
MM_Forms::init();
MM_Updater::init();
MM_Heartbeat::init();
MM_Broken_Links::init();
MM_SEO_Fixes::init();
$mm_security = new Mission_Metrics_Security();
$mm_security->init();
MM_Magic_Login::init();

// Ensure crons are scheduled even after updates (activation hook only fires on first install).
add_action( 'init', function () {
	if ( ! wp_next_scheduled( 'mm_retry_cron' ) ) {
		wp_schedule_event( time(), 'mm_every_5_min', 'mm_retry_cron' );
	}
	if ( ! wp_next_scheduled( 'mm_form_probe_cron' ) ) {
		wp_schedule_event( time(), 'hourly', 'mm_form_probe_cron' );
	}
	if ( ! wp_next_scheduled( 'mm_seo_fix_cron' ) ) {
		wp_schedule_event( time(), 'mm_every_5_min', 'mm_seo_fix_cron' );
	}
}, 20 );

// Cron hooks.
add_action( 'mm_retry_cron', array( 'MM_Retry_Queue', 'process' ) );
add_action( 'mm_form_probe_cron', array( 'MM_Forms', 'probe_form_pages' ) );
add_action( 'mm_seo_fix_cron', array( 'MM_SEO_Fixes', 'poll_fixes' ) );

// First-install auto-sync: discover forms + trigger entry backfill.
add_action( 'mm_first_install_sync', function () {
	$opts = MM_Settings::get();
	if ( empty( $opts['api_key'] ) ) return;
	error_log( '[ACTV TRKR] Running first-install auto-sync…' );
	$result = MM_Forms::scan_all_forms();
	error_log( '[ACTV TRKR] First-install sync complete: ' . wp_json_encode( $result ) );

	// Now trigger a full entry backfill via the dashboard endpoint
	$domain   = wp_parse_url( home_url(), PHP_URL_HOST );
	$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/trigger-site-sync';
	$key_hash = hash( 'sha256', $opts['api_key'] );

	wp_remote_post( $endpoint, array(
		'timeout'  => 10,
		'blocking' => false,
		'headers'  => array(
			'Content-Type'  => 'application/json',
			'Authorization' => 'Bearer ' . $opts['api_key'],
		),
		'body' => wp_json_encode( array(
			'domain'   => $domain,
			'key_hash' => $key_hash,
			'action'   => 'first_install_sync',
		) ),
	) );
} );
