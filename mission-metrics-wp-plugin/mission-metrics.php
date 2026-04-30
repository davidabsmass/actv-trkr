<?php
/**
 * Plugin Name: ACTV TRKR
 * Plugin URI:  https://actvtrkr.com
 * Description: First-party pageview tracking and universal form capture for ACTV TRKR.
 * Version:     1.21.6
 * Author:      Absolutely Massive
 * License:     GPL-2.0-or-later
 * Text Domain: actv-trkr
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MM_PLUGIN_VERSION', '1.21.6' );
define( 'MM_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'MM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * Last-ditch REST recovery routes.
 *
 * These routes are registered from the main plugin file, after normal module
 * boot has had a chance to register its richer routes. If a contained module
 * is disabled, skipped, or fails before registering the sync route, the
 * dashboard still receives a concrete response instead of treating the install
 * as completely gone. This does not mask an uninstalled/deactivated plugin —
 * WordPress will only run this file when ACTV TRKR is active.
 */
function mm_register_recovery_rest_routes() {
	$routes = rest_get_server()->get_routes();

	if ( ! isset( $routes['/actv-trkr/v1/ping'] ) ) {
		register_rest_route( 'actv-trkr/v1', '/ping', array(
			'methods'             => 'GET',
			'callback'            => 'mm_recovery_rest_ping',
			'permission_callback' => '__return_true',
		) );
	}

	if ( ! isset( $routes['/actv-trkr/v1/sync'] ) ) {
		register_rest_route( 'actv-trkr/v1', '/sync', array(
			'methods'             => 'POST',
			'callback'            => 'mm_recovery_rest_sync',
			'permission_callback' => 'mm_recovery_verify_key_hash',
		) );
	}
}
add_action( 'rest_api_init', 'mm_register_recovery_rest_routes', 99 );

function mm_recovery_rest_ping() {
	return new WP_REST_Response( array(
		'ok'             => true,
		'plugin'         => 'actv-trkr',
		'plugin_version' => MM_PLUGIN_VERSION,
	), 200 );
}

function mm_recovery_load_settings_class() {
	if ( ! class_exists( 'MM_Settings' ) && file_exists( MM_PLUGIN_DIR . 'includes/class-settings.php' ) ) {
		require_once MM_PLUGIN_DIR . 'includes/class-settings.php';
	}
}

function mm_recovery_verify_key_hash( $request ) {
	if ( class_exists( 'MM_Forms' ) && method_exists( 'MM_Forms', 'verify_key_hash' ) ) {
		return MM_Forms::verify_key_hash( $request );
	}

	mm_recovery_load_settings_class();
	if ( ! class_exists( 'MM_Settings' ) ) {
		return new WP_Error( 'settings_unavailable', 'Settings module unavailable', array( 'status' => 503 ) );
	}

	$opts = MM_Settings::get();
	if ( empty( $opts['api_key'] ) ) {
		return new WP_Error( 'not_configured', 'Plugin not configured', array( 'status' => 400 ) );
	}

	if ( class_exists( 'MM_Hmac' ) ) {
		$signed = MM_Hmac::verify( $request );
		if ( $signed === true || is_wp_error( $signed ) ) {
			return $signed;
		}
	}

	$body        = $request->get_json_params();
	$key_hash    = is_array( $body ) && isset( $body['key_hash'] ) ? (string) $body['key_hash'] : '';
	$stored_hash = hash( 'sha256', $opts['api_key'] );

	if ( ! $key_hash || ! hash_equals( $stored_hash, $key_hash ) ) {
		return new WP_Error( 'forbidden', 'Invalid key', array( 'status' => 403 ) );
	}

	return true;
}

function mm_recovery_rest_sync( $request ) {
	mm_recovery_load_settings_class();
	if ( ! class_exists( 'MM_Forms' ) && file_exists( MM_PLUGIN_DIR . 'includes/class-forms.php' ) ) {
		require_once MM_PLUGIN_DIR . 'includes/class-forms.php';
	}

	if ( class_exists( 'MM_Forms' ) && method_exists( 'MM_Forms', 'handle_rest_sync' ) ) {
		return MM_Forms::handle_rest_sync( $request );
	}

	return new WP_REST_Response( array(
		'ok'             => false,
		'error'          => 'forms_module_unavailable',
		'message'        => 'ACTV TRKR is active, but the Forms module could not load. Reinstall or update the plugin.',
		'plugin_version' => MM_PLUGIN_VERSION,
	), 503 );
}

/**
 * Detect whether WordPress is currently activating this plugin.
 *
 * During activation, WordPress loads the plugin file before calling the
 * activation hook. We must avoid running the full bootstrap here because it
 * can trigger migrations and schema setup on slow shared hosts, causing a
 * 500/timeout before activation completes.
 *
 * @return bool
 */
function mm_is_plugin_activation_request() {
	if ( defined( 'WP_CLI' ) && WP_CLI ) {
		return false;
	}

	$action = isset( $_REQUEST['action'] ) ? sanitize_key( wp_unslash( $_REQUEST['action'] ) ) : '';
	if ( 'activate' !== $action && 'activate-selected' !== $action ) {
		return false;
	}

	$targets = array();

	if ( isset( $_REQUEST['plugin'] ) ) {
		$targets[] = sanitize_text_field( wp_unslash( $_REQUEST['plugin'] ) );
	}

	if ( isset( $_REQUEST['checked'] ) && is_array( $_REQUEST['checked'] ) ) {
		foreach ( wp_unslash( $_REQUEST['checked'] ) as $checked_plugin ) {
			$targets[] = sanitize_text_field( $checked_plugin );
		}
	}

	foreach ( $targets as $target ) {
		$target = trim( (string) $target );
		if ( '' === $target ) {
			continue;
		}

		if ( false !== strpos( $target, 'actv-trkr.php' ) || false !== strpos( $target, 'mission-metrics.php' ) ) {
			return true;
		}
	}

	return false;
}

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
 * Activation: keep this FAST. Heavy setup (migrations, retry-queue table,
 * cron scheduling) is deferred to the first admin request after activation
 * via the `actv_trkr_pending_setup` flag. This prevents activation
 * timeouts on slow shared hosts where dbDelta + table probes can exceed
 * PHP's max_execution_time and leave the plugin in a half-activated state.
 */
function mm_activate() {
	if ( function_exists( 'set_time_limit' ) ) {
		@set_time_limit( 60 );
	}

	// Foundation log table — wrapped so a DB hiccup never blocks activation.
	try {
		if ( class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::create_table();
		}
	} catch ( \Throwable $e ) {
		// Logger unavailable — preflight will record its own warning.
	}

	// Activation preflight — hard-abort ONLY on truly critical failures
	// (PHP/WP version, options write). Wrapped so a preflight bug
	// never blocks activation.
	try {
		if ( class_exists( 'ACTV_Preflight' ) ) {
			$pre = ACTV_Preflight::run_activation();
			if ( ! empty( $pre ) && empty( $pre['ok'] ) ) {
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
	} catch ( \Throwable $e ) {
		// Preflight failure is non-fatal — defer to runtime checks.
	}

	// Defer migrations + retry-queue table + cron scheduling to first admin request.
	update_option( 'actv_trkr_pending_setup', '1', false );
}
register_activation_hook( __FILE__, 'mm_activate' );

/**
 * Deferred setup: runs once on the first admin_init after activation.
 * Idempotent and time-boxed so a slow host can't stall the dashboard.
 */
function mm_run_deferred_setup() {
	if ( get_option( 'actv_trkr_pending_setup' ) !== '1' ) {
		return;
	}

	if ( function_exists( 'set_time_limit' ) ) {
		@set_time_limit( 120 );
	}

	try {
		if ( class_exists( 'ACTV_Migration_Runner' ) ) {
			ACTV_Migration_Runner::ensure_pending(
				MM_PLUGIN_DIR . 'includes/migrations/versions'
			);
		}
	} catch ( \Throwable $e ) {
		if ( class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::warn( 'core', 'deferred_migrations_failed', array( 'message' => $e->getMessage() ) );
		}
	}

	try {
		require_once MM_PLUGIN_DIR . 'includes/class-retry-queue.php';
		MM_Retry_Queue::create_table();
	} catch ( \Throwable $e ) {
		if ( class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::warn( 'core', 'deferred_retry_table_failed', array( 'message' => $e->getMessage() ) );
		}
	}

	if ( ! wp_next_scheduled( 'actv_trkr_log_prune' ) ) {
		wp_schedule_event( time() + 3600, 'weekly', 'actv_trkr_log_prune' );
	}

	delete_option( 'actv_trkr_pending_setup' );
}
add_action( 'admin_init', 'mm_run_deferred_setup', 1 );


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
 * Boot via the contained bootstrap.
 * IMPORTANT: skip the full bootstrap during the activation request itself.
 * WordPress includes the plugin file before calling the activation hook, so
 * any heavy work here can 500 the activation page before `mm_activate()` runs.
 */
if ( ! mm_is_plugin_activation_request() ) {
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
