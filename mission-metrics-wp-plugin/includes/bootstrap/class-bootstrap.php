<?php
/**
 * ACTV TRKR plugin bootstrap.
 *
 * Single entry point. Loads only the safe foundation, runs environment
 * checks, resolves the plugin mode, then defers feature loading to the
 * module registry. The whole flow is wrapped in try/catch so a failure
 * here can never fatal the host site.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Bootstrap {

	private static $booted = false;

	/**
	 * Main entry point. Called from the plugin main file.
	 *
	 * @param string $plugin_main_file __FILE__ from the main plugin file.
	 */
	public static function run( $plugin_main_file ) {
		if ( self::$booted ) {
			return;
		}
		self::$booted = true;

		try {
			// 1. Load the safe foundation (already required by main file, but defensive).
			self::ensure_foundation_loaded( $plugin_main_file );

			// 1a. Note the boot started — Update Health detects version changes here.
			if ( class_exists( 'ACTV_Update_Health' ) ) {
				ACTV_Update_Health::note_boot_started();
			}

			// 2. Environment gate.
			$env_failures = ACTV_Environment::check();
			if ( ! empty( $env_failures ) ) {
				ACTV_Mode::set( ACTV_Mode::REDUCED_MODE, 'environment check failed' );
				ACTV_Logger::error( 'core', 'env_check_failed', array( 'failures' => $env_failures ) );
				self::register_admin_notice( 'ACTV TRKR is running in reduced mode: ' . implode( ' ', $env_failures ) );
			}

			// 3. Boot loop detection.
			if ( ACTV_Boot_Counter::is_in_loop() ) {
				$prev_mode = ACTV_Mode::resolve();
				if ( $prev_mode !== ACTV_Mode::REDUCED_MODE && $prev_mode !== ACTV_Mode::MIGRATION_LOCKED ) {
					ACTV_Mode::set( ACTV_Mode::REDUCED_MODE, 'boot loop detected' );
					self::register_admin_notice( 'ACTV TRKR detected repeated startup failures and entered reduced mode. Visit Tools → ACTV TRKR Recovery once available.' );
				}
			}

			// 4. Resolve effective mode (after possible auto-transitions).
			$mode = ACTV_Mode::resolve();

			// 4b. Runtime preflight (cached). Soft-degrade only.
			if ( class_exists( 'ACTV_Preflight' ) ) {
				$pre = ACTV_Preflight::run_runtime();
				if ( ! empty( $pre['critical'] ) && $mode !== ACTV_Mode::MIGRATION_LOCKED ) {
					ACTV_Mode::set( ACTV_Mode::REDUCED_MODE, 'runtime preflight critical' );
					$mode = ACTV_Mode::resolve();
				}
			}

			// 4c. Run pending schema migrations only after deferred setup has completed.
			// Fresh installs set `actv_trkr_pending_setup` during activation so wp-admin
			// pages like Plugins do not block on migrations before admin_init runs.
			$pending_setup = function_exists( 'get_option' ) && get_option( 'actv_trkr_pending_setup' ) === '1';
			if ( ! $pending_setup && $mode !== ACTV_Mode::MIGRATION_LOCKED && class_exists( 'ACTV_Migration_Runner' ) ) {
				$mig_dir = plugin_dir_path( $plugin_main_file ) . 'includes/migrations/versions';
				$mig_res = ACTV_Migration_Runner::ensure_pending( $mig_dir );
				if ( ! empty( $mig_res['error'] ) && empty( $mig_res['skipped'] ) ) {
					self::register_admin_notice(
						'ACTV TRKR is in migration-locked mode. ' .
						'Run "wp actv-trkr migrate --retry" via WP-CLI or contact support.'
					);
					$mode = ACTV_Mode::resolve();
				}
			}

			// 5. Load all feature classes (cheap requires).
			self::load_feature_files( $plugin_main_file );

			// 6. Register modules with the registry.
			self::register_modules();

			// 7. Boot modules under current mode.
			$results = ACTV_Module_Registry::boot( $mode );

			// 8. Determine boot success.
			$any_critical_failed = false;
			foreach ( ACTV_Module_Registry::all() as $key => $module ) {
				if ( $module->is_critical() && isset( $results[ $key ] ) && ! $results[ $key ]['ok'] && ! $results[ $key ]['skipped'] ) {
					$any_critical_failed = true;
					break;
				}
			}

			if ( $any_critical_failed ) {
				ACTV_Boot_Counter::record_failure( 'critical module failed during boot' );
				ACTV_Mode::reset_clean_counter();
				if ( class_exists( 'ACTV_Update_Health' ) ) {
					ACTV_Update_Health::record_failure_boot( 'critical module failed during boot' );
				}
			} else {
				ACTV_Boot_Counter::record_success();
				ACTV_Mode::record_successful_boot();
				if ( class_exists( 'ACTV_Update_Health' ) ) {
					ACTV_Update_Health::record_clean_boot();
				}
			}

			// 9. Schedule maintenance crons (only when not migration_locked).
			if ( $mode !== ACTV_Mode::MIGRATION_LOCKED ) {
				self::schedule_maintenance_crons();
			}
		} catch ( \Throwable $e ) {
			// Last-resort containment. Never let bootstrap escape.
			try {
				ACTV_Boot_Counter::record_failure( $e->getMessage() );
				if ( class_exists( 'ACTV_Update_Health' ) ) {
					ACTV_Update_Health::record_failure_boot( 'bootstrap exception: ' . $e->getMessage() );
				}
				ACTV_Logger::fatal( 'core', 'bootstrap_exception', array(
					'message' => $e->getMessage(),
					'file'    => $e->getFile(),
					'line'    => $e->getLine(),
				) );
			} catch ( \Throwable $inner ) {
				// Truly nothing we can do — return silently.
			}
		}
	}

	/**
	 * Ensure all foundation classes are loaded. The main file already requires
	 * them, but this is defensive in case load order changes.
	 *
	 * @param string $plugin_main_file
	 */
	private static function ensure_foundation_loaded( $plugin_main_file ) {
		$base = plugin_dir_path( $plugin_main_file ) . 'includes/';
		$files = array(
			'observability/class-redactor.php',
			'observability/class-logger.php',
			'bootstrap/class-environment.php',
			'bootstrap/class-mode.php',
			'bootstrap/class-boot-counter.php',
			'bootstrap/class-preflight.php',
			'migrations/class-migration-lock.php',
			'migrations/class-migration-runner.php',
			'reliability/class-circuit-breaker.php',
			'reliability/class-safe-http.php',
			'reliability/class-update-health.php',
			'modules/interface-module.php',
			'modules/abstract-class-module.php',
			'modules/class-module-registry.php',
			'modules/class-module-legacy.php',
			'recovery/class-recovery.php',
		);
		foreach ( $files as $rel ) {
			$path = $base . $rel;
			if ( file_exists( $path ) ) {
				require_once $path;
			}
		}

		// WP-CLI commands — only loaded under WP-CLI context.
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			$cli = $base . 'recovery/class-cli.php';
			if ( file_exists( $cli ) ) {
				try {
					require_once $cli;
				} catch ( \Throwable $e ) {
					// Never let CLI registration break boot.
				}
			}
		}

		// Ensure log table exists only after deferred setup is done.
		// Avoid dbDelta on the Plugins page immediately after upload/activation.
		if ( class_exists( 'ACTV_Logger' ) && function_exists( 'get_option' ) ) {
			$schema_marker = (int) get_option( 'actv_trkr_log_schema', 0 );
			$pending_setup = get_option( 'actv_trkr_pending_setup' ) === '1';
			if ( ! $pending_setup && $schema_marker < 1 ) {
				ACTV_Logger::create_table();
				update_option( 'actv_trkr_log_schema', 1, true );
			}
		}
	}

	/**
	 * Require the existing legacy feature class files.
	 *
	 * @param string $plugin_main_file
	 */
	private static function load_feature_files( $plugin_main_file ) {
		$base = plugin_dir_path( $plugin_main_file ) . 'includes/';
		$files = array(
			'class-legal-copy.php',
			'class-settings.php',
			'class-hmac.php',
			'class-ingest-token.php',
			'class-tracker.php',
			'class-forms.php',
			'class-retry-queue.php',
			'class-import-adapters.php',
			'class-import-engine.php',
			'class-updater.php',
			'class-heartbeat.php',
			'class-broken-links.php',
			'class-seo-fixes.php',
			'class-security.php',
			'class-magic-login.php',
			'class-support-access.php',
			'class-consent-banner.php',
			'class-privacy-setup.php',
			'class-recovery-banner.php',
			'class-health-reporter.php',
		);
		foreach ( $files as $rel ) {
			$path = $base . $rel;
			if ( file_exists( $path ) ) {
				try {
					require_once $path;
				} catch ( \Throwable $e ) {
					ACTV_Logger::error( 'core', 'feature_file_load_failed', array(
						'file'    => $rel,
						'message' => $e->getMessage(),
					) );
				}
			}
		}

		// WooCommerce conditional.
		if ( in_array( 'woocommerce/woocommerce.php', apply_filters( 'active_plugins', get_option( 'active_plugins' ) ), true ) ) {
			$wc_path = $base . 'class-woocommerce.php';
			if ( file_exists( $wc_path ) ) {
				try {
					require_once $wc_path;
				} catch ( \Throwable $e ) {
					ACTV_Logger::error( 'core', 'woocommerce_load_failed', array( 'message' => $e->getMessage() ) );
				}
			}
		}
	}

	/**
	 * Register all modules with the registry.
	 *
	 * Order matters only for dependency resolution; the registry boots in
	 * registration order, so list deps before dependents.
	 */
	private static function register_modules() {
		$reg = 'ACTV_Module_Registry';
		$wrap = function( $key, $name, $class, $init = null, $deps = array(), $critical = false ) use ( $reg ) {
			$reg::register( new ACTV_Module_Legacy( $key, $name, $class, $init, $deps, $critical ) );
		};

		// Settings/admin first (no deps).
		$wrap( 'settings',         'Settings',         'MM_Settings' );

		// HMAC verifier (registers its bootstrap REST route).
		$wrap( 'hmac',             'HMAC Verifier',    'MM_Hmac' );

		// Critical user-facing modules.
		$wrap( 'tracker',          'Tracker',          'MM_Tracker',         null, array(), true );
		$wrap( 'forms',            'Forms',            'MM_Forms',           null, array(), true );
		$wrap( 'consent_banner',   'Consent Banner',   'MM_Consent_Banner',  null, array(), true );

		// Admin / lifecycle.
		$wrap( 'updater',          'Updater',          'MM_Updater' );
		$wrap( 'heartbeat',        'Heartbeat',        'MM_Heartbeat' );
		$wrap( 'broken_links',     'Broken Links',     'MM_Broken_Links' );
		$wrap( 'seo_fixes',        'SEO Fixes',        'MM_SEO_Fixes' );
		$wrap( 'security',         'Security Monitor', 'Mission_Metrics_Security', function() {
			$mm_security = new Mission_Metrics_Security();
			$mm_security->init();
		} );
		$wrap( 'magic_login',      'Magic Login',      'MM_Magic_Login' );
		$wrap( 'support_access',   'Support Access',   'MM_Support_Access' );
		$wrap( 'import_engine',    'Import Engine',    'MM_Import_Engine' );
		$wrap( 'privacy_setup',    'Privacy Setup',    'MM_Privacy_Setup' );
		$wrap( 'recovery_banner',  'Recovery Banner',  'MM_Recovery_Banner' );
		$wrap( 'health_reporter',  'Health Reporter',  'MM_Health_Reporter' );

		// WooCommerce conditional.
		if ( class_exists( 'MM_WooCommerce' ) ) {
			$reg::register( new ACTV_Module_Legacy(
				'woocommerce',
				'WooCommerce',
				'MM_WooCommerce',
				function() { new MM_WooCommerce(); }
			) );
		}
	}

	/**
	 * Schedule the small maintenance crons we own (log pruning).
	 * Existing feature crons (mm_retry_cron, mm_form_probe_cron, mm_seo_fix_cron)
	 * are scheduled by their feature classes — we don't touch them here.
	 */
	private static function schedule_maintenance_crons() {
		try {
			if ( ! wp_next_scheduled( 'actv_trkr_log_prune' ) ) {
				wp_schedule_event( time() + 3600, 'weekly', 'actv_trkr_log_prune' );
			}
			add_action( 'actv_trkr_log_prune', array( 'ACTV_Logger', 'prune' ) );
		} catch ( \Throwable $e ) {
			// Cron scheduling is best-effort.
		}
	}

	/**
	 * Queue a one-shot admin notice via transient.
	 *
	 * @param string $message
	 */
	private static function register_admin_notice( $message ) {
		try {
			set_transient( 'actv_trkr_boot_notice', $message, HOUR_IN_SECONDS );
			add_action( 'admin_notices', function() {
				$msg = get_transient( 'actv_trkr_boot_notice' );
				if ( $msg && current_user_can( 'manage_options' ) ) {
					echo '<div class="notice notice-warning"><p><strong>ACTV TRKR:</strong> ' . esc_html( $msg ) . '</p></div>';
				}
			} );
		} catch ( \Throwable $e ) {
			// Best-effort.
		}
	}
}
