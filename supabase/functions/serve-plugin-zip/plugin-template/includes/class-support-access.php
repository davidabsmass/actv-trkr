<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Temporary Support Access — creates a short-lived WordPress admin user
 * that ACTV TRKR support staff can use to troubleshoot the site, and
 * issues a one-time magic login URL for that user.
 *
 * Lifecycle:
 *   1. Dashboard admin POSTs to /actv-trkr/v1/support-access/grant
 *      → plugin creates a temp WP admin user (actvtrkr_support_<short_id>)
 *      → plugin stores a magic-login token hash bound to that user
 *      → plugin returns the magic-login URL + username + expires_at
 *   2. When the URL is consumed (via MM_Magic_Login::handle_magic_login),
 *      the backend verifier will resolve the requestor email to the
 *      temp user we just created (see `support_user_id` grant metadata).
 *   3. Dashboard admin POSTs to /actv-trkr/v1/support-access/revoke
 *      → plugin deletes the temp WP user, invalidates any pending token.
 *   4. If a grant is never revoked, the plugin's `actv_trkr_support_expire`
 *      cron sweeps expired temp users once per hour.
 *
 * Security:
 *   - Both REST routes are authenticated via MM_Hmac signed headers
 *     (same scheme as /magic-login, /bootstrap-signing-secret).
 *   - The temp user is created with role=administrator but the password
 *     is randomised and NEVER returned; only the magic-login URL can
 *     be used to actually sign in.
 *   - Every create/delete emits a security audit log entry.
 */
class MM_Support_Access {

	const USERNAME_PREFIX       = 'actvtrkr_support_';
	const USER_META_KEY         = 'actv_trkr_support_access';
	const TRANSIENT_TOKEN_PREFIX = 'mm_support_token_';
	const DEFAULT_TTL_HOURS     = 24;

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );

		// Hourly sweep of expired temp users (safety net if dashboard revoke never fires).
		add_action( 'actv_trkr_support_expire', array( __CLASS__, 'sweep_expired' ) );
		if ( ! wp_next_scheduled( 'actv_trkr_support_expire' ) ) {
			wp_schedule_event( time() + 600, 'hourly', 'actv_trkr_support_expire' );
		}
	}

	public static function register_routes() {
		register_rest_route( 'actv-trkr/v1', '/support-access/grant', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_grant' ),
			'permission_callback' => array( __CLASS__, 'verify_request' ),
		) );

		register_rest_route( 'actv-trkr/v1', '/support-access/revoke', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'handle_revoke' ),
			'permission_callback' => array( __CLASS__, 'verify_request' ),
		) );

		register_rest_route( 'actv-trkr/v1', '/support-access/status', array(
			'methods'             => 'GET',
			'callback'            => array( __CLASS__, 'handle_status' ),
			'permission_callback' => array( __CLASS__, 'verify_request' ),
		) );
	}

	/**
	 * Reuse MM_Magic_Login's permission logic — signed-request preferred,
	 * legacy X-Api-Key accepted during the v1.18.x → v1.19.0 transition.
	 */
	public static function verify_request( $request ) {
		if ( class_exists( 'MM_Magic_Login' ) && method_exists( 'MM_Magic_Login', 'verify_api_key' ) ) {
			return MM_Magic_Login::verify_api_key( $request );
		}
		return new WP_Error( 'unavailable', 'Magic login module not loaded', array( 'status' => 503 ) );
	}

	public static function handle_grant( $request ) {
		$body = $request->get_json_params();

		$grant_id       = isset( $body['grant_id'] ) ? sanitize_text_field( $body['grant_id'] ) : '';
		$requested_by   = isset( $body['requested_by_email'] ) ? sanitize_email( $body['requested_by_email'] ) : '';
		$duration_hours = isset( $body['duration_hours'] ) ? (int) $body['duration_hours'] : self::DEFAULT_TTL_HOURS;
		$reason         = isset( $body['reason'] ) ? sanitize_text_field( $body['reason'] ) : '';
		$backend_token  = isset( $body['token'] ) && is_string( $body['token'] )
			? preg_replace( '/[^a-f0-9]/i', '', $body['token'] )
			: '';

		if ( empty( $grant_id ) ) {
			return new WP_Error( 'missing_grant_id', 'grant_id required', array( 'status' => 400 ) );
		}
		if ( empty( $requested_by ) || ! is_email( $requested_by ) ) {
			return new WP_Error( 'missing_email', 'requested_by_email required', array( 'status' => 400 ) );
		}
		if ( ! in_array( $duration_hours, array( 1, 24, 72 ), true ) ) {
			$duration_hours = self::DEFAULT_TTL_HOURS;
		}
		if ( empty( $backend_token ) || strlen( $backend_token ) < 32 ) {
			return new WP_Error( 'missing_token', 'Backend-minted token required', array( 'status' => 400 ) );
		}

		$expires_at = time() + ( $duration_hours * HOUR_IN_SECONDS );

		// Create the temp user.
		$short_id = substr( preg_replace( '/[^a-z0-9]/', '', strtolower( $grant_id ) ), 0, 8 );
		if ( empty( $short_id ) ) {
			$short_id = wp_generate_password( 8, false, false );
		}
		$username = self::USERNAME_PREFIX . $short_id;

		// Handle username collision (extremely unlikely with uuid prefix).
		$suffix = 0;
		while ( username_exists( $username ) && $suffix < 5 ) {
			$suffix++;
			$username = self::USERNAME_PREFIX . $short_id . '_' . $suffix;
		}
		if ( username_exists( $username ) ) {
			return new WP_Error( 'username_conflict', 'Could not allocate a support username', array( 'status' => 409 ) );
		}

		$email = 'support+' . $short_id . '@actvtrkr.com';
		$password = wp_generate_password( 48, true, true );

		$user_id = wp_insert_user( array(
			'user_login'   => $username,
			'user_pass'    => $password,
			'user_email'   => $email,
			'display_name' => 'ACTV TRKR Support',
			'first_name'   => 'ACTV TRKR',
			'last_name'    => 'Support',
			'role'         => 'administrator',
		) );

		if ( is_wp_error( $user_id ) ) {
			return new WP_Error(
				'user_create_failed',
				'WordPress refused to create the support user: ' . $user_id->get_error_message(),
				array( 'status' => 500 )
			);
		}

		// Record grant metadata on the user itself so sweep can find it.
		update_user_meta( $user_id, self::USER_META_KEY, array(
			'grant_id'     => $grant_id,
			'requested_by' => $requested_by,
			'reason'       => $reason,
			'created_at'   => time(),
			'expires_at'   => $expires_at,
			'revoked'      => false,
		) );

		// Store the magic-login token bound to this user.
		// We piggyback on MM_Magic_Login's transient scheme but add a
		// `support_user_id` marker so handle_magic_login can resolve
		// the target WITHOUT needing the backend's `requested_by_email`
		// to match the temp user's synthetic address.
		$token_hash = hash( 'sha256', $backend_token );
		set_transient( MM_Magic_Login::TRANSIENT_PREFIX . $token_hash, array(
			'created_at'      => time(),
			'used'            => false,
			'support_user_id' => $user_id,
			'grant_id'        => $grant_id,
		), $duration_hours * HOUR_IN_SECONDS );

		// Also store a support-scoped marker so /status can enumerate grants.
		set_transient( self::TRANSIENT_TOKEN_PREFIX . $grant_id, array(
			'user_id'    => $user_id,
			'expires_at' => $expires_at,
		), $duration_hours * HOUR_IN_SECONDS );

		$login_url = add_query_arg( array(
			'actv_magic_token' => $backend_token,
		), home_url( '/' ) );

		if ( class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::info( 'support_access', 'grant_created', array(
				'grant_id'     => $grant_id,
				'user_id'      => $user_id,
				'username'     => $username,
				'expires_at'   => $expires_at,
				'requested_by' => $requested_by,
			) );
		}

		do_action( 'mm_support_access_granted', $grant_id, $user_id, $requested_by );

		return rest_ensure_response( array(
			'ok'          => true,
			'grant_id'    => $grant_id,
			'username'    => $username,
			'user_id'     => $user_id,
			'login_url'   => $login_url,
			'expires_at'  => gmdate( 'c', $expires_at ),
			'expires_in'  => $duration_hours * HOUR_IN_SECONDS,
		) );
	}

	public static function handle_revoke( $request ) {
		$body     = $request->get_json_params();
		$grant_id = isset( $body['grant_id'] ) ? sanitize_text_field( $body['grant_id'] ) : '';
		$reason   = isset( $body['reason'] ) ? sanitize_text_field( $body['reason'] ) : 'revoked_by_dashboard';

		if ( empty( $grant_id ) ) {
			return new WP_Error( 'missing_grant_id', 'grant_id required', array( 'status' => 400 ) );
		}

		$marker = get_transient( self::TRANSIENT_TOKEN_PREFIX . $grant_id );
		$user_id = 0;
		if ( is_array( $marker ) && ! empty( $marker['user_id'] ) ) {
			$user_id = (int) $marker['user_id'];
		} else {
			// Fall back: scan users with the meta key.
			$users = get_users( array(
				'meta_key'   => self::USER_META_KEY,
				'number'     => 50,
				'fields'     => array( 'ID' ),
			) );
			foreach ( $users as $u ) {
				$meta = get_user_meta( $u->ID, self::USER_META_KEY, true );
				if ( is_array( $meta ) && isset( $meta['grant_id'] ) && $meta['grant_id'] === $grant_id ) {
					$user_id = (int) $u->ID;
					break;
				}
			}
		}

		$deleted = false;
		$username = null;
		if ( $user_id > 0 ) {
			$user = get_user_by( 'id', $user_id );
			if ( $user ) {
				$username = $user->user_login;
				// Only delete if this really is one of our support users.
				$meta = get_user_meta( $user_id, self::USER_META_KEY, true );
				$is_support_user = is_array( $meta ) && ! empty( $meta['grant_id'] );
				$looks_support   = strpos( $user->user_login, self::USERNAME_PREFIX ) === 0;
				if ( $is_support_user && $looks_support ) {
					require_once ABSPATH . 'wp-admin/includes/user.php';
					// Reassign any content (unlikely) to user ID 1.
					$deleted = wp_delete_user( $user_id, 1 );
				}
			}
		}

		delete_transient( self::TRANSIENT_TOKEN_PREFIX . $grant_id );

		if ( class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::info( 'support_access', 'grant_revoked', array(
				'grant_id' => $grant_id,
				'user_id'  => $user_id,
				'username' => $username,
				'deleted'  => $deleted,
				'reason'   => $reason,
			) );
		}

		do_action( 'mm_support_access_revoked', $grant_id, $user_id, $reason );

		return rest_ensure_response( array(
			'ok'       => true,
			'grant_id' => $grant_id,
			'deleted'  => (bool) $deleted,
		) );
	}

	public static function handle_status( $request ) {
		$users = get_users( array(
			'meta_key' => self::USER_META_KEY,
			'number'   => 50,
		) );
		$out = array();
		$now = time();
		foreach ( $users as $u ) {
			$meta = get_user_meta( $u->ID, self::USER_META_KEY, true );
			if ( ! is_array( $meta ) ) continue;
			$out[] = array(
				'grant_id'   => $meta['grant_id'] ?? null,
				'user_id'    => $u->ID,
				'username'   => $u->user_login,
				'expires_at' => isset( $meta['expires_at'] ) ? gmdate( 'c', (int) $meta['expires_at'] ) : null,
				'expired'    => isset( $meta['expires_at'] ) && $now > (int) $meta['expires_at'],
			);
		}
		return rest_ensure_response( array( 'active_grants' => $out ) );
	}

	/**
	 * Hourly safety sweep: delete any temp support users whose expires_at
	 * has passed. Runs regardless of whether the dashboard revoked them.
	 */
	public static function sweep_expired() {
		$users = get_users( array(
			'meta_key' => self::USER_META_KEY,
			'number'   => 100,
		) );
		$now = time();
		$removed = 0;
		foreach ( $users as $u ) {
			$meta = get_user_meta( $u->ID, self::USER_META_KEY, true );
			if ( ! is_array( $meta ) || empty( $meta['expires_at'] ) ) continue;
			if ( (int) $meta['expires_at'] > $now ) continue;
			if ( strpos( $u->user_login, self::USERNAME_PREFIX ) !== 0 ) continue;

			require_once ABSPATH . 'wp-admin/includes/user.php';
			if ( wp_delete_user( $u->ID, 1 ) ) {
				$removed++;
				if ( ! empty( $meta['grant_id'] ) ) {
					delete_transient( self::TRANSIENT_TOKEN_PREFIX . $meta['grant_id'] );
				}
			}
		}
		if ( $removed > 0 && class_exists( 'ACTV_Logger' ) ) {
			ACTV_Logger::info( 'support_access', 'sweep_expired', array( 'removed' => $removed ) );
		}
	}
}
