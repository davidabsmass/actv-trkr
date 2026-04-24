<?php
/**
 * Plugin Name: ACTV TRKR
 * Plugin URI:  https://actvtrkr.com
 * Description: First-party pageview tracking and universal form capture for ACTV TRKR.
 * Version:     1.21.0
 * Author:      Absolutely Massive
 * License:     GPL-2.0-or-later
 * Text Domain: actv-trkr
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MM_PLUGIN_VERSION', '1.21.0' );
define( 'MM_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'MM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/*
 * ─────────────────────────────────────────────────────────────────
 * Crash containment layer (PR 1 — foundation)
 *
 * Loads only the safe bootstrap. Feature classes are required and
 * initialized inside ACTV_Bootstrap::run() under per-module isolation,
 * so a fatal in any single subsystem cannot take down the host site.
 *
 * If anything in this file or in Bootstrap throws, the catch below
 * falls back to a minimal legacy boot of the most critical modules
 * so the product keeps tracking even during the hardening rollout.
 * ─────────────────────────────────────────────────────────────────
 */
require_once MM_PLUGIN_DIR . 'includes/observability/class-redactor.php';
require_once MM_PLUGIN_DIR . 'includes/observability/class-logger.php';
require_once MM_PLUGIN_DIR . 'includes/bootstrap/class-environment.php';
require_once MM_PLUGIN_DIR . 'includes/bootstrap/class-mode.php';
require_once MM_PLUGIN_DIR . 'includes/bootstrap/class-boot-counter.php';
require_once MM_PLUGIN_DIR . 'includes/bootstrap/class-preflight.php';
require_once MM_PLUGIN_DIR . 'includes/migrations/class-migration-lock.php';
require_once MM_PLUGIN_DIR . 'includes/migrations/class-migration-runner.php';
require_once MM_PLUGIN_DIR . 'includes/reliability/class-circuit-breaker.php';
require_once MM_PLUGIN_DIR . 'includes/reliability/class-safe-http.php';
require_once MM_PLUGIN_DIR . 'includes/modules/interface-module.php';
require_once MM_PLUGIN_DIR . 'includes/modules/abstract-class-module.php';
require_once MM_PLUGIN_DIR . 'includes/modules/class-module-registry.php';
require_once MM_PLUGIN_DIR . 'includes/modules/class-module-legacy.php';
require_once MM_PLUGIN_DIR . 'includes/bootstrap/class-bootstrap.php';

/**
 * Activation: create retry-queue + log tables and schedule cron.
 */
function mm_activate() {
	// Foundation tables.
	if ( class_exists( 'ACTV_Logger' ) ) {
		ACTV_Logger::create_table();
	}

	// Activation preflight — hard-abort on critical failures.
	if ( class_exists( 'ACTV_Preflight' ) ) {
		$pre = ACTV_Preflight::run_activation();
		if ( empty( $pre['ok'] ) ) {
			deactivate_plugins( plugin_basename( __FILE__ ) );
			wp_die(
				'<h1>ACTV TRKR cannot activate</h1>' .
				'<p>The following requirements were not met:</p><ul><li>' .
				implode( '</li><li>', array_map( 'esc_html', $pre['critical'] ) ) .
				'</li></ul><p><a href="' . esc_url( admin_url( 'plugins.php' ) ) . '">← Back to Plugins</a></p>',
				'ACTV TRKR Activation Failed',
				array( 'back_link' => true )
			);
		}
	}

	// Apply pending migrations now so the first request has a valid schema.
	if ( class_exists( 'ACTV_Migration_Runner' ) ) {
		ACTV_Migration_Runner::ensure_pending(
			MM_PLUGIN_DIR . 'includes/migrations/versions'
		);
	}

	// Existing feature setup.
	require_once MM_PLUGIN_DIR . 'includes/class-retry-queue.php';
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
	if ( ! wp_next_scheduled( 'actv_trkr_log_prune' ) ) {
		wp_schedule_event( time() + 3600, 'weekly', 'actv_trkr_log_prune' );
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
	wp_clear_scheduled_hook( 'actv_trkr_log_prune' );
	if ( class_exists( 'MM_Health_Reporter' ) ) {
		MM_Health_Reporter::deactivate();
	}
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

/*
 * Boot via the contained bootstrap. Any escape is swallowed below.
 */
try {
	ACTV_Bootstrap::run( __FILE__ );
} catch ( \Throwable $boot_error ) {
	// Truly last-resort fallback. This block runs ONLY if Bootstrap itself
	// throws something not caught by its internal handler. Load the
	// minimum needed to keep the product working.
	if ( class_exists( 'ACTV_Logger' ) ) {
		ACTV_Logger::fatal( 'core', 'bootstrap_outer_exception', array(
			'message' => $boot_error->getMessage(),
			'file'    => $boot_error->getFile(),
			'line'    => $boot_error->getLine(),
		) );
	}
	// Best-effort minimal init of critical modules. Each is wrapped so
	// one failure does not block the next.
	$critical_init = array(
		'tracker'        => array( MM_PLUGIN_DIR . 'includes/class-tracker.php',        'MM_Tracker' ),
		'forms'          => array( MM_PLUGIN_DIR . 'includes/class-forms.php',          'MM_Forms' ),
		'consent_banner' => array( MM_PLUGIN_DIR . 'includes/class-consent-banner.php', 'MM_Consent_Banner' ),
		'recovery_banner'=> array( MM_PLUGIN_DIR . 'includes/class-recovery-banner.php', 'MM_Recovery_Banner' ),
	);
	foreach ( $critical_init as $key => $pair ) {
		list( $file, $class ) = $pair;
		try {
			if ( file_exists( $file ) ) {
				require_once $file;
			}
			if ( class_exists( $class ) && method_exists( $class, 'init' ) ) {
				call_user_func( array( $class, 'init' ) );
			}
		} catch ( \Throwable $module_error ) {
			// Continue to next critical module.
		}
	}
}

// Cron hooks (kept here for backward compatibility — feature classes
// register their own handlers, but these stable bindings ensure
// scheduled events still find a target even if a module fails to load).
add_action( 'mm_retry_cron',      array( 'MM_Retry_Queue', 'process' ) );
add_action( 'mm_form_probe_cron', array( 'MM_Forms', 'probe_form_pages' ) );
add_action( 'mm_seo_fix_cron',    array( 'MM_SEO_Fixes', 'poll_fixes' ) );

// Idempotent cron scheduling on init (handles upgrades that miss activation).
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
