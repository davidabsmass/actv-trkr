<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Magic Login – generates one-time, time-limited admin login URLs
 * triggered remotely from the ACTV TRKR dashboard.
 *
 * SECURITY MODEL (v1.9.16+):
 *   - Tokens are minted by the ACTV TRKR backend, NOT by WordPress.
 *   - WordPress merely STORES the token hash and serves the magic URL.
 *   - When the URL is consumed, WordPress calls back to the backend's
 *     /verify-magic-login endpoint to confirm the token is valid,
 *     bound to the correct org, not expired, not revoked, and not
 *     already used. Single-use atomicity is enforced server-side.
 *   - Backwards compatibility: if the backend does not provide a
 *     pre-minted token (older edge function), we fall back to the
 *     legacy local-mint flow but ALSO require backend verification.
 */
class MM_Magic_Login {

	const TRANSIENT_PREFIX = 'mm_magic_token_';
	const TOKEN_TTL        = 900; // 15 minutes

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_action( 'init', array( __CLASS__, 'handle_magic_login' ), 5 );
	}

	public static function register_routes() {
		register_rest_route( 'actv-trkr/v1', '/magic-login', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'generate_token' ),
			'permission_callback' => array( __CLASS__, 'verify_api_key' ),
		) );
	}

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
		$stored_hash = hash( 'sha256', $api_key );
		if ( hash_equals( $api_key, $auth ) || hash_equals( $stored_hash, $auth ) ) {
			return true;
		}
		return new WP_Error( 'forbidden', 'Invalid API key', array( 'status' => 403 ) );
	}

	public static function generate_token( $request ) {
		$body = $request->get_json_params();

		if ( ! empty( $body['token'] ) && is_string( $body['token'] ) ) {
			$token = preg_replace( '/[^a-f0-9]/i', '', $body['token'] );
			if ( strlen( $token ) < 32 ) {
				return new WP_Error( 'invalid_token', 'Bad token format', array( 'status' => 400 ) );
			}
			$ttl = isset( $body['ttl_seconds'] ) ? max( 60, min( 3600, (int) $body['ttl_seconds'] ) ) : self::TOKEN_TTL;
		} else {
			$token = wp_generate_password( 64, false );
			$ttl   = self::TOKEN_TTL;
		}

		$hash = hash( 'sha256', $token );

		set_transient( self::TRANSIENT_PREFIX . $hash, array(
			'created_at' => time(),
			'used'       => false,
		), $ttl );

		$login_url = add_query_arg( array(
			'actv_magic_token' => $token,
		), home_url( '/' ) );

		return rest_ensure_response( array(
			'login_url'  => $login_url,
			'expires_in' => $ttl,
		) );
	}

	private static function backend_verify( $token ) {
		$opts        = MM_Settings::get();
		$endpoint    = rtrim( $opts['endpoint_url'] ?? '', '/' );
		$api_key     = $opts['api_key'] ?? '';
		if ( empty( $endpoint ) || empty( $api_key ) ) {
			return new WP_Error( 'no_backend', 'Backend not configured' );
		}
		$response = wp_remote_post( $endpoint . '/verify-magic-login', array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type' => 'application/json',
				'X-Api-Key'    => $api_key,
			),
			'body'    => wp_json_encode( array( 'token' => $token ) ),
		) );
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'backend_error', 'Backend returned ' . $code );
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) ) {
			return new WP_Error( 'bad_response', 'Backend returned invalid JSON' );
		}
		if ( empty( $data['valid'] ) ) {
			return new WP_Error( 'rejected', 'Backend rejected token: ' . ( $data['reason'] ?? 'unknown' ) );
		}
		return $data;
	}

	public static function handle_magic_login() {
		if ( empty( $_GET['actv_magic_token'] ) ) {
			return;
		}

		$token = sanitize_text_field( wp_unslash( $_GET['actv_magic_token'] ) );
		if ( ! preg_match( '/^[A-Za-z0-9]{32,256}$/', $token ) ) {
			wp_die(
				'<h2>Invalid login link format</h2>',
				'Login Failed',
				array( 'response' => 400 )
			);
		}

		$hash = hash( 'sha256', $token );
		$data = get_transient( self::TRANSIENT_PREFIX . $hash );

		if ( ! $data || ! is_array( $data ) ) {
			wp_die(
				'<h2>Invalid or expired login link</h2><p>This link has expired or has already been used.</p>',
				'Login Failed',
				array( 'response' => 403 )
			);
		}

		if ( ! empty( $data['used'] ) ) {
			delete_transient( self::TRANSIENT_PREFIX . $hash );
			wp_die(
				'<h2>Link already used</h2>',
				'Login Failed',
				array( 'response' => 403 )
			);
		}

		delete_transient( self::TRANSIENT_PREFIX . $hash );

		$verify = self::backend_verify( $token );
		if ( is_wp_error( $verify ) ) {
			wp_die(
				'<h2>Login verification failed</h2><p>' . esc_html( $verify->get_error_message() ) . '</p>',
				'Login Failed',
				array( 'response' => 403 )
			);
		}

		$admins = get_users( array(
			'role'    => 'administrator',
			'number'  => 1,
			'orderby' => 'ID',
			'order'   => 'ASC',
		) );

		if ( empty( $admins ) ) {
			wp_die( 'No administrator account found.', 'Login Failed', array( 'response' => 500 ) );
		}

		$admin = $admins[0];
		wp_set_current_user( $admin->ID );
		wp_set_auth_cookie( $admin->ID, false );
		do_action( 'wp_login', $admin->user_login, $admin );

		wp_safe_redirect( admin_url() );
		exit;
	}
}
