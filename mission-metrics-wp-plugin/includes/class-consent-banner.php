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
		add_action( 'wp_head',            array( __CLASS__, 'maybe_inline_reset_consent' ), 0 );
		add_action( 'wp_footer',          array( __CLASS__, 'render_reopener' ) );
		add_action( 'admin_init',         array( __CLASS__, 'register_settings' ) );
		add_action( 'wp_ajax_mm_consent_diag', array( __CLASS__, 'ajax_diagnostics' ) );
		add_action( 'admin_notices',      array( __CLASS__, 'maybe_show_compliance_nudge' ) );
		add_action( 'wp_ajax_mm_dismiss_compliance_nudge', array( __CLASS__, 'ajax_dismiss_nudge' ) );
		add_action( 'wp_ajax_mm_apply_recommended_compliance_mode', array( __CLASS__, 'ajax_apply_recommended_mode' ) );
	}

	/**
	 * v1.20.10+ debug helper: when an admin visits ?mm_reset_consent=1,
	 * clear the consent cookie + related localStorage in their browser and reload
	 * once so the banner reappears. Admin-only; no effect for regular visitors.
	 */
	public static function maybe_inline_reset_consent() {
		if ( is_admin() ) return;
		if ( empty( $_GET['mm_reset_consent'] ) ) return;
		if ( ! function_exists( 'current_user_can' ) || ! current_user_can( 'manage_options' ) ) return;
		?>
		<script>(function(){
			try {
				var names = ['mm_consent_decision','mm_optout','mm_consent_state'];
				var host = location.hostname;
				var domains = [host, '.' + host];
				if (host.indexOf('www.') === 0) domains.push('.' + host.slice(4));
				for (var i=0;i<names.length;i++){
					document.cookie = names[i]+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
					for (var j=0;j<domains.length;j++){
						document.cookie = names[i]+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain='+domains[j];
					}
				}
				try {
					Object.keys(localStorage).forEach(function(k){
						if (k.indexOf('mm_consent') === 0 || k === 'mm_optout') localStorage.removeItem(k);
					});
				} catch(e){}
				if (!sessionStorage.getItem('mm_reset_done')) {
					sessionStorage.setItem('mm_reset_done','1');
					var clean = location.pathname + location.search.replace(/([?&])mm_reset_consent=1&?/,'$1').replace(/[?&]$/,'') + location.hash;
					location.replace(clean || location.pathname);
				} else {
					sessionStorage.removeItem('mm_reset_done');
				}
			} catch(e) { console.warn('[mm] reset consent failed', e); }
		})();</script>
		<?php
	}

	/* ── Defaults ──────────────────────────────────────────────── */

	public static function defaults() {
		return array(
			'enabled'              => '1',
			'title'                => 'Cookie Preferences',
			'description'          => 'We use optional analytics cookies to understand how you use our site and improve your experience. You can accept or reject them — the site works either way.',
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
			'show_footer_cookie_link' => '1',
			'debug_mode'           => '0',
			// Region-based privacy
			'compliance_mode'      => 'eu_us', // global_strict | eu_us | custom
			'other_region_fallback'=> 'strict',        // strict | relaxed
			'us_privacy_link'      => '1',
			'us_privacy_label'     => 'Privacy Settings',
			'us_show_notice'       => '0',
			'us_notice_text'       => 'This site uses analytics cookies to improve your experience. You can opt out anytime.',
			'region_debug_override'=> '',              // '' | eu | us | other (admin testing only)
		);
	}

	public static function get( $key = null ) {
		$opts = wp_parse_args( get_option( self::OPTION_NAME, array() ), self::defaults() );
		return $key ? ( $opts[ $key ] ?? null ) : $opts;
	}

	/* ── Sanitize ──────────────────────────────────────────────── */

	public static function sanitize( $input ) {
		$existing = wp_parse_args( get_option( self::OPTION_NAME, array() ), self::defaults() );
		$clean    = $existing;
		$d        = self::defaults();

		$consent_source = isset( $_POST['mm_consent_source'] )
			? sanitize_text_field( wp_unslash( $_POST['mm_consent_source'] ) )
			: null;
		if ( in_array( $consent_source, array( 'builtin', 'external', 'disabled' ), true ) ) {
			$clean['enabled'] = ( 'builtin' === $consent_source ) ? '1' : '0';
		} elseif ( array_key_exists( 'enabled', (array) $input ) ) {
			$clean['enabled'] = ! empty( $input['enabled'] ) ? '1' : '0';
		}

		$clean['title']          = sanitize_text_field( $input['title'] ?? $existing['title'] ?? $d['title'] );
		$clean['description']    = wp_kses_post( $input['description'] ?? $existing['description'] ?? $d['description'] );
		$clean['accept_label']   = sanitize_text_field( $input['accept_label'] ?? $existing['accept_label'] ?? $d['accept_label'] );
		$clean['reject_label']   = sanitize_text_field( $input['reject_label'] ?? $existing['reject_label'] ?? $d['reject_label'] );
		$clean['prefs_label']    = sanitize_text_field( $input['prefs_label'] ?? $existing['prefs_label'] ?? $d['prefs_label'] );
		$clean['prefs_title']    = sanitize_text_field( $input['prefs_title'] ?? $existing['prefs_title'] ?? $d['prefs_title'] );
		$clean['privacy_url']    = esc_url_raw( $input['privacy_url'] ?? $existing['privacy_url'] ?? '' );
		$clean['privacy_label']  = sanitize_text_field( $input['privacy_label'] ?? $existing['privacy_label'] ?? $d['privacy_label'] );
		$clean['cookie_url']     = esc_url_raw( $input['cookie_url'] ?? $existing['cookie_url'] ?? '' );
		$clean['cookie_label']   = sanitize_text_field( $input['cookie_label'] ?? $existing['cookie_label'] ?? $d['cookie_label'] );
		$clean['position']       = in_array( ( $input['position'] ?? $existing['position'] ?? '' ), array( 'bottom', 'top' ), true ) ? ( $input['position'] ?? $existing['position'] ) : 'bottom';
		$clean['expiry_days']    = max( 1, min( 730, intval( $input['expiry_days'] ?? $existing['expiry_days'] ?? 365 ) ) );
		$clean['show_reopener']  = array_key_exists( 'show_reopener', (array) $input ) ? ( ! empty( $input['show_reopener'] ) ? '1' : '0' ) : ( $existing['show_reopener'] ?? $d['show_reopener'] );
		$clean['reopener_label'] = sanitize_text_field( $input['reopener_label'] ?? $existing['reopener_label'] ?? $d['reopener_label'] );
		$clean['show_footer_cookie_link'] = array_key_exists( 'show_footer_cookie_link', (array) $input ) ? ( ! empty( $input['show_footer_cookie_link'] ) ? '1' : '0' ) : ( $existing['show_footer_cookie_link'] ?? $d['show_footer_cookie_link'] );
		$clean['debug_mode']     = array_key_exists( 'debug_mode', (array) $input ) ? ( ! empty( $input['debug_mode'] ) ? '1' : '0' ) : ( $existing['debug_mode'] ?? $d['debug_mode'] );

		$valid_modes = array( 'global_strict', 'eu_us', 'custom' );
		$clean['compliance_mode'] = in_array( ( $input['compliance_mode'] ?? $existing['compliance_mode'] ?? '' ), $valid_modes, true )
			? ( $input['compliance_mode'] ?? $existing['compliance_mode'] ) : 'global_strict';
		$clean['other_region_fallback'] = in_array( ( $input['other_region_fallback'] ?? $existing['other_region_fallback'] ?? '' ), array( 'strict', 'relaxed' ), true )
			? ( $input['other_region_fallback'] ?? $existing['other_region_fallback'] ) : 'strict';
		$clean['us_privacy_link']  = array_key_exists( 'us_privacy_link', (array) $input ) ? ( ! empty( $input['us_privacy_link'] ) ? '1' : '0' ) : ( $existing['us_privacy_link'] ?? $d['us_privacy_link'] );
		$clean['us_privacy_label'] = sanitize_text_field( $input['us_privacy_label'] ?? $existing['us_privacy_label'] ?? $d['us_privacy_label'] );
		$clean['us_show_notice']   = array_key_exists( 'us_show_notice', (array) $input ) ? ( ! empty( $input['us_show_notice'] ) ? '1' : '0' ) : ( $existing['us_show_notice'] ?? $d['us_show_notice'] );
		$clean['us_notice_text']   = sanitize_text_field( $input['us_notice_text'] ?? $existing['us_notice_text'] ?? $d['us_notice_text'] );

		$valid_overrides = array( '', 'eu', 'us', 'other' );
		$clean['region_debug_override'] = in_array( ( $input['region_debug_override'] ?? $existing['region_debug_override'] ?? '' ), $valid_overrides, true )
			? ( $input['region_debug_override'] ?? $existing['region_debug_override'] ) : '';

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

		// Resolve effective policy URLs: admin-set > auto-detected
		$effective_privacy_url = $opts['privacy_url'];
		$effective_cookie_url  = $opts['cookie_url'];
		if ( empty( $effective_privacy_url ) && class_exists( 'MM_Privacy_Setup' ) ) {
			$detected = MM_Privacy_Setup::detect_privacy_policy();
			if ( $detected['found'] ) $effective_privacy_url = $detected['url'];
		}
		if ( empty( $effective_cookie_url ) && class_exists( 'MM_Privacy_Setup' ) ) {
			$detected = MM_Privacy_Setup::detect_cookie_policy();
			if ( $detected['found'] ) $effective_cookie_url = $detected['url'];
		}

		$config = array(
			'enabled'          => true,
			'title'            => $opts['title'],
			'description'      => $opts['description'],
			'acceptLabel'      => $opts['accept_label'],
			'rejectLabel'      => $opts['reject_label'],
			'prefsLabel'       => $opts['prefs_label'],
			'prefsTitle'       => $opts['prefs_title'],
			'privacyUrl'       => $effective_privacy_url,
			'privacyLabel'     => $opts['privacy_label'],
			'cookieUrl'        => $effective_cookie_url,
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
			// External CMP info
			'externalCmpDetected' => ! empty( self::detect_external_cmps() ),
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

		// Resolve effective policy URLs: admin-set > auto-detected
		$effective_privacy_url = $opts['privacy_url'];
		$effective_cookie_url  = $opts['cookie_url'];
		if ( empty( $effective_privacy_url ) && class_exists( 'MM_Privacy_Setup' ) ) {
			$detected_pp = MM_Privacy_Setup::detect_privacy_policy();
			if ( $detected_pp['found'] ) $effective_privacy_url = $detected_pp['url'];
		}
		if ( empty( $effective_cookie_url ) && class_exists( 'MM_Privacy_Setup' ) ) {
			$detected_cp = MM_Privacy_Setup::detect_cookie_policy();
			if ( $detected_cp['found'] ) $effective_cookie_url = $detected_cp['url'];
		}

		wp_localize_script( 'mm-consent-banner', 'mmConsentBannerConfig', array(
			'enabled'          => true,
			'title'            => $opts['title'],
			'description'      => $opts['description'],
			'acceptLabel'      => $opts['accept_label'],
			'rejectLabel'      => $opts['reject_label'],
			'prefsLabel'       => $opts['prefs_label'],
			'prefsTitle'       => $opts['prefs_title'],
			'privacyUrl'       => $effective_privacy_url,
			'privacyLabel'     => $opts['privacy_label'],
			'cookieUrl'        => $effective_cookie_url,
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
			'externalCmpDetected' => ! empty( self::detect_external_cmps() ),
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

		// Cookie settings link (EU/strict regions) — only if footer cookie link is enabled
		if ( $opts['show_reopener'] === '1' && $opts['show_footer_cookie_link'] === '1' ) {
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
		$external_cmps  = self::detect_external_cmps();

		foreach ( $external_cmps as $cmp ) {
			$conflict_hints[] = 'External consent plugin detected: ' . $cmp['name'] . '. Consider disabling the ACTV TRKR banner and classifying ACTV TRKR under Analytics/Statistics in your existing tool.';
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
		$active_plugins = apply_filters( 'active_plugins', get_option( 'active_plugins' ) );
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
			'external_cmps'          => $external_cmps,
			'conflict_hints'         => $conflict_hints,
			'plugin_version'         => defined( 'MM_PLUGIN_VERSION' ) ? MM_PLUGIN_VERSION : 'unknown',
		);
	}

	/* ── Public wrappers (used by MM_Settings 4-tab UI) ───────── */

	public static function detect_external_cmps_public() {
		return self::detect_external_cmps();
	}

	public static function public_diagnostics() {
		return self::build_diagnostics();
	}

	/* ── Detect external consent/CMP plugins ──────────────────── */

	private static function detect_external_cmps() {
		$known_cmps = array(
			'complianz-gdpr/complianz-gpdr.php'       => array( 'name' => 'Complianz', 'slug' => 'complianz', 'category_hint' => 'Statistics' ),
			'cookie-law-info/cookie-law-info.php'     => array( 'name' => 'CookieYes', 'slug' => 'cookieyes', 'category_hint' => 'Analytics' ),
			'cookiebot/cookiebot.php'                  => array( 'name' => 'Cookiebot / Usercentrics', 'slug' => 'cookiebot', 'category_hint' => 'Statistics' ),
			'real-cookie-banner/index.php'             => array( 'name' => 'Real Cookie Banner', 'slug' => 'real-cookie-banner', 'category_hint' => 'Statistics' ),
			'gdpr-cookie-compliance/moove-gdpr.php'   => array( 'name' => 'GDPR Cookie Compliance', 'slug' => 'moove-gdpr', 'category_hint' => 'Analytics' ),
			'cookie-notice/cookie-notice.php'          => array( 'name' => 'Cookie Notice & Compliance', 'slug' => 'cookie-notice', 'category_hint' => 'Analytics' ),
			'iubenda-cookie-law-solution/iubenda_cookie_solution.php' => array( 'name' => 'iubenda', 'slug' => 'iubenda', 'category_hint' => 'Experience / Analytics' ),
			'cookie-script-com/cookie-script.php'      => array( 'name' => 'CookieScript', 'slug' => 'cookie-script', 'category_hint' => 'Analytics' ),
		);

		$active_plugins = apply_filters( 'active_plugins', get_option( 'active_plugins' ) );
		$detected = array();

		foreach ( $known_cmps as $file => $info ) {
			if ( in_array( $file, $active_plugins, true ) ) {
				$detected[] = $info;
			}
		}

		return $detected;
	}

	/* ── Admin settings UI ────────────────────────────────────── */

	/* ── Legacy admin section renderer (kept as no-op shim) ─────
	 * The 4-tab settings page (v1.16.0+) renders Privacy controls
	 * directly via MM_Settings. This method is preserved so any
	 * older external integrations calling it do not error.
	 */
	public static function render_settings_section() {
		return; // intentional no-op
	}

	/* ── Original full renderer kept below for reference only ─── */
	private static function _legacy_render_settings_section_unused() {
		$opts = self::get();
		$main_opts = MM_Settings::get();
		$name = self::OPTION_NAME;
		$diag = self::build_diagnostics( $opts, $main_opts );

		// Compute "What should happen right now" summary
		$status_summary = self::build_status_summary( $diag );
		?>
		<hr />
		<h2>Consent Banner</h2>
		<p class="description">Built-in cookie consent banner for ACTV TRKR analytics. When enabled, visitors see an accept/reject prompt — no third-party consent plugin needed.
		<span class="dashicons dashicons-editor-help" style="vertical-align:middle;cursor:help;color:#999" title="ACTV TRKR ensures its own analytics respect consent. Other plugins and tracking tools must be configured separately."></span></p>

		<div class="notice notice-info inline" style="max-width:700px;margin:12px 0">
			<p><strong>ℹ️ This controls ACTV TRKR analytics only.</strong> Third-party tracking from other plugins, ad networks, or embedded services requires separate consent/privacy handling.</p>
		</div>

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

		<?php self::render_external_cmp_section( $diag ); ?>

		<?php if ( class_exists( 'MM_Privacy_Setup' ) ) MM_Privacy_Setup::render_settings_section(); ?>

		<hr />
		<p class="description" style="max-width:700px">
			Choose how ACTV TRKR analytics consent behaves for visitors from different regions:
		</p>
		<ul style="max-width:700px;list-style:disc;padding-left:20px;margin:8px 0 16px">
			<li><strong>EU/UK visitors</strong> — see a consent banner. Analytics are completely blocked until accepted (GDPR opt-in).</li>
			<li><strong>US visitors</strong> — analytics run by default. A visible "Privacy Settings" link lets them opt out at any time (CCPA-style).</li>
			<li><strong>Other regions</strong> — follow your chosen fallback behavior (strict or relaxed).</li>
		</ul>
		<div class="notice notice-info inline" style="max-width:700px;margin:0 0 16px">
			<p><strong>ℹ️ Existing installs:</strong> If you were previously using Global Strict mode, your settings are preserved. Switching to "EU/UK Strict + US Opt-Out" will only change behavior for US visitors — EU/UK visitors will continue to see the consent banner exactly as before.</p>
		</div>

		<table class="form-table">
			<tr>
				<th scope="row"><label for="mm_compliance_mode">Compliance Mode</label></th>
				<td>
					<select id="mm_compliance_mode" name="<?php echo $name; ?>[compliance_mode]">
						<option value="global_strict" <?php selected( $opts['compliance_mode'], 'global_strict' ); ?>>Global Strict — consent banner for all visitors</option>
						<option value="eu_us" <?php selected( $opts['compliance_mode'], 'eu_us' ); ?>>EU/UK Strict + US Opt-Out (Recommended)</option>
						<option value="custom" <?php selected( $opts['compliance_mode'], 'custom' ); ?>>Custom Region Rules</option>
					</select>
					<p class="description">
						<strong>Global Strict:</strong> Every visitor sees a consent banner. Analytics stay fully blocked until accepted. Safest default.<br>
						<strong>EU/UK Strict + US Opt-Out:</strong> EU/UK visitors must opt in. US visitors can opt out via Privacy Settings. Other regions follow the fallback below.<br>
						<strong>Custom:</strong> Same as above but lets you explicitly control the Other-region fallback.
					</p>
				</td>
			</tr>
			<tr id="mm-other-fallback-row">
				<th scope="row"><label>Other Regions Fallback</label></th>
				<td>
					<select name="<?php echo $name; ?>[other_region_fallback]">
						<option value="strict" <?php selected( $opts['other_region_fallback'], 'strict' ); ?>>Strict — show banner, block analytics until consent</option>
						<option value="relaxed" <?php selected( $opts['other_region_fallback'], 'relaxed' ); ?>>Relaxed — allow analytics, provide opt-out</option>
					</select>
					<p class="description">Applied to visitors outside EU/UK and US when using EU/UK + US or Custom mode.</p>
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
					<p class="description">Adds a visible link in the page footer. Clicking it opens the preferences modal where visitors can disable analytics.</p>
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
						Show a brief, non-blocking notice to US visitors about analytics
					</label>
					<p class="description">A small, dismissible bar that informs US visitors analytics are active. This is <strong>not</strong> a blocking banner.</p>
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
				<th scope="row">Policy Links</th>
				<td><p class="description">Privacy Policy and Cookie Policy URLs are managed in the <a href="#mm-privacy-url-field">Privacy Setup</a> section below. Auto-detected pages are used as fallback.</p></td>
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
			<tr>
				<th scope="row">Show built-in footer Cookie Settings link</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[show_footer_cookie_link]" value="1" <?php checked( $opts['show_footer_cookie_link'], '1' ); ?> />
						Render the built-in ACTV TRKR footer Cookie Settings link
					</label>
					<p class="description">If you use your own Cookie Settings link (see code snippets below), you can turn this off to hide the built-in footer link.</p>
				</td>
			</tr>
		</table>

		<h3>Debug &amp; Testing</h3>
		<p class="description" style="max-width:700px">Use these tools to verify banner behavior before going live. Debug mode and region overrides are <strong>admin-only</strong> and do not affect other visitors.</p>
		<table class="form-table">
			<tr>
				<th scope="row">Debug Mode (admin only)</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[debug_mode]" value="1" <?php checked( $opts['debug_mode'] ?? '0', '1' ); ?> />
						Log banner lifecycle to browser console (only for logged-in admins)
					</label>
					<p class="description">When enabled, open your site in a browser, open Developer Tools → Console, and look for <code>[ACTV TRKR Consent]</code> messages. You'll see which region was detected, which behavior is active, and whether the tracker is blocked or running.</p>
				</td>
			</tr>
			<tr>
				<th scope="row"><label>Region Override (testing)</label></th>
				<td>
					<select name="<?php echo $name; ?>[region_debug_override]">
						<option value="" <?php selected( $opts['region_debug_override'], '' ); ?>>Auto-detect (production)</option>
						<option value="eu" <?php selected( $opts['region_debug_override'], 'eu' ); ?>>Test as EU/UK visitor</option>
						<option value="us" <?php selected( $opts['region_debug_override'], 'us' ); ?>>Test as US visitor</option>
						<option value="other" <?php selected( $opts['region_debug_override'], 'other' ); ?>>Test as Other region visitor</option>
					</select>
					<p class="description">Temporarily forces a region for your admin session. Only works when Debug Mode is on. <strong>Does not affect other visitors.</strong> Remember to set back to "Auto-detect" before going live.</p>
				</td>
			</tr>
		</table>

		<hr />
		<h2>Status &amp; Diagnostics</h2>

		<!-- External Tracking Notice -->
		<div style="max-width:700px;background:#fefce8;border:1px solid #facc15;border-radius:8px;padding:16px;margin-bottom:20px">
			<h3 style="margin:0 0 8px;font-size:15px">📡 External Tracking Notice</h3>
			<p style="margin:0 0 8px;font-size:13px"><strong>ACTV TRKR manages consent for ACTV TRKR analytics only.</strong> Other plugins or scripts on your site (such as analytics, advertising, or tracking tools) may require separate configuration.</p>
			<p style="margin:0;font-size:13px;color:#666">For full-site compliance, ensure any other tracking tools are configured to respect user consent.</p>
			<p style="margin:8px 0 0;font-size:12px;color:#888">The diagnostics below will show if common third-party tracking scripts (Meta Pixel, Google Analytics, GTM) are detected on your frontend. This detection is informational only — ACTV TRKR does not block or control them.</p>
		</div>

		<!-- What Should Happen Right Now -->
		<div style="max-width:700px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin-bottom:20px">
			<h3 style="margin:0 0 8px;font-size:15px">🔍 What Should Happen Right Now</h3>
			<table style="width:100%;border-collapse:collapse">
				<tr><td style="padding:4px 8px"><strong>Effective mode:</strong></td><td style="padding:4px 8px"><?php echo esc_html( $status_summary['mode_label'] ); ?></td></tr>
				<tr><td style="padding:4px 8px"><strong>Detected region:</strong></td><td style="padding:4px 8px"><?php echo esc_html( $status_summary['region_label'] ); ?></td></tr>
				<tr><td style="padding:4px 8px"><strong>Expected behavior:</strong></td><td style="padding:4px 8px"><?php echo esc_html( $status_summary['behavior_label'] ); ?></td></tr>
				<tr><td style="padding:4px 8px"><strong>Banner should show?</strong></td><td style="padding:4px 8px"><?php echo $status_summary['banner_should_show'] ? '✅ Yes' : '❌ No'; ?></td></tr>
				<tr><td style="padding:4px 8px"><strong>Tracker blocked before consent?</strong></td><td style="padding:4px 8px"><?php echo $status_summary['tracker_blocked'] ? '✅ Yes — blocked' : '⚡ No — tracking allowed'; ?></td></tr>
				<tr><td style="padding:4px 8px"><strong>Opt-out link should show?</strong></td><td style="padding:4px 8px"><?php echo $status_summary['optout_link_show'] ? '✅ Yes' : '—'; ?></td></tr>
			</table>
			<?php if ( $diag['region_debug_override'] ) : ?>
				<p style="margin:8px 0 0;color:#b45309"><strong>⚠️ Region override is active (<?php echo esc_html( $diag['region_debug_override'] ); ?>).</strong> This only affects your admin session.</p>
			<?php endif; ?>
		</div>

		<!-- Quick Test Buttons -->
		<div style="max-width:700px;margin-bottom:20px">
			<h3 style="margin:0 0 8px;font-size:15px">🧪 Quick Region Testing</h3>
			<p class="description" style="margin-bottom:8px">Save settings after changing, then visit your site in a private/incognito window to see the visitor experience.</p>
			<div style="display:flex;gap:8px;flex-wrap:wrap">
				<button type="button" class="button button-secondary mm-test-region" data-region="eu">🇪🇺 Test as EU/UK</button>
				<button type="button" class="button button-secondary mm-test-region" data-region="us">🇺🇸 Test as US</button>
				<button type="button" class="button button-secondary mm-test-region" data-region="other">🌍 Test as Other</button>
				<button type="button" class="button button-secondary mm-test-region" data-region="">✅ Reset to Auto-detect</button>
			</div>
			<p id="mm-test-feedback" class="description" style="margin-top:8px;display:none"></p>
		</div>

		<!-- Diagnostics Table -->
		<details style="max-width:700px">
			<summary style="cursor:pointer;font-weight:600;margin-bottom:8px">📊 Full Diagnostics</summary>
			<table class="widefat" style="max-width:700px">
				<tbody>
					<tr>
						<td><strong>Built-in Banner</strong></td>
						<td><?php echo $diag['banner_enabled'] ? '✅ Enabled' : '❌ Disabled'; ?></td>
					</tr>
					<tr>
						<td><strong>Compliance Mode</strong></td>
						<td>
							<code><?php echo esc_html( $diag['compliance_mode'] ); ?></code>
							<?php
							$mode_labels = array( 'global_strict' => 'Global Strict', 'eu_us' => 'EU/UK Strict + US Opt-Out', 'custom' => 'Custom Region Rules' );
							echo ' — ' . esc_html( $mode_labels[ $diag['compliance_mode'] ] ?? $diag['compliance_mode'] );
							?>
						</td>
					</tr>
					<tr>
						<td><strong>Detected Region (this request)</strong></td>
						<td><code><?php echo esc_html( $diag['detected_region'] ); ?></code>
							<?php if ( $diag['detected_region'] === 'unknown' ) echo ' — <em>no server header found; frontend will use timezone-based detection</em>'; ?>
						</td>
					</tr>
					<tr>
						<td><strong>Active Behavior</strong></td>
						<td>
							<code><?php echo esc_html( $diag['region_behavior'] ); ?></code>
							<?php
							if ( $diag['region_behavior'] === 'strict' ) echo ' — consent banner shown, analytics blocked until accepted';
							elseif ( $diag['region_behavior'] === 'us_optout' ) echo ' — analytics allowed by default, opt-out via Privacy Settings';
							elseif ( $diag['region_behavior'] === 'relaxed' ) echo ' — analytics allowed, no blocking banner';
							?>
						</td>
					</tr>
					<tr>
						<td><strong>Other Region Fallback</strong></td>
						<td><code><?php echo esc_html( $diag['other_fallback'] ); ?></code>
							<?php echo $diag['other_fallback'] === 'strict' ? ' — show banner, block analytics' : ' — allow analytics, provide opt-out'; ?>
						</td>
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
						<td><strong>Consent Mode (legacy setting)</strong></td>
						<td><code><?php echo esc_html( $diag['consent_mode'] ); ?></code></td>
					</tr>
					<tr>
						<td><strong>API Key Present</strong></td>
						<td><?php echo $diag['api_key_present'] ? '✅ Yes' : '❌ No — banner will not render'; ?></td>
					</tr>
					<tr>
						<td><strong>Frontend CSS Registered</strong></td>
						<td><?php echo $diag['css_registered'] ? '✅ Yes' : '⚠️ Not yet (normal on admin pages)'; ?></td>
					</tr>
					<tr>
						<td><strong>Frontend JS Registered</strong></td>
						<td><?php echo $diag['js_registered'] ? '✅ Yes' : '⚠️ Not yet (normal on admin pages)'; ?></td>
					</tr>
				<tr>
					<td><strong>Footer Reopener</strong></td>
					<td><?php echo $diag['footer_reopener'] ? '✅ Enabled' : '❌ Disabled'; ?></td>
				</tr>
				<tr>
					<td><strong>Plugin Version</strong></td>
					<td><code><?php echo esc_html( $diag['plugin_version'] ); ?></code></td>
				</tr>
				<tr>
					<td><strong>External Tracking Scripts</strong></td>
					<td><em>Check browser console for <code>[ACTV TRKR Consent] ⚠️ Additional tracking scripts detected</code> messages after visiting a front-end page with Debug Mode on.</em>
					<br><span style="font-size:12px;color:#888">Detects: Meta Pixel (fbq), Google Analytics (gtag), Google Tag Manager (dataLayer). ACTV TRKR does not control third-party tracking scripts.</span></td>
				</tr>
			</tbody>
		</table>
		</details>

		<?php if ( ! empty( $diag['conflict_hints'] ) ) : ?>
		<h3 style="margin-top:16px">⚠️ Potential Issues</h3>
		<ul style="max-width:700px;list-style:disc;padding-left:20px">
			<?php foreach ( $diag['conflict_hints'] as $hint ) : ?>
				<li style="margin-bottom:4px"><?php echo esc_html( $hint ); ?></li>
			<?php endforeach; ?>
		</ul>
		<?php endif; ?>

		<p style="margin-top:12px">
			<button type="button" id="mm-copy-diag" class="button button-secondary">📋 Copy Diagnostics</button>
		</p>

		<hr />
		<h2>⚠️ Known Limitations</h2>
		<ul style="max-width:700px;list-style:disc;padding-left:20px;margin-bottom:16px">
			<li><strong>Region detection accuracy:</strong> Best when your hosting/CDN provides country headers (e.g. Cloudflare <code>CF-IPCountry</code>). Without server headers, the system falls back to browser timezone, which is approximate — a VPN user may appear as a different region.</li>
			<li><strong>ACTV TRKR only:</strong> This banner controls ACTV TRKR analytics cookies only. If you use Google Analytics, Meta Pixel, or other third-party tracking, those require their own consent handling.</li>
			<li><strong>US opt-out is not retroactive:</strong> When a US visitor opts out, analytics stop going forward. Events already sent before the opt-out are not removed.</li>
			<li><strong>Caching:</strong> Full-page caches may serve the same banner config to all visitors. If you use aggressive caching, consider excluding the consent banner script or using cache-splitting by region header.</li>
		</ul>

		<hr />
		<h2>📖 How It Works</h2>
		<div style="max-width:700px">
			<details style="margin-bottom:8px">
				<summary style="cursor:pointer;font-weight:600">EU/UK Strict Mode</summary>
				<p style="padding:8px 0 0 16px">EU/EEA and UK visitors see a consent banner. ACTV TRKR analytics are completely blocked — no cookies (<code>mm_vid</code>, <code>mm_sid</code>, <code>mm_ts</code>), no events, no localStorage queue — until the visitor clicks Accept. If they reject, analytics never start. A "Cookie Settings" link in the footer allows them to change their mind later.</p>
			</details>
			<details style="margin-bottom:8px">
				<summary style="cursor:pointer;font-weight:600">US Opt-Out Mode</summary>
				<p style="padding:8px 0 0 16px">US visitors see no blocking banner by default. ACTV TRKR analytics run immediately. A visible "Privacy Settings" link (configurable label) in the footer gives them access to a preferences modal where they can turn analytics off. On opt-out, all ACTV TRKR cookies and identifiers are cleared and tracking stops. The site continues to work normally.</p>
			</details>
			<details style="margin-bottom:8px">
				<summary style="cursor:pointer;font-weight:600">Other Region Fallback</summary>
				<p style="padding:8px 0 0 16px">Visitors from regions outside EU/UK and US follow the fallback you choose — either "Strict" (same as EU/UK) or "Relaxed" (same as US opt-out behavior). If region detection fails entirely, the fallback applies.</p>
			</details>
			<details style="margin-bottom:8px">
				<summary style="cursor:pointer;font-weight:600">How to Test Safely</summary>
				<ol style="padding:8px 0 0 32px">
					<li>Enable <strong>Debug Mode</strong> above.</li>
					<li>Set <strong>Region Override</strong> to the region you want to test.</li>
					<li>Click <strong>Save Changes</strong>.</li>
					<li>Open your site in a <strong>private/incognito window</strong> (so no existing cookies interfere).</li>
					<li>Open <strong>Developer Tools → Console</strong> and look for <code>[ACTV TRKR Consent]</code> messages.</li>
					<li>Check <strong>Application → Cookies</strong> in DevTools to confirm no <code>mm_vid</code> or <code>mm_sid</code> exist before consent (EU/UK strict).</li>
					<li>Test Accept, Reject, and the footer settings link.</li>
					<li><strong>Remember to set Region Override back to "Auto-detect" when done.</strong></li>
				</ol>
			</details>
			<details style="margin-bottom:8px">
				<summary style="cursor:pointer;font-weight:600">Cookies &amp; Identifiers Reference</summary>
				<p style="padding:8px 0 0 16px">In strict mode, <strong>none</strong> of these should exist before consent:</p>
				<ul style="padding:4px 0 0 32px;list-style:disc">
					<li><code>mm_vid</code> — visitor identifier</li>
					<li><code>mm_sid</code> — session identifier</li>
					<li><code>mm_ts</code> — timestamp</li>
					<li><code>mm_utm</code> — campaign attribution</li>
					<li><code>mm_consent_decision</code> — only set after Accept or Reject</li>
				</ul>
			</details>
		</div>

		<hr />
		<h2>🔗 Custom Cookie Settings Link</h2>
		<p class="description" style="max-width:700px;margin-bottom:12px">You can launch the ACTV TRKR cookie settings popup from your own footer, theme, or site link. Use one of the snippets below.</p>
		<p class="description" style="max-width:700px;margin-bottom:12px">If you use your own Cookie Settings link, you can hide the built-in ACTV TRKR footer link using the setting above.</p>

		<div style="max-width:700px;margin-bottom:12px">
			<label style="font-weight:600;display:block;margin-bottom:4px">Link (for footer / navigation):</label>
			<textarea id="mm-copy-custom-link" readonly rows="3" class="large-text" style="background:#f9fafb;font-size:13px"><a href="#" onclick="if(window.mmConsentBanner && typeof window.mmConsentBanner.open === 'function'){ window.mmConsentBanner.open(); } return false;">
  Cookie Settings
</a></textarea>
			<button type="button" class="button button-small mm-copy-block" data-target="mm-copy-custom-link" style="margin-top:4px">📋 Copy Link</button>
		</div>

		<div style="max-width:700px;margin-bottom:12px">
			<label style="font-weight:600;display:block;margin-bottom:4px">Button:</label>
			<textarea id="mm-copy-custom-button" readonly rows="3" class="large-text" style="background:#f9fafb;font-size:13px"><button type="button" onclick="if(window.mmConsentBanner && typeof window.mmConsentBanner.open === 'function'){ window.mmConsentBanner.open(); }">
  Cookie Settings
</button></textarea>
			<button type="button" class="button button-small mm-copy-block" data-target="mm-copy-custom-button" style="margin-top:4px">📋 Copy Button</button>
		</div>

		<script>
		document.getElementById('mm-copy-diag').addEventListener('click', function() {
			var diag = <?php echo wp_json_encode( $diag ); ?>;
			var summary = <?php echo wp_json_encode( $status_summary ); ?>;
			var text = 'ACTV TRKR Consent Banner Diagnostics\n';
			text += '=====================================\n';
			text += 'Status Summary:\n';
			for (var sk in summary) { text += '  ' + sk + ': ' + summary[sk] + '\n'; }
			text += '\nFull Diagnostics:\n';
			for (var key in diag) {
				if (key === 'conflict_hints') {
					text += '  conflict_hints: ' + (diag[key].length ? diag[key].join('; ') : 'none') + '\n';
				} else {
					text += '  ' + key + ': ' + diag[key] + '\n';
				}
			}
			if (navigator.clipboard) {
				navigator.clipboard.writeText(text).then(function() { alert('Diagnostics copied to clipboard!'); });
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

		// Quick region test buttons
		(function() {
			var btns = document.querySelectorAll('.mm-test-region');
			var feedback = document.getElementById('mm-test-feedback');
			var overrideSelect = document.querySelector('select[name="<?php echo $name; ?>[region_debug_override]"]');
			var debugCheckbox = document.querySelector('input[name="<?php echo $name; ?>[debug_mode]"]');
			for (var i = 0; i < btns.length; i++) {
				btns[i].addEventListener('click', function() {
					var region = this.getAttribute('data-region');
					if (overrideSelect) overrideSelect.value = region;
					if (region && debugCheckbox) debugCheckbox.checked = true;
					if (feedback) {
						if (region) {
							feedback.textContent = '✅ Region override set to "' + (region || 'auto') + '". Click Save Changes, then open your site in a private window to test.';
						} else {
							feedback.textContent = '✅ Region override cleared. Click Save Changes to return to production auto-detect.';
						}
						feedback.style.display = '';
					}
				});
			}
		})();
		</script>
		<?php
	}

	/* ── External CMP Setup Section ───────────────────────────── */

	private static function render_external_cmp_section( $diag ) {
		$external_cmps = $diag['external_cmps'] ?? array();
		$has_external = ! empty( $external_cmps );
		$banner_enabled = $diag['banner_enabled'];

		// Consent signal confidence
		if ( $has_external && ! $banner_enabled ) {
			$signal_status = 'external_cmp_detected_banner_off';
			$signal_label  = 'External CMP detected, ACTV TRKR banner disabled — ensure your CMP sends analytics consent to ACTV TRKR';
			$signal_icon   = '⚠️';
		} elseif ( $has_external && $banner_enabled ) {
			$signal_status = 'external_cmp_detected_banner_on';
			$signal_label  = 'External CMP detected AND ACTV TRKR banner is enabled — this may cause double banners';
			$signal_icon   = '🔴';
		} elseif ( ! $has_external && $banner_enabled ) {
			$signal_status = 'actv_trkr_banner_active';
			$signal_label  = 'ACTV TRKR built-in banner is active — handling consent natively';
			$signal_icon   = '✅';
		} else {
			$signal_status = 'no_consent_handler';
			$signal_label  = 'No consent handler detected — in strict mode, analytics will remain blocked';
			$signal_icon   = '🔴';
		}
		?>
		<hr />
		<h2>🔌 External Consent Plugin Setup</h2>

		<?php if ( $has_external ) : ?>
			<div class="notice notice-warning inline" style="max-width:700px;margin:12px 0">
				<p><strong>🔍 External consent plugin detected:</strong>
				<?php
				$names = array_map( function( $c ) { return '<strong>' . esc_html( $c['name'] ) . '</strong>'; }, $external_cmps );
				echo implode( ', ', $names );
				?>
				</p>
				<p>To avoid showing two consent banners, we recommend <strong>disabling the ACTV TRKR built-in banner</strong> and classifying ACTV TRKR under <strong>Analytics / Statistics</strong> in your existing consent tool.</p>
				<p>ACTV TRKR tracking will remain blocked in strict mode unless a valid analytics consent signal is received — even if your CMP popup appears.</p>
			</div>

			<?php if ( $banner_enabled ) : ?>
			<div class="notice notice-error inline" style="max-width:700px;margin:0 0 12px">
				<p><strong>⚠️ Double banner risk:</strong> Both the ACTV TRKR banner and <?php echo esc_html( $external_cmps[0]['name'] ); ?> are active. Visitors may see two consent popups. Disable the ACTV TRKR banner above, or deactivate your other consent plugin.</p>
			</div>
			<?php endif; ?>

			<div style="max-width:700px;background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-bottom:16px">
				<h3 style="margin:0 0 12px;font-size:15px">📋 Recommended Setup Steps</h3>
				<ol style="padding-left:20px;margin:0">
					<li style="margin-bottom:8px">
						<strong>Add ACTV TRKR to your consent tool's Analytics / Statistics category.</strong><br>
						<span style="color:#666">In <?php echo esc_html( $external_cmps[0]['name'] ); ?>, look for the <em><?php echo esc_html( $external_cmps[0]['category_hint'] ); ?></em> category. Add ACTV TRKR there.</span>
					</li>
					<li style="margin-bottom:8px">
						<strong>Disable the ACTV TRKR built-in banner</strong> (uncheck "Enable Banner" above).
					</li>
					<li style="margin-bottom:8px">
						<strong>Verify consent signal:</strong> Enable Debug Mode, visit your site, accept analytics in your CMP, and check the browser console for <code>[ACTV TRKR Consent]</code> messages confirming consent was received.
					</li>
				</ol>
			</div>

		<?php else : ?>
			<p class="description" style="max-width:700px">No external consent/cookie plugin detected. ACTV TRKR's built-in banner will handle analytics consent.</p>
			<p class="description" style="max-width:700px">If you already use a consent tool that isn't detected here, you can still classify ACTV TRKR manually — use the copy blocks below.</p>
		<?php endif; ?>

		<!-- Consent signal status -->
		<div style="max-width:700px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px">
			<strong>Consent Signal Status:</strong> <?php echo $signal_icon . ' ' . esc_html( $signal_label ); ?>
		</div>

		<!-- Copy blocks -->
		<h3 style="margin-top:16px">📝 Analytics Description — Copy for Your Consent Tool</h3>
		<p class="description" style="max-width:700px;margin-bottom:12px">Paste one of these into your consent plugin's <strong>Analytics / Statistics</strong> category description. These explain what ACTV TRKR does in plain language.</p>

		<div style="max-width:700px;margin-bottom:12px">
			<label style="font-weight:600;display:block;margin-bottom:4px">Short version:</label>
			<textarea id="mm-copy-short" readonly rows="3" class="large-text" style="background:#f9fafb;font-size:13px">We use ACTV TRKR to measure website performance and usage. This includes anonymized data such as page views, clicks, and form interactions. This data is used only for internal analytics.</textarea>
			<button type="button" class="button button-small mm-copy-block" data-target="mm-copy-short" style="margin-top:4px">📋 Copy Short</button>
		</div>

		<div style="max-width:700px;margin-bottom:12px">
			<label style="font-weight:600;display:block;margin-bottom:4px">Full version:</label>
			<textarea id="mm-copy-long" readonly rows="4" class="large-text" style="background:#f9fafb;font-size:13px">We use ACTV TRKR, an analytics tool, to understand how visitors interact with our website and to improve performance. ACTV TRKR may collect anonymized usage data such as page views, clicks, and form submissions. This data is used solely for internal analytics and is not used for advertising or sold to third parties.</textarea>
			<button type="button" class="button button-small mm-copy-block" data-target="mm-copy-long" style="margin-top:4px">📋 Copy Full</button>
		</div>

		<div style="max-width:700px;margin-bottom:12px">
			<label style="font-weight:600;display:block;margin-bottom:4px">Technical note (for CMP configuration):</label>
			<textarea id="mm-copy-tech" readonly rows="2" class="large-text" style="background:#f9fafb;font-size:13px">ACTV TRKR uses first-party analytics identifiers such as mm_vid, mm_sid, and related tracking data. ACTV TRKR should only be activated after Analytics or Statistics consent has been granted.</textarea>
			<button type="button" class="button button-small mm-copy-block" data-target="mm-copy-tech" style="margin-top:4px">📋 Copy Technical</button>
		</div>

		<p class="description" style="max-width:700px;margin-top:8px"><strong>Recommended category:</strong> <code>Analytics</code> or <code>Statistics</code> (varies by consent tool).</p>

		<details style="max-width:700px;margin-top:16px">
			<summary style="cursor:pointer;font-weight:600">ℹ️ How ACTV TRKR receives consent from external CMPs</summary>
			<div style="padding:8px 0 0 16px">
				<p>ACTV TRKR listens for the standard <code>window.mmConsent.grant()</code> API call. For most consent plugins, you need to:</p>
				<ol style="padding-left:20px">
					<li>Add ACTV TRKR's tracker script (<code>mm-tracker.js</code>) to the Analytics/Statistics service category in your CMP.</li>
					<li>Your CMP will block the script until consent is granted, then load it — at which point ACTV TRKR initializes tracking.</li>
					<li>If your CMP uses a script-blocking approach (e.g. changing <code>type="text/plain"</code>), ACTV TRKR's tracker will not load until the CMP allows it.</li>
				</ol>
				<p><strong>Important:</strong> If ACTV TRKR does not receive a valid analytics consent signal in strict mode, tracking stays blocked. This is by design — no silent tracking.</p>
			</div>
		</details>

		<script>
		(function() {
			var copyBtns = document.querySelectorAll('.mm-copy-block');
			for (var i = 0; i < copyBtns.length; i++) {
				copyBtns[i].addEventListener('click', function() {
					var targetId = this.getAttribute('data-target');
					var textarea = document.getElementById(targetId);
					if (!textarea) return;
					var text = textarea.value;
					if (navigator.clipboard) {
						navigator.clipboard.writeText(text).then(function() { alert('Copied to clipboard!'); });
					} else {
						textarea.select();
						document.execCommand('copy');
						alert('Copied to clipboard!');
					}
				});
			}
		})();
		</script>
		<?php
	}

	/* ── Build status summary ─────────────────────────────────── */

	private static function build_status_summary( $diag ) {
		$mode_labels = array(
			'global_strict' => 'Global Strict — consent banner for all visitors',
			'eu_us'         => 'EU/UK Strict + US Opt-Out (Recommended)',
			'custom'        => 'Custom Region Rules',
		);
		$region_labels = array(
			'eu'      => 'EU/EEA or UK',
			'us'      => 'United States',
			'other'   => 'Other region',
			'unknown' => 'Unknown (no server header — frontend timezone fallback will be used)',
		);
		$behavior_labels = array(
			'strict'    => 'Strict — consent banner shown, analytics blocked until accepted',
			'us_optout' => 'US Opt-Out — analytics allowed by default, opt-out via Privacy Settings',
			'relaxed'   => 'Relaxed — analytics allowed, no blocking banner',
		);

		$behavior = $diag['region_behavior'];
		$banner_should_show = ( $behavior === 'strict' );
		$tracker_blocked = ( $behavior === 'strict' );
		$optout_link_show = ( $behavior === 'us_optout' && $diag['us_privacy_link'] );

		return array(
			'mode_label'         => $mode_labels[ $diag['compliance_mode'] ] ?? $diag['compliance_mode'],
			'region_label'       => $region_labels[ $diag['detected_region'] ] ?? $diag['detected_region'],
			'behavior_label'     => $behavior_labels[ $behavior ] ?? $behavior,
			'banner_should_show' => $banner_should_show,
			'tracker_blocked'    => $tracker_blocked,
			'optout_link_show'   => $optout_link_show,
		);
	}

	/* ── Admin nudge for compliance mode ──────────────────────── */

	public static function maybe_show_compliance_nudge() {
		// Nudge permanently disabled — Global Strict is a deliberate, valid choice.
		// Do not badger admins to switch modes after they've explicitly selected one.
		return;

		$apply_nonce = wp_create_nonce( 'mm_apply_recommended_mode' );
		$dismiss_nonce = wp_create_nonce( 'mm_dismiss_nudge' );
		?>
		<div class="notice notice-info is-dismissible" id="mm-compliance-nudge" style="border-left-color:#3b82f6">
			<p>
				<strong>💡 Recommended:</strong> Switch your Compliance Mode to
				<strong>"EU/UK Strict + US Opt-Out"</strong> to stop showing a blocking consent popup to US visitors.
				EU/UK visitors will still see the consent banner.
			</p>
			<p style="margin-top:4px">
				<button type="button" id="mm-apply-recommended-mode" class="button button-primary button-small">
					Switch to Recommended Mode
				</button>
				<button type="button" id="mm-dismiss-compliance-nudge" class="button button-small" style="margin-left:8px">
					Don't show again
				</button>
				<span id="mm-apply-recommended-status" style="margin-left:10px;color:#666;font-style:italic"></span>
			</p>
		</div>
		<script>
		(function(){
			var applyBtn = document.getElementById('mm-apply-recommended-mode');
			var dismissBtn = document.getElementById('mm-dismiss-compliance-nudge');
			var statusEl = document.getElementById('mm-apply-recommended-status');
			var notice = document.getElementById('mm-compliance-nudge');
			if ( applyBtn ) {
				applyBtn.addEventListener('click', function(){
					applyBtn.disabled = true;
					statusEl.textContent = 'Saving…';
					var fd = new FormData();
					fd.append('action', 'mm_apply_recommended_compliance_mode');
					fd.append('_wpnonce', '<?php echo esc_js( $apply_nonce ); ?>');
					fetch(ajaxurl, { method: 'POST', credentials: 'same-origin', body: fd })
						.then(function(r){ return r.json(); })
						.then(function(res){
							if ( res && res.success ) {
								statusEl.style.color = '#16a34a';
								statusEl.textContent = 'Saved — reloading…';
								setTimeout(function(){ window.location.reload(); }, 600);
							} else {
								applyBtn.disabled = false;
								statusEl.style.color = '#b91c1c';
								statusEl.textContent = 'Could not save. ' + ((res && res.data) || 'Try again.');
							}
						})
						.catch(function(err){
							applyBtn.disabled = false;
							statusEl.style.color = '#b91c1c';
							statusEl.textContent = 'Network error: ' + err.message;
						});
				});
			}
			if ( dismissBtn ) {
				dismissBtn.addEventListener('click', function(){
					var fd = new FormData();
					fd.append('action', 'mm_dismiss_compliance_nudge');
					fd.append('_wpnonce', '<?php echo esc_js( $dismiss_nonce ); ?>');
					fetch(ajaxurl, { method: 'POST', credentials: 'same-origin', body: fd })
						.then(function(){ if ( notice ) notice.style.display = 'none'; });
				});
			}
		})();
		</script>
		<?php
	}

	public static function ajax_dismiss_nudge() {
		check_ajax_referer( 'mm_dismiss_nudge', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		update_option( 'mm_compliance_nudge_dismissed', true );
		wp_send_json_success();
	}

	/**
	 * Apply the recommended "EU/UK Strict + US Opt-Out" compliance mode in one click.
	 * Persists the option immediately so the user doesn't have to scroll to "Save".
	 */
	public static function ajax_apply_recommended_mode() {
		check_ajax_referer( 'mm_apply_recommended_mode', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		$opts = self::get();
		$opts['compliance_mode'] = 'eu_us';
		update_option( self::OPTION_NAME, $opts );
		// Auto-dismiss the nudge — they took the action.
		update_option( 'mm_compliance_nudge_dismissed', true );
		wp_send_json_success( array( 'compliance_mode' => 'eu_us' ) );
	}
}

?>
