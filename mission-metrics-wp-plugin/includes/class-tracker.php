<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * MM_Tracker — enqueues the in-page tracking script.
 *
 * SAFETY (v1.18.2+):
 *   The tracker is passive instrumentation. It MUST NOT load in contexts
 *   where it could cause regressions or where it has no business running:
 *     - admin pages
 *     - AJAX / REST / XML-RPC / cron / feed responses
 *     - login / register / lost-password screens
 *     - the WP customizer preview frame
 *   The script itself is wrapped in an outer try/catch so a runtime error
 *   cannot bubble out and break checkout, forms, payment SDKs, or any other
 *   page script.
 *
 *   The script is enqueued in the footer with no dependencies, so it never
 *   blocks the parser, never delays Time to Interactive, and never races
 *   with theme/payment scripts.
 *
 * SECURITY (v1.9.17+):
 *   Site source uses a narrow-scope ingest token, never the admin API key.
 *   See class-ingest-token.php.
 */
class MM_Tracker {

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * Returns true when the current request is one where we should NOT
	 * load the tracker. Belt-and-braces: many of these never call
	 * wp_enqueue_scripts anyway, but we check explicitly so a misbehaving
	 * theme or plugin can't trick us into enqueueing on the wrong context.
	 */
	private static function should_skip_context() {
		if ( is_admin() ) return true;
		if ( defined( 'DOING_AJAX' ) && DOING_AJAX ) return true;
		if ( defined( 'DOING_CRON' ) && DOING_CRON ) return true;
		if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) return true;
		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) return true;
		if ( function_exists( 'wp_is_json_request' ) && wp_is_json_request() ) return true;
		if ( function_exists( 'is_feed' ) && is_feed() ) return true;
		if ( function_exists( 'is_robots' ) && is_robots() ) return true;
		if ( function_exists( 'is_trackback' ) && is_trackback() ) return true;
		if ( function_exists( 'is_customize_preview' ) && is_customize_preview() ) return true;

		// Skip on the wp-login.php / register / lost-password screens.
		// These are technically "front end" but loading analytics there has
		// no value and risks interfering with auth flows.
		global $pagenow;
		if ( ! empty( $pagenow ) && in_array( $pagenow, array( 'wp-login.php', 'wp-register.php' ), true ) ) {
			return true;
		}

		return false;
	}

	public static function enqueue() {
		if ( self::should_skip_context() ) return;

		$opts = MM_Settings::get();
		if ( $opts['enable_tracking'] !== '1' || empty( $opts['api_key'] ) ) return;

		// Mint or load the narrow-scope ingest token. Never embed the admin key.
		$ingest_token = MM_Ingest_Token::get();
		if ( empty( $ingest_token ) ) {
			// Skip a few pageviews rather than leak the privileged credential.
			return;
		}

		wp_enqueue_script(
			'mm-tracker',
			MM_PLUGIN_URL . 'assets/tracker.js',
			array(),                  // No deps — never wait on jQuery or theme JS.
			MM_PLUGIN_VERSION,
			true                      // In footer — never block the parser.
		);

		// Add `defer` so the browser downloads the script in parallel and
		// runs it after parsing. Combined with footer placement this means
		// the tracker can never delay first paint or Time to Interactive.
		add_filter( 'script_loader_tag', array( __CLASS__, 'add_defer_attr' ), 10, 2 );

		$config = array(
			'endpoint'      => rtrim( $opts['endpoint_url'], '/' ) . '/track-pageview',
			'ingestToken'   => $ingest_token,
			'domain'        => wp_parse_url( home_url(), PHP_URL_HOST ),
			'pluginVersion' => MM_PLUGIN_VERSION,
			'consentMode'   => $opts['consent_mode'] ?? 'strict',
			// QA debug mode: only available to logged-in admins. Reveals
			// window.mmDiag and surfaces internal errors in the console.
			// End users (and unauthenticated visitors) never see this flag.
			'debug'         => self::is_debug_admin(),
		);

		// Pass logged-in WordPress user identity for visitor tracking.
		// SECURITY: only ID + role — never email or display name.
		if ( is_user_logged_in() ) {
			$current_user = wp_get_current_user();
			$config['wpUser'] = array(
				'id'   => $current_user->ID,
				'role' => implode( ',', $current_user->roles ),
			);
		}

		wp_localize_script( 'mm-tracker', 'mmConfig', $config );
	}

	/**
	 * Add `defer` to our tracker script tag without affecting other scripts.
	 */
	public static function add_defer_attr( $tag, $handle ) {
		if ( $handle !== 'mm-tracker' ) return $tag;
		if ( strpos( $tag, ' defer' ) !== false ) return $tag;
		return str_replace( ' src=', ' defer src=', $tag );
	}

	/**
	 * Debug mode is enabled when:
	 *   - the current user is an administrator AND
	 *   - the QA toggle is on in plugin settings, OR
	 *     the URL contains ?actv_debug=1
	 * This keeps QA hooks invisible to real visitors and to the public web.
	 */
	private static function is_debug_admin() {
		if ( ! is_user_logged_in() ) return false;
		if ( ! current_user_can( 'manage_options' ) ) return false;

		// debug_mode lives on the consent banner option group.
		$toggle_on = false;
		if ( class_exists( 'MM_Consent_Banner' ) ) {
			$banner = MM_Consent_Banner::get();
			$toggle_on = ! empty( $banner['debug_mode'] ) && $banner['debug_mode'] === '1';
		}
		$url_on = isset( $_GET['actv_debug'] ) && $_GET['actv_debug'] === '1';

		return $toggle_on || $url_on;
	}
}
