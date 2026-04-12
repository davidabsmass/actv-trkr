<?php
/**
 * Built-in cookie/consent banner for ACTV TRKR.
 * v3 — region-based privacy behavior (EU strict, US opt-out).
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Consent_Banner {

	const OPTION_NAME = 'mm_consent_banner';

	/* ── EU/EEA + UK country codes ──────────────────────────────── */
	private static $eu_eea_countries = array(
		'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU',
		'IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES',
		'SE','IS','LI','NO',
	);
	private static $uk_countries = array( 'GB' );
	private static $us_countries = array( 'US' );

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_front' ), 5 );
		add_action( 'wp_head',            array( __CLASS__, 'inline_bootstrap' ), 1 );
		add_action( 'wp_footer',          array( __CLASS__, 'render_reopener' ) );
		add_action( 'admin_init',         array( __CLASS__, 'register_settings' ) );
		add_action( 'wp_ajax_mm_consent_diag', array( __CLASS__, 'ajax_diagnostics' ) );
	}

	/* ── Defaults ──────────────────────────────────────────────── */

	public static function defaults() {
		return array(
			'enabled'              => '1',
			'title'                => 'Cookie Preferences',
			'description'          => 'We use cookies to understand how you use our site and improve your experience. Analytics cookies are optional.',
			'accept_label'         => 'Accept',
			'reject_label'         => 'Reject',
			'prefs_label'          => 'Manage Preferences',
			'prefs_title'          => 'Cookie Preferences',
			'privacy_url'          => '',
			'privacy_label'        => 'Privacy Policy',
			'cookie_url'           => '',
			'cookie_label'         => 'Cookie Policy',
			'position'             => 'bottom',
			'expiry_days'          => '365',
			'show_reopener'        => '1',
			'reopener_label'       => 'Cookie Settings',
			'debug_mode'           => '0',
			// Region-based privacy
			'compliance_mode'      => 'global_strict', // global_strict | eu_us | custom
			'other_region_fallback'=> 'strict',        // strict | relaxed
			'us_privacy_link'      => '1',
			'us_privacy_label'     => 'Privacy Settings',
			'us_show_notice'       => '0',
			'us_notice_text'       => 'We use analytics cookies to improve your experience. You can opt out anytime via Privacy Settings.',
			'region_debug_override'=> '',              // '' | eu | us | other (admin testing only)
		);
	}

	public static function get( $key = null ) {
		$opts = wp_parse_args( get_option( self::OPTION_NAME, array() ), self::defaults() );
		return $key ? ( $opts[ $key ] ?? null ) : $opts;
	}

	/* ── Sanitize ──────────────────────────────────────────────── */

	public static function sanitize( $input ) {
		$clean = array();
		$d = self::defaults();

		$clean['enabled']        = ! empty( $input['enabled'] ) ? '1' : '0';
		$clean['title']          = sanitize_text_field( $input['title'] ?? $d['title'] );
		$clean['description']    = wp_kses_post( $input['description'] ?? $d['description'] );
		$clean['accept_label']   = sanitize_text_field( $input['accept_label'] ?? $d['accept_label'] );
		$clean['reject_label']   = sanitize_text_field( $input['reject_label'] ?? $d['reject_label'] );
		$clean['prefs_label']    = sanitize_text_field( $input['prefs_label'] ?? $d['prefs_label'] );
		$clean['prefs_title']    = sanitize_text_field( $input['prefs_title'] ?? $d['prefs_title'] );
		$clean['privacy_url']    = esc_url_raw( $input['privacy_url'] ?? '' );
		$clean['privacy_label']  = sanitize_text_field( $input['privacy_label'] ?? $d['privacy_label'] );
		$clean['cookie_url']     = esc_url_raw( $input['cookie_url'] ?? '' );
		$clean['cookie_label']   = sanitize_text_field( $input['cookie_label'] ?? $d['cookie_label'] );
		$clean['position']       = in_array( ( $input['position'] ?? '' ), array( 'bottom', 'top' ), true ) ? $input['position'] : 'bottom';
		$clean['expiry_days']    = max( 1, min( 730, intval( $input['expiry_days'] ?? 365 ) ) );
		$clean['show_reopener']  = ! empty( $input['show_reopener'] ) ? '1' : '0';
		$clean['reopener_label'] = sanitize_text_field( $input['reopener_label'] ?? $d['reopener_label'] );
		$clean['debug_mode']     = ! empty( $input['debug_mode'] ) ? '1' : '0';

		// Region settings
		$valid_modes = array( 'global_strict', 'eu_us', 'custom' );
		$clean['compliance_mode'] = in_array( ( $input['compliance_mode'] ?? '' ), $valid_modes, true )
			? $input['compliance_mode'] : 'global_strict';
		$clean['other_region_fallback'] = in_array( ( $input['other_region_fallback'] ?? '' ), array( 'strict', 'relaxed' ), true )
			? $input['other_region_fallback'] : 'strict';
		$clean['us_privacy_link']  = ! empty( $input['us_privacy_link'] ) ? '1' : '0';
		$clean['us_privacy_label'] = sanitize_text_field( $input['us_privacy_label'] ?? $d['us_privacy_label'] );
		$clean['us_show_notice']   = ! empty( $input['us_show_notice'] ) ? '1' : '0';
		$clean['us_notice_text']   = sanitize_text_field( $input['us_notice_text'] ?? $d['us_notice_text'] );

		$valid_overrides = array( '', 'eu', 'us', 'other' );
		$clean['region_debug_override'] = in_array( ( $input['region_debug_override'] ?? '' ), $valid_overrides, true )
			? $input['region_debug_override'] : '';

		return $clean;
	}

	/* ── Register settings ─────────────────────────────────────── */

	public static function register_settings() {
		register_setting( MM_Settings::OPTION_GROUP, self::OPTION_NAME, array(
			'sanitize_callback' => array( __CLASS__, 'sanitize' ),
		) );
	}

	/* ── Server-side region detection ────────────────────────────
	 * Checks CDN/proxy headers. Returns 'eu', 'us', 'uk', or 'other'.
	 * Falls back to 'unknown' if no header is found (client JS handles timezone fallback).
	 */
	public static function detect_region() {
		$country = '';

		// Check common CDN/proxy country headers
		$headers = array(
			'HTTP_CF_IPCOUNTRY',     // Cloudflare
			'HTTP_X_VERCEL_IP_COUNTRY', // Vercel
			'HTTP_X_COUNTRY_CODE',   // Generic
			'HTTP_X_GEO_COUNTRY',    // Some CDNs
			'GEOIP_COUNTRY_CODE',    // MaxMind / Apache mod_geoip
		);
		foreach ( $headers as $h ) {
			if ( ! empty( $_SERVER[ $h ] ) ) {
				$country = strtoupper( trim( $_SERVER[ $h ] ) );
				break;
			}
		}

		if ( ! $country ) return 'unknown';
		if ( in_array( $country, self::$eu_eea_countries, true ) ) return 'eu';
		if ( in_array( $country, self::$uk_countries, true ) ) return 'eu'; // UK = same strict treatment
		if ( in_array( $country, self::$us_countries, true ) ) return 'us';
		return 'other';
	}

	/* ── Compute effective consent behavior for a region ────────── */

	public static function get_region_behavior( $region, $opts = null ) {
		if ( ! $opts ) $opts = self::get();
		$mode = $opts['compliance_mode'];

		if ( $mode === 'global_strict' ) {
			return 'strict'; // all regions get strict banner
		}

		if ( $mode === 'eu_us' ) {
			if ( $region === 'eu' ) return 'strict';
			if ( $region === 'us' ) return 'us_optout';
			// Other/unknown → fallback
			return $opts['other_region_fallback'] === 'relaxed' ? 'relaxed' : 'strict';
		}

		if ( $mode === 'custom' ) {
			// Custom follows the same pattern but is explicit per the other_region_fallback
			if ( $region === 'eu' ) return 'strict';
			if ( $region === 'us' ) return 'us_optout';
			return $opts['other_region_fallback'] === 'relaxed' ? 'relaxed' : 'strict';
		}

		return 'strict'; // safe default
	}

	/* ── Inline bootstrap config (wp_head, priority 1) ────────── */

	public static function inline_bootstrap() {
		if ( is_admin() ) return;

		$opts = self::get();
		if ( $opts['enabled'] !== '1' ) return;

		$main_opts = MM_Settings::get();
		if ( empty( $main_opts['api_key'] ) ) return;

		$debug_mode = ( $opts['debug_mode'] === '1' && current_user_can( 'manage_options' ) );

		// Region detection
		$detected_region = self::detect_region();

		// Admin debug override (only for logged-in admins)
		if ( $debug_mode && ! empty( $opts['region_debug_override'] ) && current_user_can( 'manage_options' ) ) {
			$detected_region = $opts['region_debug_override'];
		}

		$behavior = self::get_region_behavior( $detected_region, $opts );

		$config = array(
			'enabled'          => true,
			'title'            => $opts['title'],
			'description'      => $opts['description'],
			'acceptLabel'      => $opts['accept_label'],
			'rejectLabel'      => $opts['reject_label'],
			'prefsLabel'       => $opts['prefs_label'],
			'prefsTitle'       => $opts['prefs_title'],
			'privacyUrl'       => $opts['privacy_url'],
			'privacyLabel'     => $opts['privacy_label'],
			'cookieUrl'        => $opts['cookie_url'],
			'cookieLabel'      => $opts['cookie_label'],
			'position'         => $opts['position'],
			'expiryDays'       => intval( $opts['expiry_days'] ),
			'showReopener'     => $opts['show_reopener'] === '1',
			'consentMode'      => $main_opts['consent_mode'] ?? 'strict',
			'debugMode'        => $debug_mode,
			// Region data
			'complianceMode'   => $opts['compliance_mode'],
			'detectedRegion'   => $detected_region,
			'regionBehavior'   => $behavior,
			'usPrivacyLink'    => $opts['us_privacy_link'] === '1',
			'usPrivacyLabel'   => $opts['us_privacy_label'],
			'usShowNotice'     => $opts['us_show_notice'] === '1',
			'usNoticeText'     => $opts['us_notice_text'],
		);

		echo '<script id="mm-consent-bootstrap">window.mmConsentBannerConfig=' . wp_json_encode( $config ) . ';</script>' . "\n";
	}

	/* ── Front-end enqueue ─────────────────────────────────────── */

	public static function enqueue_front() {
		if ( is_admin() ) return;

		$opts = self::get();
		if ( $opts['enabled'] !== '1' ) return;

		$main_opts = MM_Settings::get();
		if ( empty( $main_opts['api_key'] ) ) return;

		wp_enqueue_style(
			'mm-consent-banner',
			MM_PLUGIN_URL . 'assets/consent-banner.css',
			array(),
			MM_PLUGIN_VERSION
		);

		wp_enqueue_script(
			'mm-consent-banner',
			MM_PLUGIN_URL . 'assets/consent-banner.js',
			array( 'mm-tracker' ),
			MM_PLUGIN_VERSION,
			true
		);

		// Fallback localize
		$debug_mode = ( $opts['debug_mode'] === '1' && current_user_can( 'manage_options' ) );
		$detected_region = self::detect_region();
		if ( $debug_mode && ! empty( $opts['region_debug_override'] ) && current_user_can( 'manage_options' ) ) {
			$detected_region = $opts['region_debug_override'];
		}
		$behavior = self::get_region_behavior( $detected_region, $opts );

		wp_localize_script( 'mm-consent-banner', 'mmConsentBannerConfig', array(
			'enabled'          => true,
			'title'            => $opts['title'],
			'description'      => $opts['description'],
			'acceptLabel'      => $opts['accept_label'],
			'rejectLabel'      => $opts['reject_label'],
			'prefsLabel'       => $opts['prefs_label'],
			'prefsTitle'       => $opts['prefs_title'],
			'privacyUrl'       => $opts['privacy_url'],
			'privacyLabel'     => $opts['privacy_label'],
			'cookieUrl'        => $opts['cookie_url'],
			'cookieLabel'      => $opts['cookie_label'],
			'position'         => $opts['position'],
			'expiryDays'       => intval( $opts['expiry_days'] ),
			'showReopener'     => $opts['show_reopener'] === '1',
			'consentMode'      => $main_opts['consent_mode'] ?? 'strict',
			'debugMode'        => $debug_mode,
			'complianceMode'   => $opts['compliance_mode'],
			'detectedRegion'   => $detected_region,
			'regionBehavior'   => $behavior,
			'usPrivacyLink'    => $opts['us_privacy_link'] === '1',
			'usPrivacyLabel'   => $opts['us_privacy_label'],
			'usShowNotice'     => $opts['us_show_notice'] === '1',
			'usNoticeText'     => $opts['us_notice_text'],
		) );
	}

	/* ── Footer reopener link ──────────────────────────────────── */

	public static function render_reopener() {
		$opts = self::get();
		if ( $opts['enabled'] !== '1' ) return;

		// Always render the reopener container — JS will control visibility based on region
		$cookie_label = esc_html( $opts['reopener_label'] ?: 'Cookie Settings' );
		$privacy_label = esc_html( $opts['us_privacy_label'] ?: 'Privacy Settings' );

		echo '<div id="mm-cb-footer-links" style="text-align:center;padding:8px 0;">';

		// Cookie settings link (EU/strict regions)
		if ( $opts['show_reopener'] === '1' ) {
			echo '<a href="#" id="mm-cookie-settings" class="mm-cb-reopen" role="button" tabindex="0" style="display:none;">' . $cookie_label . '</a>';
		}

		// US privacy settings link
		if ( $opts['us_privacy_link'] === '1' ) {
			echo '<a href="#" id="mm-privacy-settings" class="mm-cb-reopen mm-cb-privacy-link" role="button" tabindex="0" style="display:none;">' . $privacy_label . '</a>';
		}

		echo '</div>';
	}

	/* ── AJAX diagnostics endpoint ─────────────────────────────── */

	public static function ajax_diagnostics() {
		check_ajax_referer( 'mm_consent_diag', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}

		$opts      = self::get();
		$main_opts = MM_Settings::get();
		$diag = self::build_diagnostics( $opts, $main_opts );
		wp_send_json_success( $diag );
	}

	/* ── Build diagnostics data ────────────────────────────────── */

	private static function build_diagnostics( $opts = null, $main_opts = null ) {
		if ( ! $opts )      $opts      = self::get();
		if ( ! $main_opts ) $main_opts = MM_Settings::get();

		$css_registered = wp_style_is( 'mm-consent-banner', 'registered' ) || wp_style_is( 'mm-consent-banner', 'enqueued' );
		$js_registered  = wp_script_is( 'mm-consent-banner', 'registered' ) || wp_script_is( 'mm-consent-banner', 'enqueued' );

		$detected_region = self::detect_region();
		$behavior = self::get_region_behavior( $detected_region, $opts );

		$conflict_hints = array();

		$consent_plugins = array(
			'complianz-gdpr/complianz-gpdr.php',
			'cookie-law-info/cookie-law-info.php',
			'cookiebot/cookiebot.php',
			'real-cookie-banner/index.php',
			'gdpr-cookie-compliance/moove-gdpr.php',
			'cookie-notice/cookie-notice.php',
		);
		$active_plugins = apply_filters( 'active_plugins', get_option( 'active_plugins' ) );
		foreach ( $consent_plugins as $cp ) {
			if ( in_array( $cp, $active_plugins, true ) ) {
				$conflict_hints[] = 'Another consent/cookie plugin is active: ' . dirname( $cp ) . '. This may conflict with the built-in banner.';
			}
		}

		$optim_plugins = array(
			'autoptimize/autoptimize.php',
			'wp-rocket/wp-rocket.php',
			'w3-total-cache/w3-total-cache.php',
			'litespeed-cache/litespeed-cache.php',
			'sg-cachepress/sg-cachepress.php',
			'flying-scripts/flying-scripts.php',
			'async-javascript/async-javascript.php',
		);
		foreach ( $optim_plugins as $op ) {
			if ( in_array( $op, $active_plugins, true ) ) {
				$conflict_hints[] = 'Optimization plugin detected: ' . dirname( $op ) . '. JS defer/delay may block the consent banner. Exclude mm-consent-banner.js and mm-tracker.js from optimization.';
			}
		}

		if ( empty( $opts['privacy_url'] ) ) {
			$conflict_hints[] = 'No Privacy Policy URL configured. Consider adding one for GDPR compliance.';
		}
		if ( empty( $opts['cookie_url'] ) ) {
			$conflict_hints[] = 'No Cookie Policy URL configured.';
		}
		if ( empty( $main_opts['api_key'] ) ) {
			$conflict_hints[] = 'No API key configured — banner will not render without a valid API key.';
		}
		if ( $detected_region === 'unknown' ) {
			$conflict_hints[] = 'Could not detect visitor region from server headers. The frontend will use timezone-based detection as a fallback. For best accuracy, use a CDN like Cloudflare that provides country headers.';
		}

		return array(
			'banner_enabled'         => $opts['enabled'] === '1',
			'consent_mode'           => $main_opts['consent_mode'] ?? 'strict',
			'compliance_mode'        => $opts['compliance_mode'],
			'detected_region'        => $detected_region,
			'region_behavior'        => $behavior,
			'other_fallback'         => $opts['other_region_fallback'],
			'us_privacy_link'        => $opts['us_privacy_link'] === '1',
			'us_show_notice'         => $opts['us_show_notice'] === '1',
			'region_debug_override'  => $opts['region_debug_override'],
			'js_registered'          => $js_registered,
			'css_registered'         => $css_registered,
			'footer_reopener'        => $opts['show_reopener'] === '1',
			'debug_mode'             => $opts['debug_mode'] === '1',
			'position'               => $opts['position'],
			'expiry_days'            => intval( $opts['expiry_days'] ),
			'api_key_present'        => ! empty( $main_opts['api_key'] ),
			'privacy_url_set'        => ! empty( $opts['privacy_url'] ),
			'cookie_url_set'         => ! empty( $opts['cookie_url'] ),
			'conflict_hints'         => $conflict_hints,
			'plugin_version'         => defined( 'MM_PLUGIN_VERSION' ) ? MM_PLUGIN_VERSION : 'unknown',
		);
	}

	/* ── Admin settings UI ────────────────────────────────────── */

	public static function render_settings_section() {
		$opts = self::get();
		$main_opts = MM_Settings::get();
		$name = self::OPTION_NAME;
		$diag = self::build_diagnostics( $opts, $main_opts );
		?>
		<hr />
		<h2>Consent Banner</h2>
		<p class="description">Built-in cookie consent banner. When enabled, visitors see an accept/reject prompt — no third-party consent plugin needed.</p>

		<table class="form-table">
			<tr>
				<th scope="row">Enable Banner</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[enabled]" value="1" <?php checked( $opts['enabled'], '1' ); ?> />
						Show built-in consent banner on front-end pages
					</label>
				</td>
			</tr>
		</table>

		<hr />
		<h2>Region-Based Privacy</h2>
		<p class="description">
			Control how ACTV TRKR analytics consent behaves for visitors from different regions.<br>
			<strong>EU/UK</strong> = opt-in (consent banner blocks analytics until accepted).<br>
			<strong>US</strong> = opt-out (analytics run, visitor can opt out anytime via Privacy Settings).<br>
			This controls <strong>ACTV TRKR analytics only</strong> — not third-party tracking from other plugins.
		</p>

		<table class="form-table">
			<tr>
				<th scope="row"><label for="mm_compliance_mode">Compliance Mode</label></th>
				<td>
					<select id="mm_compliance_mode" name="<?php echo $name; ?>[compliance_mode]">
						<option value="global_strict" <?php selected( $opts['compliance_mode'], 'global_strict' ); ?>>Global Strict — banner for all visitors</option>
						<option value="eu_us" <?php selected( $opts['compliance_mode'], 'eu_us' ); ?>>EU/UK Strict + US Opt-Out (Recommended)</option>
						<option value="custom" <?php selected( $opts['compliance_mode'], 'custom' ); ?>>Custom Region Rules</option>
					</select>
					<p class="description">
						<strong>Global Strict:</strong> All visitors see consent banner; analytics blocked until accepted.<br>
						<strong>EU/UK Strict + US Opt-Out:</strong> EU/UK visitors must opt in; US visitors can opt out. Other regions follow fallback.<br>
						<strong>Custom:</strong> Same as EU/UK + US but lets you control Other region behavior explicitly.
					</p>
				</td>
			</tr>
			<tr id="mm-other-fallback-row">
				<th scope="row"><label>Other Regions Fallback</label></th>
				<td>
					<select name="<?php echo $name; ?>[other_region_fallback]">
						<option value="strict" <?php selected( $opts['other_region_fallback'], 'strict' ); ?>>Strict (show banner, block until consent)</option>
						<option value="relaxed" <?php selected( $opts['other_region_fallback'], 'relaxed' ); ?>>Relaxed (allow tracking, provide opt-out)</option>
					</select>
					<p class="description">Applied to visitors from regions other than EU/UK or US when using EU/UK + US or Custom mode.</p>
				</td>
			</tr>
		</table>

		<h3>US Privacy Controls</h3>
		<table class="form-table">
			<tr>
				<th scope="row">Privacy Settings Link</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[us_privacy_link]" value="1" <?php checked( $opts['us_privacy_link'], '1' ); ?> />
						Show a "Privacy Settings" link for US visitors to opt out of ACTV TRKR analytics
					</label>
				</td>
			</tr>
			<tr>
				<th scope="row"><label>Link Label</label></th>
				<td>
					<input type="text" name="<?php echo $name; ?>[us_privacy_label]" value="<?php echo esc_attr( $opts['us_privacy_label'] ); ?>" class="regular-text" />
					<p class="description">e.g. "Privacy Settings" or "Do Not Sell or Share My Data"</p>
				</td>
			</tr>
			<tr>
				<th scope="row">Show US Notice</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[us_show_notice]" value="1" <?php checked( $opts['us_show_notice'], '1' ); ?> />
						Show a brief, non-blocking notice to US visitors about analytics cookies
					</label>
				</td>
			</tr>
			<tr>
				<th scope="row"><label>Notice Text</label></th>
				<td>
					<input type="text" name="<?php echo $name; ?>[us_notice_text]" value="<?php echo esc_attr( $opts['us_notice_text'] ); ?>" class="large-text" />
				</td>
			</tr>
		</table>

		<h3>Banner Appearance</h3>
		<table class="form-table">
			<tr>
				<th scope="row"><label>Banner Title</label></th>
				<td><input type="text" name="<?php echo $name; ?>[title]" value="<?php echo esc_attr( $opts['title'] ); ?>" class="regular-text" /></td>
			</tr>
			<tr>
				<th scope="row"><label>Banner Description</label></th>
				<td><textarea name="<?php echo $name; ?>[description]" rows="3" class="large-text"><?php echo esc_textarea( $opts['description'] ); ?></textarea></td>
			</tr>
			<tr>
				<th scope="row"><label>Accept Button Label</label></th>
				<td><input type="text" name="<?php echo $name; ?>[accept_label]" value="<?php echo esc_attr( $opts['accept_label'] ); ?>" class="regular-text" /></td>
			</tr>
			<tr>
				<th scope="row"><label>Reject Button Label</label></th>
				<td><input type="text" name="<?php echo $name; ?>[reject_label]" value="<?php echo esc_attr( $opts['reject_label'] ); ?>" class="regular-text" /></td>
			</tr>
			<tr>
				<th scope="row"><label>Manage Preferences Label</label></th>
				<td><input type="text" name="<?php echo $name; ?>[prefs_label]" value="<?php echo esc_attr( $opts['prefs_label'] ); ?>" class="regular-text" /></td>
			</tr>
			<tr>
				<th scope="row"><label>Privacy Policy URL</label></th>
				<td><input type="url" name="<?php echo $name; ?>[privacy_url]" value="<?php echo esc_attr( $opts['privacy_url'] ); ?>" class="regular-text" /></td>
			</tr>
			<tr>
				<th scope="row"><label>Cookie Policy URL</label></th>
				<td><input type="url" name="<?php echo $name; ?>[cookie_url]" value="<?php echo esc_attr( $opts['cookie_url'] ); ?>" class="regular-text" /></td>
			</tr>
			<tr>
				<th scope="row"><label>Banner Position</label></th>
				<td>
					<select name="<?php echo $name; ?>[position]">
						<option value="bottom" <?php selected( $opts['position'], 'bottom' ); ?>>Bottom</option>
						<option value="top" <?php selected( $opts['position'], 'top' ); ?>>Top</option>
					</select>
				</td>
			</tr>
			<tr>
				<th scope="row"><label>Consent Expiry (days)</label></th>
				<td><input type="number" name="<?php echo $name; ?>[expiry_days]" value="<?php echo esc_attr( $opts['expiry_days'] ); ?>" min="1" max="730" class="small-text" /></td>
			</tr>
			<tr>
				<th scope="row">Footer Reopener Link</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[show_reopener]" value="1" <?php checked( $opts['show_reopener'], '1' ); ?> />
						Show "Cookie Settings" link in footer (for EU/UK strict visitors)
					</label>
					<br>
					<input type="text" name="<?php echo $name; ?>[reopener_label]" value="<?php echo esc_attr( $opts['reopener_label'] ); ?>" class="regular-text" style="margin-top:4px" placeholder="Cookie Settings" />
				</td>
			</tr>
		</table>

		<h3>Debug &amp; Testing</h3>
		<table class="form-table">
			<tr>
				<th scope="row">Debug Mode (admin only)</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[debug_mode]" value="1" <?php checked( $opts['debug_mode'] ?? '0', '1' ); ?> />
						Show banner diagnostics in browser console (only for logged-in admins)
					</label>
				</td>
			</tr>
			<tr>
				<th scope="row"><label>Region Override (testing)</label></th>
				<td>
					<select name="<?php echo $name; ?>[region_debug_override]">
						<option value="" <?php selected( $opts['region_debug_override'], '' ); ?>>Auto-detect (production)</option>
						<option value="eu" <?php selected( $opts['region_debug_override'], 'eu' ); ?>>Force EU/UK</option>
						<option value="us" <?php selected( $opts['region_debug_override'], 'us' ); ?>>Force US</option>
						<option value="other" <?php selected( $opts['region_debug_override'], 'other' ); ?>>Force Other</option>
					</select>
					<p class="description">Admin-only region override for testing. Only applies when Debug Mode is on and you are logged in as admin. Does <strong>not</strong> affect other visitors.</p>
				</td>
			</tr>
		</table>

		<hr />
		<h2>Consent Banner Diagnostics</h2>
		<table class="widefat" style="max-width:700px">
			<tbody>
				<tr>
					<td><strong>Built-in Banner</strong></td>
					<td><?php echo $diag['banner_enabled'] ? '✅ Enabled' : '❌ Disabled'; ?></td>
				</tr>
				<tr>
					<td><strong>Compliance Mode</strong></td>
					<td><code><?php echo esc_html( $diag['compliance_mode'] ); ?></code></td>
				</tr>
				<tr>
					<td><strong>Detected Region (this request)</strong></td>
					<td><code><?php echo esc_html( $diag['detected_region'] ); ?></code>
						<?php if ( $diag['detected_region'] === 'unknown' ) echo ' — <em>no server header; frontend timezone fallback will be used</em>'; ?>
					</td>
				</tr>
				<tr>
					<td><strong>Active Behavior</strong></td>
					<td>
						<code><?php echo esc_html( $diag['region_behavior'] ); ?></code>
						<?php
						if ( $diag['region_behavior'] === 'strict' ) echo ' — banner shown, analytics blocked until consent';
						elseif ( $diag['region_behavior'] === 'us_optout' ) echo ' — analytics allowed, opt-out available';
						elseif ( $diag['region_behavior'] === 'relaxed' ) echo ' — analytics allowed, no banner';
						?>
					</td>
				</tr>
				<tr>
					<td><strong>Other Region Fallback</strong></td>
					<td><code><?php echo esc_html( $diag['other_fallback'] ); ?></code></td>
				</tr>
				<tr>
					<td><strong>US Privacy Link</strong></td>
					<td><?php echo $diag['us_privacy_link'] ? '✅ Enabled' : '❌ Disabled'; ?></td>
				</tr>
				<tr>
					<td><strong>US Notice</strong></td>
					<td><?php echo $diag['us_show_notice'] ? '✅ Enabled' : '❌ Disabled'; ?></td>
				</tr>
				<?php if ( $diag['region_debug_override'] ) : ?>
				<tr>
					<td><strong>⚠️ Region Override Active</strong></td>
					<td><code><?php echo esc_html( $diag['region_debug_override'] ); ?></code> — admin testing only</td>
				</tr>
				<?php endif; ?>
				<tr>
					<td><strong>Consent Mode (legacy)</strong></td>
					<td><code><?php echo esc_html( $diag['consent_mode'] ); ?></code></td>
				</tr>
				<tr>
					<td><strong>API Key Present</strong></td>
					<td><?php echo $diag['api_key_present'] ? '✅ Yes' : '❌ No — banner will not render'; ?></td>
				</tr>
				<tr>
					<td><strong>Frontend CSS Registered</strong></td>
					<td><?php echo $diag['css_registered'] ? '✅ Yes' : '⚠️ Not yet'; ?></td>
				</tr>
				<tr>
					<td><strong>Frontend JS Registered</strong></td>
					<td><?php echo $diag['js_registered'] ? '✅ Yes' : '⚠️ Not yet'; ?></td>
				</tr>
				<tr>
					<td><strong>Footer Reopener</strong></td>
					<td><?php echo $diag['footer_reopener'] ? '✅ Enabled' : '❌ Disabled'; ?></td>
				</tr>
				<tr>
					<td><strong>Plugin Version</strong></td>
					<td><code><?php echo esc_html( $diag['plugin_version'] ); ?></code></td>
				</tr>
			</tbody>
		</table>

		<?php if ( ! empty( $diag['conflict_hints'] ) ) : ?>
		<h3 style="margin-top:16px">⚠️ Conflict Hints</h3>
		<ul style="max-width:700px;list-style:disc;padding-left:20px">
			<?php foreach ( $diag['conflict_hints'] as $hint ) : ?>
				<li style="margin-bottom:4px"><?php echo esc_html( $hint ); ?></li>
			<?php endforeach; ?>
		</ul>
		<?php endif; ?>

		<p style="margin-top:12px">
			<button type="button" id="mm-copy-diag" class="button button-secondary" style="margin-right:8px">📋 Copy Diagnostics</button>
		</p>

		<hr />
		<h2>Verification Checklist</h2>
		<ol style="max-width:700px;padding-left:20px">
			<li><strong>EU/UK visitor test:</strong> Open your site in a private window (or use region override). Confirm consent banner appears. Confirm no <code>mm_vid</code> or <code>mm_sid</code> cookies before consent. Accept → tracking starts. Reject → no tracking cookies.</li>
			<li><strong>US visitor test:</strong> Open your site with US region (or override). Confirm <strong>no blocking banner</strong> appears. Confirm a "Privacy Settings" link is visible. Click it → preferences modal opens. Toggle analytics off → tracking stops and cookies clear.</li>
			<li><strong>Other/unknown visitor test:</strong> Use region override to force "Other." Confirm behavior matches your configured fallback (strict or relaxed).</li>
			<li>Look for a <strong>Cookie Settings</strong> or <strong>Privacy Settings</strong> link in the footer</li>
			<li>If Debug Mode is on, check browser console for <code>[ACTV TRKR Consent]</code> log messages</li>
		</ol>

		<script>
		document.getElementById('mm-copy-diag').addEventListener('click', function() {
			var diag = <?php echo wp_json_encode( $diag ); ?>;
			var text = 'ACTV TRKR Consent Banner Diagnostics\n';
			text += '=====================================\n';
			for (var key in diag) {
				if (key === 'conflict_hints') {
					text += 'conflict_hints: ' + (diag[key].length ? diag[key].join('; ') : 'none') + '\n';
				} else {
					text += key + ': ' + diag[key] + '\n';
				}
			}
			if (navigator.clipboard) {
				navigator.clipboard.writeText(text).then(function() {
					alert('Diagnostics copied to clipboard!');
				});
			} else {
				var ta = document.createElement('textarea');
				ta.value = text;
				document.body.appendChild(ta);
				ta.select();
				document.execCommand('copy');
				document.body.removeChild(ta);
				alert('Diagnostics copied to clipboard!');
			}
		});
		// Show/hide Other Fallback row based on compliance mode
		(function() {
			var modeSelect = document.getElementById('mm_compliance_mode');
			var fallbackRow = document.getElementById('mm-other-fallback-row');
			function toggle() {
				if (!modeSelect || !fallbackRow) return;
				fallbackRow.style.display = modeSelect.value === 'global_strict' ? 'none' : '';
			}
			toggle();
			if (modeSelect) modeSelect.addEventListener('change', toggle);
		})();
		</script>
		<?php
	}
}

?>
