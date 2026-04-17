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
		
	}

	public static function defaults() {
		return array(
			'api_key'          => '',
			'endpoint_url'     => 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1',
			'enable_tracking'  => '1',
			'enable_gravity'   => '1',
			'enable_heartbeat' => '1',
			'consent_mode'     => 'strict',
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
		$clean['consent_mode']     = in_array( ( $input['consent_mode'] ?? '' ), array( 'strict', 'relaxed' ), true )
			? $input['consent_mode']
			: 'strict';
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
						<th scope="row">Enable Signal</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo self::OPTION_NAME; ?>[enable_heartbeat]" value="1"
									<?php checked( $opts['enable_heartbeat'], '1' ); ?> />
								Send uptime signal (WP-Cron)
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="mm_consent_mode">Consent Mode</label></th>
						<td>
							<select id="mm_consent_mode" name="<?php echo self::OPTION_NAME; ?>[consent_mode]">
								<option value="strict" <?php selected( $opts['consent_mode'], 'strict' ); ?>>Strict (GDPR — no tracking before consent)</option>
								<option value="relaxed" <?php selected( $opts['consent_mode'], 'relaxed' ); ?>>Relaxed (tracking starts immediately)</option>
							</select>
							<p class="description">Strict mode blocks all analytics cookies and events until the visitor grants consent via a CMP (e.g. Complianz).</p>
						</td>
					</tr>
				</table>
				<?php MM_Consent_Banner::render_settings_section(); ?>
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

		$opts      = self::get();
		$api_key   = trim( $opts['api_key'] ?? '' );
		$base_url  = rtrim( $opts['endpoint_url'] ?? '', '/' );
		$domain    = preg_replace( '/^www\./i', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );

		if ( empty( $api_key ) || empty( $base_url ) || empty( $domain ) ) {
			wp_send_json_error( 'Missing API key, endpoint URL, or site domain.' );
		}

		$heartbeat_response = wp_remote_post( $base_url . '/ingest-heartbeat', array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type'   => 'application/json',
				'x-actvtrkr-key' => $api_key,
			),
			'body' => wp_json_encode( array(
				'domain'         => $domain,
				'source'         => 'wp_connection_test',
				'plugin_version' => MM_PLUGIN_VERSION,
				'meta'           => array( 'connection_test' => true ),
			) ),
		) );

		if ( is_wp_error( $heartbeat_response ) ) {
			wp_send_json_error( 'Signal check failed: ' . $heartbeat_response->get_error_message() );
		}

		$heartbeat_code = wp_remote_retrieve_response_code( $heartbeat_response );
		if ( $heartbeat_code < 200 || $heartbeat_code >= 300 ) {
			wp_send_json_error( 'Signal check failed (HTTP ' . $heartbeat_code . '): ' . wp_remote_retrieve_body( $heartbeat_response ) );
		}

		$token_response = wp_remote_post( $base_url . '/issue-site-ingest-token', array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type' => 'application/json',
				'X-Api-Key'    => $api_key,
			),
			'body' => wp_json_encode( array( 'domain' => $domain ) ),
		) );

		if ( is_wp_error( $token_response ) ) {
			wp_send_json_error( 'Token mint failed: ' . $token_response->get_error_message() );
		}

		$token_code = wp_remote_retrieve_response_code( $token_response );
		if ( $token_code < 200 || $token_code >= 300 ) {
			wp_send_json_error( 'Token mint failed (HTTP ' . $token_code . '): ' . wp_remote_retrieve_body( $token_response ) );
		}

		$token_body = json_decode( wp_remote_retrieve_body( $token_response ), true );
		$ingest_token = is_array( $token_body ) ? preg_replace( '/[^a-f0-9]/i', '', (string) ( $token_body['ingest_token'] ?? '' ) ) : '';

		if ( empty( $ingest_token ) || strlen( $ingest_token ) < 32 ) {
			wp_send_json_error( 'Token mint succeeded but returned an invalid ingest token.' );
		}

		update_option( 'mm_ingest_token', array(
			'token'     => $ingest_token,
			'domain'    => $domain,
			'site_id'   => isset( $token_body['site_id'] ) ? (string) $token_body['site_id'] : '',
			'minted_at' => time(),
		), false );

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
					'title'      => 'Connection Test',
				),
				'attribution' => new stdClass(),
				'visitor'     => array( 'visitor_id' => 'test_' . wp_generate_uuid4() ),
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( $response->get_error_message() );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 300 ) {
			delete_transient( 'mm_recovery_status' );
			wp_send_json_success( array( 'message' => 'Connected and tracker token refreshed.' ) );
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

}
