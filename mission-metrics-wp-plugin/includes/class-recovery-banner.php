<?php
/**
 * MM_Recovery_Banner — Polls our /check-site-status endpoint hourly and
 * shows a red admin banner when our server has flagged the site as stalled.
 * Provides a one-click "Reconnect Now" action that re-fires the heartbeat
 * + verifies the API key.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Recovery_Banner {

	const TRANSIENT_STATUS = 'mm_recovery_status';
	const TRANSIENT_TTL    = 900; // 15 minutes

	public static function init() {
		add_action( 'admin_notices', array( __CLASS__, 'maybe_render_banner' ) );
		add_action( 'wp_ajax_mm_recovery_reconnect', array( __CLASS__, 'ajax_reconnect' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
	}

	/**
	 * Poll our server (cached for 15 min) to check stalled status.
	 *
	 * @param bool $force Bypass cache.
	 * @return array{ status:string, message:string }
	 */
	public static function get_status( $force = false ) {
		if ( ! $force ) {
			$cached = get_transient( self::TRANSIENT_STATUS );
			if ( false !== $cached ) return $cached;
		}

		$opts     = MM_Settings::get();
		$api_key  = isset( $opts['api_key'] ) ? trim( $opts['api_key'] ) : '';
		$endpoint = isset( $opts['endpoint_url'] ) ? trim( $opts['endpoint_url'] ) : '';

		if ( empty( $api_key ) || empty( $endpoint ) ) {
			$result = array( 'status' => 'unknown', 'message' => 'Not configured.' );
			set_transient( self::TRANSIENT_STATUS, $result, self::TRANSIENT_TTL );
			return $result;
		}

		$domain = wp_parse_url( home_url(), PHP_URL_HOST );
		$domain = preg_replace( '/^www\./i', '', (string) $domain );

		$url = trailingslashit( $endpoint ) . 'check-site-status?domain=' . rawurlencode( $domain );
		$get_args = array(
			'timeout' => 8,
			'headers' => array( 'x-actvtrkr-key' => $api_key ),
		);
		// Guarded by remote_sync breaker — admin pages must not hang waiting
		// for a status check against an unreachable endpoint.
		$resp = class_exists( 'ACTV_Safe_HTTP' )
			? ACTV_Safe_HTTP::get( 'remote_sync', $url, $get_args )
			: wp_remote_get( $url, $get_args );

		if ( is_wp_error( $resp ) ) {
			$result = array( 'status' => 'unknown', 'message' => 'Status check failed: ' . $resp->get_error_message() );
		} else {
			$body = json_decode( wp_remote_retrieve_body( $resp ), true );
			if ( is_array( $body ) && isset( $body['status'] ) ) {
				$result = array(
					'status'  => sanitize_text_field( $body['status'] ),
					'message' => isset( $body['message'] ) ? sanitize_text_field( $body['message'] ) : '',
				);
			} else {
				$result = array( 'status' => 'unknown', 'message' => 'Unexpected response.' );
			}
		}

		set_transient( self::TRANSIENT_STATUS, $result, self::TRANSIENT_TTL );
		return $result;
	}

	public static function maybe_render_banner() {
		if ( ! current_user_can( 'manage_options' ) ) return;

		$status = self::get_status();
		if ( 'stalled' !== $status['status'] ) return;

		$nonce = wp_create_nonce( 'mm_recovery_reconnect' );
		$msg   = esc_html( $status['message'] ?: 'ACTV TRKR is not receiving tracking data from this site.' );
		?>
		<div class="notice notice-error mm-recovery-banner" id="mm-recovery-banner">
			<p style="font-size:14px;line-height:1.5;">
				<strong style="color:#b32d2e;">ACTV TRKR: Tracking is offline.</strong>
				<?php echo $msg; ?>
				<br><span style="color:#555;font-size:12px;">
					Most fixes take under a minute. Click below to re-test the connection.
				</span>
			</p>
			<p>
				<button type="button" class="button button-primary" id="mm-recovery-reconnect"
					data-nonce="<?php echo esc_attr( $nonce ); ?>">
					Reconnect Now
				</button>
				<a href="<?php echo esc_url( admin_url( 'options-general.php?page=actv-trkr' ) ); ?>"
					class="button button-secondary" style="margin-left:6px;">
					Open Settings
				</a>
				<span id="mm-recovery-result" style="margin-left:10px;font-size:13px;"></span>
			</p>
		</div>
		<?php
	}

	public static function enqueue_assets( $hook ) {
		// Only on standard admin pages
		if ( ! current_user_can( 'manage_options' ) ) return;
		wp_register_script( 'mm-recovery-banner', false, array( 'jquery' ), MM_PLUGIN_VERSION, true );
		wp_enqueue_script( 'mm-recovery-banner' );
		wp_add_inline_script( 'mm-recovery-banner', "
			jQuery(function($){
				$(document).on('click', '#mm-recovery-reconnect', function(){
					var btn = $(this);
					var result = $('#mm-recovery-result');
					btn.prop('disabled', true).text('Reconnecting…');
					result.text('').css('color', '');
					$.post(ajaxurl, {
						action: 'mm_recovery_reconnect',
						_wpnonce: btn.data('nonce')
					}).done(function(resp){
						if (resp && resp.success) {
							result.text('✓ ' + (resp.data && resp.data.message ? resp.data.message : 'Reconnected.')).css('color', '#1b5e20');
							setTimeout(function(){ $('#mm-recovery-banner').slideUp(); }, 2500);
						} else {
							var msg = (resp && resp.data && resp.data.message) ? resp.data.message : 'Reconnect failed. Open Settings to verify your API key.';
							result.text('✗ ' + msg).css('color', '#b32d2e');
							btn.prop('disabled', false).text('Try Again');
						}
					}).fail(function(){
						result.text('✗ Network error. Try again or open Settings.').css('color', '#b32d2e');
						btn.prop('disabled', false).text('Try Again');
					});
				});
			});
		" );
	}

	/**
	 * AJAX: re-fire a heartbeat + clear the cached status. If the heartbeat
	 * succeeds and the next status check returns 'ok', tracking is restored.
	 */
	public static function ajax_reconnect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => 'Insufficient permissions.' ) );
		}
		// F-3 (Phase 0): pass explicit nonce field name for grep-ability.
		check_ajax_referer( 'mm_recovery_reconnect', '_wpnonce' );

		$opts     = MM_Settings::get();
		$api_key  = isset( $opts['api_key'] ) ? trim( $opts['api_key'] ) : '';
		$endpoint = isset( $opts['endpoint_url'] ) ? trim( $opts['endpoint_url'] ) : '';

		if ( empty( $api_key ) || empty( $endpoint ) ) {
			wp_send_json_error( array( 'message' => 'API key not configured. Open Settings to add it.' ) );
		}

		$domain = wp_parse_url( home_url(), PHP_URL_HOST );
		$domain = preg_replace( '/^www\./i', '', (string) $domain );

		// Re-fire heartbeat
		$hb_url = trailingslashit( $endpoint ) . 'ingest-heartbeat';
		$hb_resp = wp_remote_post( $hb_url, array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type'    => 'application/json',
				'x-actvtrkr-key'  => $api_key,
			),
			'body' => wp_json_encode( array(
				'domain'         => $domain,
				'source'         => 'wp_admin_recovery',
				'plugin_version' => defined( 'MM_PLUGIN_VERSION' ) ? MM_PLUGIN_VERSION : null,
				'meta'           => array( 'reconnect' => true ),
			) ),
		) );

		if ( is_wp_error( $hb_resp ) ) {
			wp_send_json_error( array( 'message' => 'Could not reach ACTV TRKR: ' . $hb_resp->get_error_message() ) );
		}

		$code = wp_remote_retrieve_response_code( $hb_resp );
		if ( $code === 401 ) {
			wp_send_json_error( array( 'message' => 'API key rejected. Open Settings and verify the key.' ) );
		}
		if ( $code < 200 || $code >= 300 ) {
			wp_send_json_error( array( 'message' => 'Server returned HTTP ' . intval( $code ) . '. Try again in a minute.' ) );
		}

		// Force a fresh status check
		delete_transient( self::TRANSIENT_STATUS );
		self::get_status( true );

		wp_send_json_success( array( 'message' => 'Connection restored. Tracking will resume immediately.' ) );
	}
}
