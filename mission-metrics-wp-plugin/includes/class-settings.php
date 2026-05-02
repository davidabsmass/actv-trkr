<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * ACTV TRKR — Settings page
 *
 * 4-tab admin UI (General / Privacy / Tools / Advanced) with a top
 * status bar. All legal/CMP copy lives in MM_Legal_Copy and is shown
 * via Tools-tab modals. Renderers below are intentionally short — the
 * heavy detail (consent diagnostics, privacy detection) is delegated
 * to the existing helper classes.
 */
class MM_Settings {

	const OPTION_GROUP = 'mm_settings';
	const OPTION_NAME  = 'mm_options';

	public static function init() {
		add_action( 'admin_menu',                          array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_init',                          array( __CLASS__, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts',               array( __CLASS__, 'enqueue_assets' ) );
		add_action( 'wp_ajax_mm_test_connection',          array( __CLASS__, 'ajax_test_connection' ) );
		add_action( 'wp_ajax_mm_sync_forms',               array( __CLASS__, 'ajax_sync_forms' ) );
		add_action( 'wp_ajax_mm_connection_state',         array( __CLASS__, 'ajax_connection_state' ) );
		add_action( 'admin_notices',                       array( __CLASS__, 'render_global_connection_notice' ) );
	}

	public static function defaults() {
		return array(
			'api_key'          => '',
			'endpoint_url'     => 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1',
			'enable_tracking'  => '1',
			'enable_gravity'   => '1',
			'enable_heartbeat' => '1',
			'consent_mode'     => 'strict',
			// v1.20.9+: Limited Pre-Consent Tracking (additive, OFF by default).
			// When '1', tracker sends an anonymous pageview-only payload before
			// consent in strict mode (no IDs, no cookies, no journey stitching).
			// Existing sites are completely unaffected unless an admin opts in.
			'limited_pre_consent' => '0',
			// H-3 (Phase 0): /avada-debug REST route is gated behind this flag,
			// off by default. Operators can flip it on temporarily for support.
			'enable_diagnostics' => '0',
		);
	}

	public static function get( $key = null ) {
		$defaults = self::defaults();
		$stored   = get_option( self::OPTION_NAME, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}

		// Self-heal stamped dashboard downloads: if this package contains a
		// bundled API key but the saved settings row is missing/blank, copy the
		// bundled key into the real option immediately. This covers both fresh
		// activations and WP's "replace current with uploaded" update path where
		// activation hooks may not run.
		if ( ! empty( $defaults['api_key'] ) ) {
			$current_key = isset( $stored['api_key'] ) ? trim( (string) $stored['api_key'] ) : '';
			if ( $current_key === '' ) {
				$stored['api_key'] = $defaults['api_key'];
				if ( empty( $stored['endpoint_url'] ) && ! empty( $defaults['endpoint_url'] ) ) {
					$stored['endpoint_url'] = $defaults['endpoint_url'];
				}
				update_option( self::OPTION_NAME, $stored, false );
			}
		}

		$opts = wp_parse_args( $stored, $defaults );
		// Self-heal: if a previous save blanked the endpoint, restore the default.
		if ( empty( $opts['endpoint_url'] ) ) {
			$opts['endpoint_url'] = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1';
		}
		// Self-heal: tracking checkboxes default to ON. Treat anything that
		// isn't an explicit string "0" as enabled, so legacy rows with missing
		// or empty values render checked instead of silently disabling tracking.
		foreach ( array( 'enable_tracking', 'enable_gravity', 'enable_heartbeat' ) as $flag ) {
			if ( ! isset( $opts[ $flag ] ) || $opts[ $flag ] === '' || $opts[ $flag ] === null ) {
				$opts[ $flag ] = '1';
			} elseif ( $opts[ $flag ] !== '0' && $opts[ $flag ] !== '1' ) {
				$opts[ $flag ] = $opts[ $flag ] ? '1' : '0';
			}
		}
		return $key ? ( $opts[ $key ] ?? null ) : $opts;
	}

	public static function add_menu() {
		add_options_page(
			'ACTV TRKR',
			'ACTV TRKR',
			'manage_options',
			'actv-trkr',
			array( __CLASS__, 'render_page' )
		);
	}

	public static function register_settings() {
		register_setting( self::OPTION_GROUP, self::OPTION_NAME, array(
			'sanitize_callback' => array( __CLASS__, 'sanitize' ),
		) );
	}

	public static function sanitize( $input ) {
		// Always start from the existing saved options. Settings forms on
		// other tabs (e.g. Privacy/Banner) don't include hidden inputs for
		// every field, so an unprefixed key would be wiped out on save.
		// Treat any field NOT present in $input as "unchanged".
		$existing = wp_parse_args( get_option( self::OPTION_NAME, array() ), self::defaults() );
		$clean    = $existing;

		// API KEY: never overwrite an existing key with an empty value.
		// The only way to clear/replace it is to paste a new non-empty value.
		if ( array_key_exists( 'api_key', (array) $input ) ) {
			$submitted_key = sanitize_text_field( $input['api_key'] );
			if ( $submitted_key !== '' ) {
				$clean['api_key'] = $submitted_key;
			}
			// else: keep $existing['api_key'] (do NOT clear)
		}

		// ENDPOINT URL: only update if the field is submitted AND non-empty.
		if ( array_key_exists( 'endpoint_url', (array) $input ) && ! empty( $input['endpoint_url'] ) ) {
			$clean['endpoint_url'] = esc_url_raw( $input['endpoint_url'] );
		}
		if ( empty( $clean['endpoint_url'] ) ) {
			$clean['endpoint_url'] = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1';
		}

		// Checkboxes only have a meaning when the form rendered them. We
		// detect that via a hidden marker (`_mm_general_section`) so saves
		// from OTHER tabs don't silently flip these off.
		if ( ! empty( $input['_mm_general_section'] ) ) {
			$clean['enable_tracking']  = ! empty( $input['enable_tracking'] ) ? '1' : '0';
			$clean['enable_gravity']   = ! empty( $input['enable_gravity'] ) ? '1' : '0';
			$clean['enable_heartbeat'] = ! empty( $input['enable_heartbeat'] ) ? '1' : '0';
		}

		// Consent mode: only update when explicitly submitted with a valid value.
		if ( array_key_exists( 'consent_mode', (array) $input )
			&& in_array( $input['consent_mode'], array( 'strict', 'relaxed' ), true ) ) {
			$clean['consent_mode'] = $input['consent_mode'];
		}

		// v1.20.9+: Limited Pre-Consent Tracking toggle. Only update when the
		// Privacy tab marker is present, so saves from other tabs leave the
		// existing value alone (same pattern as enable_tracking checkboxes).
		if ( ! empty( $input['_mm_privacy_section'] ) ) {
			$clean['limited_pre_consent'] = ! empty( $input['limited_pre_consent'] ) ? '1' : '0';
		}

		// H-3 (Phase 0): preserve enable_diagnostics across saves; only
		// overwrite if explicitly present in the submitted form.
		if ( array_key_exists( 'enable_diagnostics', (array) $input ) ) {
			$clean['enable_diagnostics'] = ! empty( $input['enable_diagnostics'] ) ? '1' : '0';
		}

		return $clean;
	}

	/* ── Asset enqueue (settings page only) ──────────────── */
	public static function enqueue_assets( $hook ) {
		if ( 'settings_page_actv-trkr' !== $hook ) return;
		wp_enqueue_style(
			'mm-admin-settings',
			MM_PLUGIN_URL . 'assets/admin-settings.css',
			array(),
			MM_PLUGIN_VERSION
		);
		wp_enqueue_script(
			'mm-admin-settings',
			MM_PLUGIN_URL . 'assets/admin-settings.js',
			array(),
			MM_PLUGIN_VERSION,
			true
		);
		wp_localize_script( 'mm-admin-settings', 'mmSettingsAdmin', array(
			'ajaxurl' => admin_url( 'admin-ajax.php' ),
			'nonces'  => array(
				'test'  => wp_create_nonce( 'mm_test' ),
				'sync'  => wp_create_nonce( 'mm_sync_forms' ),
				'links' => wp_create_nonce( 'mm_scan_links' ),
			),
		) );
	}

	/* ── Page shell: tab nav + status bar ─────────────────── */
	public static function render_page() {
		$tabs = array(
			'general'  => 'General',
			'privacy'  => 'Privacy / Consent',
			'tools'    => 'Tools',
			'advanced' => 'Advanced',
		);
		$active = isset( $_GET['tab'] ) && isset( $tabs[ $_GET['tab'] ] ) ? sanitize_key( $_GET['tab'] ) : 'general';
		$base   = admin_url( 'options-general.php?page=actv-trkr' );
		?>
		<div class="wrap mm-settings-wrap">
			<h1>
				ACTV TRKR
				<span class="mm-version-badge">v<?php echo esc_html( defined( 'MM_PLUGIN_VERSION' ) ? MM_PLUGIN_VERSION : '' ); ?></span>
			</h1>

			<?php self::render_status_bar(); ?>

			<h2 class="nav-tab-wrapper">
				<?php foreach ( $tabs as $key => $label ) : ?>
					<a href="<?php echo esc_url( $base . '&tab=' . $key ); ?>"
					   class="nav-tab <?php echo $active === $key ? 'nav-tab-active' : ''; ?>">
						<?php echo esc_html( $label ); ?>
					</a>
				<?php endforeach; ?>
			</h2>

			<div style="margin-top:18px">
				<?php
				switch ( $active ) {
					case 'privacy':  self::render_tab_privacy();  break;
					case 'tools':    self::render_tab_tools();    break;
					case 'advanced': self::render_tab_advanced(); break;
					case 'general':
					default:         self::render_tab_general();  break;
				}
				?>
			</div>

			<?php self::render_legal_modals(); ?>
		</div>
		<?php
	}

	/* ── Connection hero card + status pills ──────────────── */
	private static function render_status_bar() {
		// New hero card sits above the existing pill row so admins
		// immediately see the live connection state after activation.
		self::render_connection_hero();

		$opts      = self::get();
		$connected = ! empty( $opts['api_key'] ) && ! empty( $opts['endpoint_url'] );
		$tracking  = $opts['enable_tracking'] === '1';

		$banner = class_exists( 'MM_Consent_Banner' ) ? MM_Consent_Banner::get() : array();
		$consent_configured = ! empty( $banner['enabled'] ) && $banner['enabled'] === '1';

		$privacy_found = false;
		$cookie_found  = false;
		if ( class_exists( 'MM_Privacy_Setup' ) ) {
			$pp = MM_Privacy_Setup::detect_privacy_policy();
			$cp = MM_Privacy_Setup::detect_cookie_policy();
			$privacy_found = ( $pp['found'] || ! empty( $banner['privacy_url'] ) );
			$cookie_found  = ( $cp['found'] || ! empty( $banner['cookie_url'] ) );
		}

		$pill = function ( $ok, $okText, $badText, $tone = null ) {
			$cls = $ok ? 'mm-pill-ok' : ( $tone ?: 'mm-pill-warn' );
			$txt = $ok ? $okText : $badText;
			return '<span class="mm-pill ' . esc_attr( $cls ) . '"><span class="mm-dot"></span>' . esc_html( $txt ) . '</span>';
		};
		?>
		<div class="mm-status-bar" role="status" aria-label="ACTV TRKR connection status">
			<?php
			echo $pill( $connected, 'Connected', 'Not connected', 'mm-pill-err' );
			echo $pill( $tracking, 'Tracking on', 'Tracking off', 'mm-pill-muted' );
			echo $pill( $consent_configured, 'Consent configured', 'Consent needs attention' );
			echo $pill( $privacy_found, 'Privacy Policy found', 'Privacy Policy missing' );
			echo $pill( $cookie_found,  'Cookie Policy found',  'Cookie Policy missing' );
			?>
		</div>
		<?php
	}

	/* ── Connection hero card ─────────────────────────────── */
	private static function render_connection_hero() {
		$state  = self::get_connection_state();
		$status = $state['status'];
		$domain = ! empty( $state['domain'] ) ? $state['domain'] : preg_replace( '/^www\./i', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$opts   = self::get();
		$has_key = ! empty( $opts['api_key'] );

		// If the user hasn't pasted a key yet, show a setup-style hero.
		if ( ! $has_key && $status !== 'success' ) {
			$status = 'awaiting_key';
		}

		$dashboard_url = 'https://actvtrkr.com/dashboard';
		$retest_nonce  = wp_create_nonce( 'mm_test' );
		$state_nonce   = wp_create_nonce( 'mm_connection_state' );
		?>
		<div class="mm-hero" data-mm-hero data-status="<?php echo esc_attr( $status ); ?>"
			data-state-nonce="<?php echo esc_attr( $state_nonce ); ?>"
			data-test-nonce="<?php echo esc_attr( $retest_nonce ); ?>">
			<div class="mm-hero-icon" aria-hidden="true">
				<span class="mm-hero-spinner"></span>
			</div>
			<div class="mm-hero-body">
				<h2 class="mm-hero-title"></h2>
				<p class="mm-hero-msg"></p>
				<p class="mm-hero-meta"></p>
			</div>
			<div class="mm-hero-actions">
				<a href="<?php echo esc_url( $dashboard_url ); ?>" target="_blank" rel="noopener"
					class="button button-primary mm-hero-dashboard" style="display:none">Open dashboard ↗</a>
				<button type="button" class="button mm-hero-retest">Re-test connection</button>
			</div>
			<noscript>
				<p>JavaScript is required to see live connection status. Use the Tools tab to test manually.</p>
			</noscript>
			<script type="application/json" class="mm-hero-initial"><?php
				echo wp_json_encode( array(
					'status'  => $status,
					'domain'  => $domain,
					'site_id' => $state['site_id'] ?? '',
					'http'    => (int) ( $state['http_code'] ?? 0 ),
					'error'   => $state['error'] ?? '',
					'message' => $state['message'] ?? '',
					'last'    => (int) ( $state['last_attempt_at'] ?? 0 ),
				) );
			?></script>
		</div>
		<?php
	}

	/**
	 * Read the connection state option with defaults.
	 */
	public static function get_connection_state() {
		$state = get_option( 'mm_connection_state', array() );
		return wp_parse_args( is_array( $state ) ? $state : array(), array(
			'status'           => 'unknown',
			'last_attempt_at'  => 0,
			'http_code'        => 0,
			'error'            => '',
			'domain'           => '',
			'site_id'          => '',
			'message'          => '',
		) );
	}

	/**
	 * Persist the connection state.
	 */
	private static function set_connection_state( array $state ) {
		$state = wp_parse_args( $state, array(
			'status'           => 'unknown',
			'last_attempt_at'  => time(),
			'http_code'        => 0,
			'error'            => '',
			'domain'           => '',
			'site_id'          => '',
			'message'          => '',
		) );
		update_option( 'mm_connection_state', $state, false );
		return $state;
	}

	/**
	 * Top-of-admin notice that mirrors the hero state. Shown on the
	 * Plugins screen and the Dashboard until the site connects or the
	 * admin dismisses it.
	 */
	public static function render_global_connection_notice() {
		if ( ! current_user_can( 'manage_options' ) ) return;
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen ) return;
		// Don't double-render on our own settings page (the hero is right there).
		if ( $screen->id === 'settings_page_actv-trkr' ) return;
		// Only show on Plugins + Dashboard.
		if ( ! in_array( $screen->id, array( 'plugins', 'dashboard' ), true ) ) return;
		// Allow user to dismiss.
		$dismissed = (int) get_user_meta( get_current_user_id(), 'mm_conn_notice_dismissed_at', true );
		if ( $dismissed && ( time() - $dismissed ) < ( 7 * DAY_IN_SECONDS ) ) return;

		$state  = self::get_connection_state();
		$status = $state['status'];
		$opts   = self::get();
		if ( empty( $opts['api_key'] ) ) {
			$status = 'awaiting_key';
		}
		// Hide the notice once we're successfully connected — no nagging.
		if ( $status === 'success' ) return;

		$settings_url = admin_url( 'options-general.php?page=actv-trkr' );
		$class = $status === 'failure' ? 'notice-error' : 'notice-warning';
		$title = 'ACTV TRKR — finishing setup';
		$msg   = 'We\'re testing the connection between this site and your dashboard.';
		if ( $status === 'failure' ) {
			$title = 'ACTV TRKR couldn\'t reach your dashboard';
			$msg   = $state['error'] ? esc_html( $state['error'] ) : 'Connection test failed.';
			if ( ! empty( $state['http_code'] ) ) {
				$msg = 'HTTP ' . (int) $state['http_code'] . ' — ' . $msg;
			}
		} elseif ( $status === 'awaiting_key' ) {
			$title = 'ACTV TRKR needs your API key';
			$msg   = 'Paste the key from your dashboard to start tracking.';
		}
		?>
		<div class="notice <?php echo esc_attr( $class ); ?> is-dismissible mm-global-notice">
			<p>
				<strong><?php echo esc_html( $title ); ?></strong> — <?php echo wp_kses_post( $msg ); ?>
				<a href="<?php echo esc_url( $settings_url ); ?>" class="button button-small" style="margin-left:6px">Open settings</a>
			</p>
		</div>
		<?php
	}

	/**
	 * Shared connection self-test. Used by:
	 *  - The activation cron tick (mm_connection_self_test)
	 *  - The Re-test button in the hero card (ajax_test_connection)
	 *
	 * Writes the result to mm_connection_state and returns the state array.
	 *
	 * @param string $source 'activation' | 'manual' | 'cron'
	 */
	public static function run_connection_self_test( $source = 'manual' ) {
		$opts      = self::get();
		$api_key   = trim( $opts['api_key'] ?? '' );
		$base_url  = rtrim( $opts['endpoint_url'] ?? '', '/' );
		if ( empty( $base_url ) ) {
			$base_url = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1';
		}
		$domain    = preg_replace( '/^www\./i', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$now       = time();

		if ( empty( $api_key ) ) {
			return self::set_connection_state( array(
				'status'           => 'awaiting_key',
				'last_attempt_at'  => $now,
				'http_code'        => 0,
				'error'            => '',
				'domain'           => $domain,
				'site_id'          => '',
				'message'          => 'No API key saved yet.',
			) );
		}
		if ( empty( $domain ) ) {
			return self::set_connection_state( array(
				'status'           => 'failure',
				'last_attempt_at'  => $now,
				'http_code'        => 0,
				'error'            => 'Could not detect this site\'s domain from WordPress settings.',
				'domain'           => '',
				'site_id'          => '',
				'message'          => '',
			) );
		}

		// Mark as in-progress so the UI can spin while the HTTP calls run.
		self::set_connection_state( array(
			'status'           => 'pending',
			'last_attempt_at'  => $now,
			'http_code'        => 0,
			'error'            => '',
			'domain'           => $domain,
			'site_id'          => '',
			'message'          => 'Sending test signal…',
		) );

		// 1. Heartbeat
		$heartbeat_response = wp_remote_post( $base_url . '/ingest-heartbeat', array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type'   => 'application/json',
				'x-actvtrkr-key' => $api_key,
			),
			'body' => wp_json_encode( array(
				'domain'         => $domain,
				'source'         => 'wp_connection_test_' . $source,
				'plugin_version' => MM_PLUGIN_VERSION,
				'meta'           => array( 'connection_test' => true, 'source' => $source ),
			) ),
		) );
		if ( is_wp_error( $heartbeat_response ) ) {
			return self::set_connection_state( array(
				'status' => 'failure', 'last_attempt_at' => time(), 'http_code' => 0,
				'error'  => 'Signal check failed: ' . $heartbeat_response->get_error_message(),
				'domain' => $domain, 'site_id' => '', 'message' => '',
			) );
		}
		$heartbeat_code = wp_remote_retrieve_response_code( $heartbeat_response );
		if ( $heartbeat_code < 200 || $heartbeat_code >= 300 ) {
			return self::set_connection_state( array(
				'status' => 'failure', 'last_attempt_at' => time(), 'http_code' => (int) $heartbeat_code,
				'error'  => self::truncate_body( wp_remote_retrieve_body( $heartbeat_response ) ),
				'domain' => $domain, 'site_id' => '', 'message' => '',
			) );
		}

		// 2. Issue ingest token
		$token_response = wp_remote_post( $base_url . '/issue-site-ingest-token', array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type' => 'application/json',
				'X-Api-Key'    => $api_key,
			),
			'body' => wp_json_encode( array( 'domain' => $domain ) ),
		) );
		if ( is_wp_error( $token_response ) ) {
			return self::set_connection_state( array(
				'status' => 'failure', 'last_attempt_at' => time(), 'http_code' => 0,
				'error'  => 'Token mint failed: ' . $token_response->get_error_message(),
				'domain' => $domain, 'site_id' => '', 'message' => '',
			) );
		}
		$token_code = wp_remote_retrieve_response_code( $token_response );
		if ( $token_code < 200 || $token_code >= 300 ) {
			return self::set_connection_state( array(
				'status' => 'failure', 'last_attempt_at' => time(), 'http_code' => (int) $token_code,
				'error'  => 'Token mint failed: ' . self::truncate_body( wp_remote_retrieve_body( $token_response ) ),
				'domain' => $domain, 'site_id' => '', 'message' => '',
			) );
		}
		$token_body   = json_decode( wp_remote_retrieve_body( $token_response ), true );
		$ingest_token = is_array( $token_body ) ? preg_replace( '/[^a-f0-9]/i', '', (string) ( $token_body['ingest_token'] ?? '' ) ) : '';
		$site_id      = is_array( $token_body ) && isset( $token_body['site_id'] ) ? (string) $token_body['site_id'] : '';

		if ( empty( $ingest_token ) || strlen( $ingest_token ) < 32 ) {
			return self::set_connection_state( array(
				'status' => 'failure', 'last_attempt_at' => time(), 'http_code' => (int) $token_code,
				'error'  => 'Token mint succeeded but returned an invalid ingest token.',
				'domain' => $domain, 'site_id' => $site_id, 'message' => '',
			) );
		}

		update_option( 'mm_ingest_token', array(
			'token'     => $ingest_token,
			'domain'    => $domain,
			'site_id'   => $site_id,
			'minted_at' => time(),
		), false );

		// 3. Warm-up pageview
		$response = wp_remote_post( $base_url . '/track-pageview', array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type'   => 'application/json',
				'X-Ingest-Token' => $ingest_token,
			),
			'body' => wp_json_encode( array(
				'source' => array( 'domain' => $domain, 'type' => 'wordpress', 'plugin_version' => MM_PLUGIN_VERSION ),
				'event'  => array(
					'page_url'   => home_url(),
					'page_path'  => '/',
					'event_id'   => 'test_' . wp_generate_uuid4(),
					'session_id' => 'test_' . wp_generate_uuid4(),
					'title'      => 'Connection Test (' . $source . ')',
				),
				'attribution' => new stdClass(),
				'visitor'     => array( 'visitor_id' => 'test_' . wp_generate_uuid4() ),
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			return self::set_connection_state( array(
				'status' => 'failure', 'last_attempt_at' => time(), 'http_code' => 0,
				'error'  => $response->get_error_message(),
				'domain' => $domain, 'site_id' => $site_id, 'message' => '',
			) );
		}
		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 300 ) {
			delete_transient( 'mm_recovery_status' );
			return self::set_connection_state( array(
				'status' => 'success', 'last_attempt_at' => time(), 'http_code' => (int) $code,
				'error'  => '', 'domain' => $domain, 'site_id' => $site_id,
				'message' => 'Connected and tracker token refreshed.',
			) );
		}
		return self::set_connection_state( array(
			'status' => 'failure', 'last_attempt_at' => time(), 'http_code' => (int) $code,
			'error'  => self::truncate_body( wp_remote_retrieve_body( $response ) ),
			'domain' => $domain, 'site_id' => $site_id, 'message' => '',
		) );
	}

	private static function truncate_body( $body ) {
		$body = (string) $body;
		if ( strlen( $body ) > 240 ) {
			$body = substr( $body, 0, 240 ) . '…';
		}
		return $body;
	}

	/* ── TAB 1: GENERAL ───────────────────────────────────── */
	private static function render_tab_general() {
		$opts = self::get();
		?>
		<form method="post" action="options.php">
			<?php settings_fields( self::OPTION_GROUP ); ?>
			<input type="hidden" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[_mm_general_section]" value="1" />

			<div class="mm-card">
				<h2>Connection</h2>
				<p class="mm-card-desc">Link this site to your ACTV TRKR dashboard.</p>
				<table class="form-table">
					<tr>
						<th scope="row"><label for="mm_api_key">API Key</label></th>
						<td>
							<?php $has_key = ! empty( $opts['api_key'] ); ?>
							<?php if ( $has_key ) : ?>
								<div id="mm-api-key-locked" style="display:flex;align-items:center;gap:10px">
									<code style="font-family:Menlo,Consolas,monospace;background:#f6f7f7;padding:6px 10px;border-radius:4px;border:1px solid #dcdcde">
										<?php echo esc_html( str_repeat( '•', 8 ) . substr( $opts['api_key'], -4 ) ); ?>
									</code>
									<span style="color:#16a34a;font-weight:600">✓ Saved</span>
									<a href="#" id="mm-replace-api-key" class="button button-small">Replace key</a>
								</div>
								<div id="mm-api-key-edit" style="display:none">
									<input type="password" id="mm_api_key" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[api_key]"
										value="" class="regular-text" autocomplete="off" placeholder="Paste new API key" />
									<a href="#" id="mm-cancel-replace-api-key" style="margin-left:8px">Cancel</a>
									<p class="description" style="color:#b91c1c">Saving will replace your current key. Leaving this blank keeps the existing key.</p>
								</div>
								<script>
								(function(){
									var lock = document.getElementById('mm-api-key-locked');
									var edit = document.getElementById('mm-api-key-edit');
									var rep  = document.getElementById('mm-replace-api-key');
									var cancel = document.getElementById('mm-cancel-replace-api-key');
									var input = document.getElementById('mm_api_key');
									if ( rep ) rep.addEventListener('click', function(e){ e.preventDefault(); lock.style.display='none'; edit.style.display='block'; if(input) input.focus(); });
									if ( cancel ) cancel.addEventListener('click', function(e){ e.preventDefault(); edit.style.display='none'; lock.style.display='flex'; if(input) input.value=''; });
								})();
								</script>
							<?php else : ?>
								<input type="password" id="mm_api_key" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[api_key]"
									value="" class="regular-text" autocomplete="off" />
								<p class="description">From your ACTV TRKR dashboard.</p>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row">Connection</th>
						<td>
							<?php
							// Endpoint URL is preconfigured — users never need to set it.
							// We keep it as a hidden input so the value still saves, and
							// expose an "Advanced" toggle for the rare override case.
							$endpoint_default = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1';
							$endpoint_value   = ! empty( $opts['endpoint_url'] ) ? $opts['endpoint_url'] : $endpoint_default;
							?>
							<input type="hidden" id="mm_endpoint" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[endpoint_url]"
								value="<?php echo esc_attr( $endpoint_value ); ?>" />
							<p class="description" style="margin:0">
								Connected to ACTV TRKR automatically. No URL configuration needed.
								<a href="#" id="mm-endpoint-toggle" style="margin-left:8px">Advanced</a>
							</p>
							<div id="mm-endpoint-advanced" style="display:none;margin-top:8px">
								<label for="mm_endpoint_visible" style="display:block;font-weight:600;margin-bottom:4px">Endpoint URL (advanced)</label>
								<input type="url" id="mm_endpoint_visible"
									value="<?php echo esc_attr( $endpoint_value ); ?>"
									class="regular-text"
									oninput="document.getElementById('mm_endpoint').value=this.value" />
								<p class="description">Only change this if ACTV TRKR support told you to.</p>
							</div>
							<script>
							(function(){
								var t=document.getElementById('mm-endpoint-toggle');
								if(!t)return;
								t.addEventListener('click',function(e){
									e.preventDefault();
									var b=document.getElementById('mm-endpoint-advanced');
									b.style.display=(b.style.display==='none'?'block':'none');
								});
							})();
							</script>
						</td>
					</tr>
				</table>
			</div>

			<div class="mm-card">
				<h2>Tracking</h2>
				<p class="mm-card-desc">Core data ACTV TRKR collects from this site.</p>
				<table class="form-table">
					<tr>
						<th scope="row">Enable Tracking</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[enable_tracking]" value="1"
									<?php checked( $opts['enable_tracking'], '1' ); ?> />
								Inject the tracker on front-end pages
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row">Gravity Forms</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[enable_gravity]" value="1"
									<?php checked( $opts['enable_gravity'], '1' ); ?> />
								Send Gravity Forms submissions to ACTV TRKR
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row">Uptime Signal</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[enable_heartbeat]" value="1"
									<?php checked( $opts['enable_heartbeat'], '1' ); ?> />
								Report a periodic uptime signal via WP-Cron
							</label>
						</td>
					</tr>
				</table>
			</div>

			<?php submit_button(); ?>
		</form>

		<!-- Verify connection — placed AFTER the Save button so users save first, then test. -->
		<div class="mm-card">
			<h2>Verify Connection</h2>
			<p class="mm-card-desc">After saving above, click below to confirm this site can reach ACTV TRKR.</p>
			<p>
				<button type="button" id="mm-test-btn" class="button button-secondary">Confirm Connection</button>
				<span id="mm-test-result" class="mm-tool-result" style="margin-left:10px"></span>
			</p>
			<p class="mm-card-desc" style="margin-top:12px">
				Once you see <strong>Connected</strong>, head back to your <a href="https://actvtrkr.com/dashboard" target="_blank" rel="noopener noreferrer">ACTV TRKR dashboard</a> to finish setup.
			</p>
		</div>
		<?php
	}

	/* ── TAB 2: PRIVACY ───────────────────────────────────── */
	private static function render_tab_privacy() {
		if ( ! class_exists( 'MM_Consent_Banner' ) ) {
			echo '<div class="notice notice-error inline"><p>Consent module unavailable.</p></div>';
			return;
		}
		$banner = MM_Consent_Banner::get();
		$main   = self::get();
		$name   = MM_Consent_Banner::OPTION_NAME;

		$privacy = class_exists( 'MM_Privacy_Setup' ) ? MM_Privacy_Setup::detect_privacy_policy() : array( 'found' => false, 'url' => '', 'title' => '' );
		$cookie  = class_exists( 'MM_Privacy_Setup' ) ? MM_Privacy_Setup::detect_cookie_policy()  : array( 'found' => false, 'url' => '', 'title' => '' );

		$external_cmps = array();
		if ( method_exists( 'MM_Consent_Banner', 'detect_external_cmps_public' ) ) {
			$external_cmps = MM_Consent_Banner::detect_external_cmps_public();
		}

		// Determine consent source for the radio (display-only, derived from current state).
		$consent_source = ( $banner['enabled'] === '1' ) ? 'builtin'
			: ( ! empty( $external_cmps ) ? 'external' : 'disabled' );
		?>
		<form method="post" action="options.php">
			<?php settings_fields( self::OPTION_GROUP ); ?>
			<input type="hidden" name="<?php echo esc_attr( self::OPTION_NAME ); ?>[_mm_privacy_section]" value="1" />

			<!-- External CMP detection card -->
			<?php if ( ! empty( $external_cmps ) ) : ?>
			<div class="mm-card" style="border-color:#fbbf24;background:#fffbeb">
				<h3>External consent plugin detected</h3>
				<p class="mm-card-desc" style="color:#78350f">
					<?php
					$names = array_map( function( $c ) { return $c['name']; }, $external_cmps );
					echo esc_html( implode( ', ', $names ) );
					?>
					— add ACTV TRKR to your tool's <em>Analytics / Statistics</em> category. The built-in banner will stay off.
				</p>
				<p style="margin:0">
					<button type="button" class="button button-small" data-mm-open-modal="mm-modal-consent-tool">
						View consent-tool copy →
					</button>
				</p>
			</div>
			<?php endif; ?>

			<!-- Consent setup card -->
			<div class="mm-card">
				<h2>Consent Setup</h2>
				<p class="mm-card-desc">How visitors give consent for ACTV TRKR analytics.</p>

				<table class="form-table">
					<tr>
						<th scope="row">Consent Mode</th>
						<td>
							<label style="display:block;margin-bottom:4px">
								<input type="radio" id="mm-consent-source" name="mm_consent_source" value="builtin" <?php checked( $consent_source, 'builtin' ); ?> />
								Built-in banner (recommended)
							</label>
							<label style="display:block;margin-bottom:4px">
								<input type="radio" name="mm_consent_source" value="external" <?php checked( $consent_source, 'external' ); ?> />
								External consent plugin
							</label>
							<label style="display:block">
								<input type="radio" name="mm_consent_source" value="disabled" <?php checked( $consent_source, 'disabled' ); ?> />
								Disabled
							</label>
							<!-- Hidden field actually persisted -->
							<input type="hidden" name="<?php echo esc_attr( $name ); ?>[enabled]" value="0" />
							<label style="display:none">
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[enabled]" value="1" <?php checked( $banner['enabled'], '1' ); ?> />
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="mm_compliance_mode">Compliance Mode</label></th>
						<td>
							<select id="mm_compliance_mode" name="<?php echo esc_attr( $name ); ?>[compliance_mode]">
								<option value="global_strict" <?php selected( $banner['compliance_mode'], 'global_strict' ); ?>>Global Strict</option>
								<option value="eu_us"         <?php selected( $banner['compliance_mode'], 'eu_us' ); ?>>EU/UK Strict + US Opt-Out</option>
								<option value="custom"        <?php selected( $banner['compliance_mode'], 'custom' ); ?>>Custom</option>
							</select>
							<p class="description">EU/UK + US Opt-Out is recommended.</p>
						</td>
					</tr>
					<tr data-mm-row="other-fallback">
						<th scope="row">Other Regions Fallback</th>
						<td>
							<select name="<?php echo esc_attr( $name ); ?>[other_region_fallback]">
								<option value="strict"  <?php selected( $banner['other_region_fallback'], 'strict' ); ?>>Strict</option>
								<option value="relaxed" <?php selected( $banner['other_region_fallback'], 'relaxed' ); ?>>Relaxed</option>
							</select>
							<p class="description">Used when a visitor isn't in the EU/UK or US.</p>
						</td>
					</tr>
				</table>
			</div>

			<!-- Visitor controls card -->
			<div class="mm-card" data-mm-section="us-controls">
				<h2>Visitor Controls</h2>
				<p class="mm-card-desc">Optional opt-out controls for US-style privacy laws.</p>
				<table class="form-table">
					<tr>
						<th scope="row">Privacy Settings Link</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[us_privacy_link]" value="1" <?php checked( $banner['us_privacy_link'], '1' ); ?> />
								Show a footer link for US visitors to opt out
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label>Link Label</label></th>
						<td>
							<input type="text" name="<?php echo esc_attr( $name ); ?>[us_privacy_label]" value="<?php echo esc_attr( $banner['us_privacy_label'] ); ?>" class="regular-text" />
						</td>
					</tr>
					<tr>
						<th scope="row">US Notice</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[us_show_notice]" value="1" <?php checked( $banner['us_show_notice'], '1' ); ?> />
								Show a small, non-blocking notice
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label>Notice Text</label></th>
						<td>
							<input type="text" name="<?php echo esc_attr( $name ); ?>[us_notice_text]" value="<?php echo esc_attr( $banner['us_notice_text'] ); ?>" class="large-text" />
						</td>
					</tr>
				</table>
			</div>

			<!-- Policy URLs card -->
			<div class="mm-card">
				<h2>Policy Links</h2>
				<p class="mm-card-desc">
					Privacy:
					<?php echo $privacy['found']
						? '<span style="color:#047857">✅ Detected (' . esc_html( $privacy['title'] ) . ')</span>'
						: '<span style="color:#b45309">⚠️ Not detected</span>'; ?>
					&nbsp;·&nbsp;
					Cookie:
					<?php echo $cookie['found']
						? '<span style="color:#047857">✅ Detected</span>'
						: '<span style="color:#b45309">⚠️ Not detected</span>'; ?>
				</p>
				<table class="form-table">
					<tr>
						<th scope="row"><label>Privacy Policy URL</label></th>
						<td>
							<input type="url" name="<?php echo esc_attr( $name ); ?>[privacy_url]" value="<?php echo esc_attr( $banner['privacy_url'] ); ?>" class="regular-text"
								placeholder="<?php echo esc_attr( $privacy['url'] ?: 'https://yoursite.com/privacy-policy' ); ?>" />
						</td>
					</tr>
					<tr>
						<th scope="row"><label>Cookie Policy URL</label></th>
						<td>
							<input type="url" name="<?php echo esc_attr( $name ); ?>[cookie_url]" value="<?php echo esc_attr( $banner['cookie_url'] ); ?>" class="regular-text"
								placeholder="<?php echo esc_attr( $cookie['url'] ?: 'https://yoursite.com/cookie-policy' ); ?>" />
						</td>
					</tr>
				</table>
			</div>

			<!-- Banner content card (only when built-in banner active) -->
			<div class="mm-card mm-conditional" data-mm-section="banner-content">
				<h2>Banner Content</h2>
				<p class="mm-card-desc">Wording shown in the built-in consent banner.</p>
				<table class="form-table">
					<tr><th scope="row"><label>Banner Title</label></th>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[title]" value="<?php echo esc_attr( $banner['title'] ); ?>" class="regular-text" /></td></tr>
					<tr><th scope="row"><label>Banner Description</label></th>
						<td><textarea name="<?php echo esc_attr( $name ); ?>[description]" rows="3" class="large-text"><?php echo esc_textarea( $banner['description'] ); ?></textarea></td></tr>
					<tr><th scope="row"><label>Accept Button</label></th>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[accept_label]" value="<?php echo esc_attr( $banner['accept_label'] ); ?>" class="regular-text" /></td></tr>
					<tr><th scope="row"><label>Reject Button</label></th>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[reject_label]" value="<?php echo esc_attr( $banner['reject_label'] ); ?>" class="regular-text" /></td></tr>
					<tr><th scope="row"><label>Manage Preferences</label></th>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[prefs_label]" value="<?php echo esc_attr( $banner['prefs_label'] ); ?>" class="regular-text" /></td></tr>
				</table>
			</div>

			<!-- Banner display card -->
			<div class="mm-card mm-conditional" data-mm-section="banner-display">
				<h2>Banner Display</h2>
				<p class="mm-card-desc">Where the banner appears and how long consent lasts.</p>
				<table class="form-table">
					<tr><th scope="row"><label>Position</label></th>
						<td>
							<select name="<?php echo esc_attr( $name ); ?>[position]">
								<option value="bottom" <?php selected( $banner['position'], 'bottom' ); ?>>Bottom</option>
								<option value="top"    <?php selected( $banner['position'], 'top' ); ?>>Top</option>
							</select>
						</td></tr>
					<tr><th scope="row"><label>Consent Expiry (days)</label></th>
						<td><input type="number" name="<?php echo esc_attr( $name ); ?>[expiry_days]" value="<?php echo esc_attr( $banner['expiry_days'] ); ?>" min="1" max="730" class="small-text" /></td></tr>
					<tr><th scope="row">Footer Cookie Settings Link</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[show_footer_cookie_link]" value="1" <?php checked( $banner['show_footer_cookie_link'], '1' ); ?> />
								Show the built-in footer link
							</label>
							<br>
							<input type="text" name="<?php echo esc_attr( $name ); ?>[reopener_label]" value="<?php echo esc_attr( $banner['reopener_label'] ); ?>" class="regular-text" style="margin-top:6px" placeholder="Cookie Settings" />
						</td></tr>
				</table>
			</div>

			<!-- v1.20.9+: Limited Pre-Consent Tracking (additive opt-in) -->
			<div class="mm-card">
				<h2>Limited Pre-Consent Tracking <span style="font-weight:400;color:#6b7280;font-size:13px">(Optional)</span></h2>
				<p class="mm-card-desc">
					Allow basic, non-identifying pageview data before consent. Full tracking still requires visitor consent.
				</p>
				<table class="form-table">
					<tr>
						<th scope="row">Pre-consent mode</th>
						<td>
							<label>
								<input type="checkbox"
									name="<?php echo esc_attr( self::OPTION_NAME ); ?>[limited_pre_consent]"
									value="1"
									<?php checked( $main['limited_pre_consent'] ?? '0', '1' ); ?> />
								Send anonymous pageview-only data before the visitor accepts cookies
							</label>
							<p class="description" style="margin-top:8px">
								<strong>What's sent:</strong> page path, timestamp, referrer domain, coarse device type.<br>
								<strong>What's NOT sent:</strong> visitor ID, session ID, cookies, journey stitching, form/lead tracking.
							</p>
						<p class="description" style="color:#b45309;margin-top:8px">
								⚠️ Check local regulations before enabling. This is off by default.
							</p>
						</td>
					</tr>
				</table>
			</div>

			<!-- v1.20.10+: Reset Consent (Debug helper) -->
			<div class="mm-card">
				<h2>Reset Consent <span style="font-weight:400;color:#6b7280;font-size:13px">(Debug)</span></h2>
				<p class="mm-card-desc">
					Clears the stored consent decision for <strong>your current browser only</strong> so you can re-test the consent banner without manually clearing cookies. Does not affect site visitors.
				</p>
				<p>
					<a href="<?php echo esc_url( home_url( '/?mm_reset_consent=1' ) ); ?>"
					   target="_blank"
					   rel="noopener"
					   class="button button-secondary">
						Open site &amp; reset my consent
					</a>
					<span class="description" style="margin-left:10px">
						Opens your homepage and clears <code>mm_consent_decision</code> + <code>mm_optout</code> in this browser, then reloads so the banner reappears.
					</span>
				</p>
			</div>

			<?php submit_button(); ?>
		</form>
		<?php
	}

	/* ── TAB 3: TOOLS ─────────────────────────────────────── */
	private static function render_tab_tools() {
		?>
		<div class="mm-card">
			<h2>Utilities</h2>
			<p class="mm-card-desc">One-off actions and helpers.</p>
			<div class="mm-tool-grid">
				<div class="mm-tool-tile">
					<strong>Sync Forms Now</strong>
					<span class="mm-tile-desc">Scan installed form plugins and register them.</span>
					<button type="button" id="mm-sync-btn" class="button button-primary">Sync Forms</button>
					<span id="mm-sync-result" class="mm-tool-result"></span>
				</div>
				<div class="mm-tool-tile">
					<strong>Broken Link Scan</strong>
					<span class="mm-tile-desc">Crawl your sitemap for 404/5xx links.</span>
					<button type="button" id="mm-links-btn" class="button button-primary">Scan Links</button>
					<span id="mm-links-result" class="mm-tool-result"></span>
				</div>
				<div class="mm-tool-tile">
					<strong>Privacy Policy Text</strong>
					<span class="mm-tile-desc">Copy ready-made text for your Privacy Policy.</span>
					<button type="button" class="button" data-mm-open-modal="mm-modal-privacy">Open</button>
				</div>
				<div class="mm-tool-tile">
					<strong>Consent Tool Text</strong>
					<span class="mm-tile-desc">Copy descriptions for an external CMP.</span>
					<button type="button" class="button" data-mm-open-modal="mm-modal-consent-tool">Open</button>
				</div>
			</div>
		</div>
		<?php
	}

	/* ── TAB 4: ADVANCED ──────────────────────────────────── */
	private static function render_tab_advanced() {
		$banner = class_exists( 'MM_Consent_Banner' ) ? MM_Consent_Banner::get() : array();
		$main   = self::get();
		$name   = MM_Consent_Banner::OPTION_NAME;

		// Build diagnostics via the public helper if available.
		$diag = array();
		if ( class_exists( 'MM_Consent_Banner' ) && method_exists( 'MM_Consent_Banner', 'public_diagnostics' ) ) {
			$diag = MM_Consent_Banner::public_diagnostics();
		}

		$snippets = MM_Legal_Copy::custom_link_snippets();
		?>
		<form method="post" action="options.php">
			<?php settings_fields( self::OPTION_GROUP ); ?>

			<details class="mm-acc" open>
				<summary>Debug &amp; Region Override</summary>
				<div class="mm-acc-body">
					<table class="form-table">
						<tr>
							<th scope="row">Debug Mode</th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[debug_mode]" value="1" <?php checked( $banner['debug_mode'] ?? '0', '1' ); ?> />
									Log banner lifecycle to browser console (admins only)
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row">Region Override</th>
							<td>
								<select name="<?php echo esc_attr( $name ); ?>[region_debug_override]">
									<option value=""      <?php selected( $banner['region_debug_override'] ?? '', '' ); ?>>Auto-detect (production)</option>
									<option value="eu"    <?php selected( $banner['region_debug_override'] ?? '', 'eu' ); ?>>Test as EU/UK</option>
									<option value="us"    <?php selected( $banner['region_debug_override'] ?? '', 'us' ); ?>>Test as US</option>
									<option value="other" <?php selected( $banner['region_debug_override'] ?? '', 'other' ); ?>>Test as Other</option>
								</select>
								<p class="description">Admin testing only — does not affect other visitors.</p>
							</td>
						</tr>
					</table>
				</div>
			</details>

			<?php submit_button( 'Save Advanced Settings' ); ?>
		</form>

		<details class="mm-acc">
			<summary>Diagnostics</summary>
			<div class="mm-acc-body">
				<?php if ( empty( $diag ) ) : ?>
					<p class="description">Diagnostics unavailable.</p>
				<?php else : ?>
					<table class="widefat striped">
						<tbody>
							<?php foreach ( $diag as $k => $v ) :
								if ( is_array( $v ) ) $v = wp_json_encode( $v );
								if ( is_bool( $v ) )  $v = $v ? 'true' : 'false';
								?>
								<tr>
									<td style="width:240px"><code><?php echo esc_html( $k ); ?></code></td>
									<td><?php echo esc_html( (string) $v ); ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
		</details>

		<details class="mm-acc">
			<summary>Custom Cookie Settings link/code snippets</summary>
			<div class="mm-acc-body">
				<p class="description">Trigger the consent preferences modal from your own footer link or button.</p>
				<div class="mm-modal-block">
					<label>Footer link</label>
					<textarea id="mm-snip-link" readonly rows="3"><?php echo esc_textarea( $snippets['link'] ); ?></textarea>
					<button type="button" class="button button-small mm-copy-btn" data-mm-copy-target="mm-snip-link">Copy link</button>
				</div>
				<div class="mm-modal-block">
					<label>Button</label>
					<textarea id="mm-snip-btn" readonly rows="3"><?php echo esc_textarea( $snippets['button'] ); ?></textarea>
					<button type="button" class="button button-small mm-copy-btn" data-mm-copy-target="mm-snip-btn">Copy button</button>
				</div>
			</div>
		</details>

		<details class="mm-acc">
			<summary>Known Limitations</summary>
			<div class="mm-acc-body">
				<ul style="list-style:disc;padding-left:20px;margin:0">
					<li>Region detection is most accurate when your CDN sends a country header (e.g. Cloudflare <code>CF-IPCountry</code>). Without it, browser timezone is used as a fallback.</li>
					<li>This banner controls ACTV TRKR analytics only. Other tracking (Google Analytics, Meta Pixel, etc.) needs its own consent handling.</li>
					<li>US opt-out is not retroactive — events sent before opt-out are not removed.</li>
					<li>Aggressive full-page caching may serve the same banner config to all visitors. Consider cache-splitting by region header.</li>
				</ul>
			</div>
		</details>
		<?php
	}

	/* ── Legal-copy modals (rendered once on every tab) ─── */
	private static function render_legal_modals() {
		$pp = MM_Legal_Copy::privacy_policy_blocks();
		$ct = MM_Legal_Copy::consent_tool_blocks();
		?>
		<dialog id="mm-modal-privacy" class="mm-modal">
			<div class="mm-modal-head">
				<h3>Privacy Policy text</h3>
				<button type="button" class="mm-modal-close" aria-label="Close">×</button>
			</div>
			<div class="mm-modal-body">
				<p class="description">Paste one of these into your site's Privacy Policy page.</p>
				<?php self::render_copy_block( 'mm-pp-short', 'Short version', $pp['short'] ); ?>
				<?php self::render_copy_block( 'mm-pp-full',  'Full version', $pp['full'] ); ?>
				<?php self::render_copy_block( 'mm-pp-tech',  'Technical version', $pp['technical'] ); ?>
			</div>
		</dialog>

		<dialog id="mm-modal-consent-tool" class="mm-modal">
			<div class="mm-modal-head">
				<h3>Consent tool text</h3>
				<button type="button" class="mm-modal-close" aria-label="Close">×</button>
			</div>
			<div class="mm-modal-body">
				<p class="description">Paste into the Analytics / Statistics category of your CMP.</p>
				<?php self::render_copy_block( 'mm-ct-short', 'Short version', $ct['short'] ); ?>
				<?php self::render_copy_block( 'mm-ct-full',  'Full version', $ct['full'] ); ?>
				<?php self::render_copy_block( 'mm-ct-tech',  'Technical version', $ct['technical'] ); ?>
			</div>
		</dialog>
		<?php
	}

	private static function render_copy_block( $id, $label, $text ) {
		?>
		<div class="mm-modal-block">
			<label><?php echo esc_html( $label ); ?></label>
			<textarea id="<?php echo esc_attr( $id ); ?>" readonly rows="3"><?php echo esc_textarea( $text ); ?></textarea>
			<button type="button" class="button button-small mm-copy-btn" data-mm-copy-target="<?php echo esc_attr( $id ); ?>">Copy</button>
		</div>
		<?php
	}

	/* ───────────────────────── AJAX (unchanged) ───────────────────────── */

	public static function ajax_test_connection() {
		check_ajax_referer( 'mm_test', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		$state = self::run_connection_self_test( 'manual' );
		if ( $state['status'] === 'success' ) {
			wp_send_json_success( array(
				'message' => $state['message'] ?: 'Connected.',
				'state'   => $state,
			) );
		}
		$err = $state['error'] ?: ( $state['message'] ?: 'Connection test failed.' );
		if ( ! empty( $state['http_code'] ) ) {
			$err = 'HTTP ' . (int) $state['http_code'] . ' — ' . $err;
		}
		wp_send_json_error( array( 'message' => $err, 'state' => $state ) );
	}

	/**
	 * Lightweight polling endpoint used by the hero card to read the
	 * current connection state without re-running HTTP probes.
	 */
	public static function ajax_connection_state() {
		check_ajax_referer( 'mm_connection_state', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		wp_send_json_success( self::get_connection_state() );
	}

	public static function ajax_sync_forms() {
		check_ajax_referer( 'mm_sync_forms', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		$result = MM_Forms::scan_all_forms();
		if ( ! empty( $result['error'] ) ) {
			wp_send_json_error( $result['error'] );
		}
		wp_send_json_success( $result );
	}
}
