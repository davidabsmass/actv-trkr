<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Settings {

	const OPTION_GROUP = 'mm_settings';
	const OPTION_NAME  = 'mm_options';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'wp_ajax_mm_test_connection', array( __CLASS__, 'ajax_test_connection' ) );
		add_action( 'wp_ajax_mm_sync_forms', array( __CLASS__, 'ajax_sync_forms' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );
	}

	public static function defaults() {
		return array(
			'api_key'          => '',
			'endpoint_url'     => 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1',
			'enable_tracking'  => '1',
			'enable_gravity'   => '1',
			'enable_heartbeat' => '1',
		);
	}

	public static function get( $key = null ) {
		$opts = wp_parse_args( get_option( self::OPTION_NAME, array() ), self::defaults() );
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
		$clean = array();
		$clean['api_key']          = sanitize_text_field( $input['api_key'] ?? '' );
		$clean['endpoint_url']     = esc_url_raw( $input['endpoint_url'] ?? '' );
		$clean['enable_tracking']  = ! empty( $input['enable_tracking'] ) ? '1' : '0';
		$clean['enable_gravity']   = ! empty( $input['enable_gravity'] ) ? '1' : '0';
		$clean['enable_heartbeat'] = ! empty( $input['enable_heartbeat'] ) ? '1' : '0';
		return $clean;
	}

	public static function render_page() {
		$opts = self::get();
		?>
		<div class="wrap">
			<h1>ACTV TRKR</h1>
			<form method="post" action="options.php">
				<?php settings_fields( self::OPTION_GROUP ); ?>
				<table class="form-table">
					<tr>
						<th scope="row"><label for="mm_api_key">API Key</label></th>
						<td>
							<input type="password" id="mm_api_key" name="<?php echo self::OPTION_NAME; ?>[api_key]"
								value="<?php echo esc_attr( $opts['api_key'] ); ?>" class="regular-text" autocomplete="off" />
							<p class="description">Paste the API key from your ACTV TRKR dashboard.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="mm_endpoint">Endpoint URL</label></th>
						<td>
							<input type="url" id="mm_endpoint" name="<?php echo self::OPTION_NAME; ?>[endpoint_url]"
								value="<?php echo esc_attr( $opts['endpoint_url'] ); ?>" class="regular-text" />
						</td>
					</tr>
					<tr>
						<th scope="row">Enable Tracking</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo self::OPTION_NAME; ?>[enable_tracking]" value="1"
									<?php checked( $opts['enable_tracking'], '1' ); ?> />
								Inject tracker.js on all front-end pages
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row">Enable Gravity Forms</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo self::OPTION_NAME; ?>[enable_gravity]" value="1"
									<?php checked( $opts['enable_gravity'], '1' ); ?> />
								Send Gravity Forms submissions to ACTV TRKR
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row">Enable Heartbeat</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo self::OPTION_NAME; ?>[enable_heartbeat]" value="1"
									<?php checked( $opts['enable_heartbeat'], '1' ); ?> />
								Send uptime heartbeat (JS beacon + WP-Cron fallback)
							</label>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

		<hr />
			<h2>Test Connection</h2>
			<p><button type="button" id="mm-test-btn" class="button button-secondary">Test Connection</button></p>
			<div id="mm-test-result"></div>

			<hr />
			<h2>Sync Forms</h2>
			<p class="description">Scan your site for all installed form plugins and register them with ACTV TRKR — even before any submissions.</p>
			<p><button type="button" id="mm-sync-btn" class="button button-secondary">Sync Forms Now</button></p>
			<div id="mm-sync-result"></div>

			<hr />
			<h2>Broken Link Scan</h2>
			<p class="description">Crawl your sitemap and check for broken internal links (404/5xx).</p>
			<p><button type="button" id="mm-links-btn" class="button button-secondary">Scan Broken Links</button></p>
			<div id="mm-links-result"></div>

			<script>
			document.getElementById('mm-test-btn').addEventListener('click', function(){
				var btn = this;
				btn.disabled = true;
				document.getElementById('mm-test-result').textContent = 'Testing…';
				fetch(ajaxurl + '?action=mm_test_connection&_wpnonce=<?php echo wp_create_nonce('mm_test'); ?>')
					.then(r => r.json())
					.then(d => {
						document.getElementById('mm-test-result').textContent = d.success ? '✅ Connected!' : '❌ ' + (d.data || 'Failed');
						btn.disabled = false;
					})
					.catch(() => {
						document.getElementById('mm-test-result').textContent = '❌ Request failed';
						btn.disabled = false;
					});
			});
			document.getElementById('mm-sync-btn').addEventListener('click', function(){
				var btn = this;
				btn.disabled = true;
				document.getElementById('mm-sync-result').textContent = 'Scanning…';
				fetch(ajaxurl + '?action=mm_sync_forms&_wpnonce=<?php echo wp_create_nonce('mm_sync_forms'); ?>')
					.then(r => r.json())
					.then(d => {
						if (d.success) {
							document.getElementById('mm-sync-result').textContent = '✅ Discovered ' + d.data.discovered + ' form(s), synced ' + d.data.synced + '.';
						} else {
							document.getElementById('mm-sync-result').textContent = '❌ ' + (d.data || 'Failed');
						}
						btn.disabled = false;
					})
					.catch(() => {
						document.getElementById('mm-sync-result').textContent = '❌ Request failed';
						btn.disabled = false;
					});
			});
			document.getElementById('mm-links-btn').addEventListener('click', function(){
				var btn = this;
				btn.disabled = true;
				document.getElementById('mm-links-result').textContent = 'Scanning… This may take a minute.';
				fetch(ajaxurl + '?action=mm_scan_broken_links&_wpnonce=<?php echo wp_create_nonce('mm_scan_links'); ?>')
					.then(r => r.json())
					.then(d => {
						if (d.success) {
							document.getElementById('mm-links-result').textContent = '✅ Checked ' + d.data.pages_checked + ' page(s), found ' + d.data.broken_found + ' broken link(s).';
						} else {
							document.getElementById('mm-links-result').textContent = '❌ ' + (d.data || 'Failed');
						}
						btn.disabled = false;
					})
					.catch(() => {
						document.getElementById('mm-links-result').textContent = '❌ Request failed';
						btn.disabled = false;
					});
			});
			</script>
		</div>
		<?php
	}

	public static function ajax_test_connection() {
		check_ajax_referer( 'mm_test', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}

		$opts     = self::get();
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/track-pageview';
		$response = wp_remote_post( $endpoint, array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $opts['api_key'],
			),
			'body' => wp_json_encode( array(
				'source' => array( 'domain' => wp_parse_url( home_url(), PHP_URL_HOST ), 'type' => 'wordpress', 'plugin_version' => MM_PLUGIN_VERSION ),
				'event'  => array( 'page_url' => home_url(), 'event_id' => 'test_' . wp_generate_uuid4(), 'session_id' => 'test', 'title' => 'Connection Test' ),
				'attribution' => new stdClass(),
				'visitor' => array( 'visitor_id' => 'test' ),
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( $response->get_error_message() );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 300 ) {
			wp_send_json_success();
		} else {
			wp_send_json_error( 'HTTP ' . $code . ': ' . wp_remote_retrieve_body( $response ) );
		}
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

	/**
	 * Register REST API routes for remote sync triggers.
	 */
	public static function register_rest_routes() {
		register_rest_route( 'actv-trkr/v1', '/sync', array(
			'methods'             => 'POST',
			'callback'            => array( __CLASS__, 'rest_sync' ),
			'permission_callback' => array( __CLASS__, 'rest_verify_api_key' ),
		) );
	}

	/**
	 * Verify the incoming REST request has a valid API key matching ours.
	 */
	public static function rest_verify_api_key( $request ) {
		$opts = self::get();

		// Method 1: Authorization header with plaintext key
		$header = $request->get_header( 'Authorization' );
		if ( $header ) {
			$token = preg_replace( '/^Bearer\s+/i', '', $header );
			return hash_equals( $opts['api_key'], $token );
		}

		// Method 2: key_hash in request body (used by dashboard trigger)
		$body = $request->get_json_params();
		if ( ! empty( $body['key_hash'] ) ) {
			$local_hash = hash( 'sha256', $opts['api_key'] );
			return hash_equals( $local_hash, $body['key_hash'] );
		}

		return false;
	}

	/**
	 * REST handler: trigger form + entry sync on demand.
	 */
	public static function rest_sync( $request ) {
		// Clear the cooldown transient so scan_all_forms actually runs
		delete_transient( 'actv_trkr_last_form_sync' );
		$result = MM_Forms::scan_all_forms();
		return new WP_REST_Response( array( 'ok' => true, 'result' => $result ), 200 );
	}
