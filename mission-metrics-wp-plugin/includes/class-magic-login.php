<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Magic Login – generates one-time, time-limited admin login URLs
 * triggered remotely from the ACTV TRKR dashboard.
 */
class MM_Magic_Login {

	const TRANSIENT_PREFIX = 'mm_magic_token_';
	const TOKEN_TTL        = 900; // 15 minutes

	public static function init() {
		// WP REST API endpoint for token generation (called by edge function)
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		// Front-end URL handler to consume the token
		add_action( 'init', array( __CLASS__, 'handle_magic_login' ), 5 );
	}

	/**
	 * Register REST route: POST /wp-json/actv-trkr/v1/magic-login
	 */
	public static function register_routes() {
		register_rest_route( 'actv-trkr/v1', '/magic-login', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'generate_token' ),
			'permission_callback' => array( __CLASS__, 'verify_api_key' ),
		) );
	}

	/**
	 * Verify the request carries a valid ACTV TRKR API key.
	 */
	public static function verify_api_key( $request ) {
		$auth = $request->get_header( 'X-Api-Key' );
		if ( empty( $auth ) ) {
			return new WP_Error( 'unauthorized', 'Missing API key', array( 'status' => 401 ) );
		}
		$opts    = MM_Settings::get();
		$api_key = $opts['api_key'] ?? '';
		if ( empty( $api_key ) ) {
			return new WP_Error( 'forbidden', 'No API key configured', array( 'status' => 403 ) );
		}
		// Support both raw key comparison and hash comparison
		// The dashboard sends the key_hash (SHA-256), so hash the stored raw key to compare
		$stored_hash = hash( 'sha256', $api_key );
		if ( hash_equals( $api_key, $auth ) || hash_equals( $stored_hash, $auth ) ) {
			return true;
		}
		return new WP_Error( 'forbidden', 'Invalid API key', array( 'status' => 403 ) );
	}

	/**
	 * Generate a one-time login token and return the magic URL.
	 */
	public static function generate_token( $request ) {
		$token = wp_generate_password( 64, false );
		$hash  = hash( 'sha256', $token );

		// Store hashed token in a transient (auto-expires)
		set_transient( self::TRANSIENT_PREFIX . $hash, array(
			'created_at' => time(),
			'ip'         => $request->get_header( 'X-Forwarded-For' ) ?: $_SERVER['REMOTE_ADDR'] ?? '',
			'used'       => false,
		), self::TOKEN_TTL );

		$login_url = add_query_arg( array(
			'actv_magic_token' => $token,
		), home_url( '/' ) );

		return rest_ensure_response( array(
			'login_url'  => $login_url,
			'expires_in' => self::TOKEN_TTL,
		) );
	}

	/**
	 * Handle the magic login URL on the front-end.
	 */
	public static function handle_magic_login() {
		if ( empty( $_GET['actv_magic_token'] ) ) {
			return;
		}

		$token = sanitize_text_field( wp_unslash( $_GET['actv_magic_token'] ) );
		$hash  = hash( 'sha256', $token );
		$data  = get_transient( self::TRANSIENT_PREFIX . $hash );

		if ( ! $data || ! is_array( $data ) ) {
			wp_die(
				'<h2>Invalid or expired login link</h2><p>This link has expired or has already been used. Please generate a new one from the ACTV TRKR dashboard.</p>',
				'Login Failed',
				array( 'response' => 403 )
			);
		}

		if ( ! empty( $data['used'] ) ) {
			delete_transient( self::TRANSIENT_PREFIX . $hash );
			wp_die(
				'<h2>Link already used</h2><p>This login link has already been consumed. Generate a new one from the dashboard.</p>',
				'Login Failed',
				array( 'response' => 403 )
			);
		}

		// Mark as used immediately, then delete
		delete_transient( self::TRANSIENT_PREFIX . $hash );

		// Find the first administrator account
		$admins = get_users( array(
			'role'   => 'administrator',
			'number' => 1,
			'orderby' => 'ID',
			'order'   => 'ASC',
		) );

		if ( empty( $admins ) ) {
			wp_die( 'No administrator account found.', 'Login Failed', array( 'response' => 500 ) );
		}

		$admin = $admins[0];

		// Log in as this administrator
		wp_set_current_user( $admin->ID );
		wp_set_auth_cookie( $admin->ID, false );
		do_action( 'wp_login', $admin->user_login, $admin );

		// Redirect to wp-admin
		wp_safe_redirect( admin_url() );
		exit;
	}
}
