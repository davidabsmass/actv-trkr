<?php
/**
 * Built-in cookie/consent banner for ACTV TRKR.
 * Renders a lightweight, accessible consent UI on the front-end and
 * provides WP-admin settings for customisation.
 * v2 — conflict-resistant, fail-closed, with diagnostics.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Consent_Banner {

	const OPTION_NAME = 'mm_consent_banner';

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_front' ), 5 ); // Priority 5 = load early
		add_action( 'wp_head',            array( __CLASS__, 'inline_bootstrap' ), 1 ); // Very early inline config
		add_action( 'wp_footer',          array( __CLASS__, 'render_reopener' ) );

		// Admin
		add_action( 'admin_init',         array( __CLASS__, 'register_settings' ) );
		add_action( 'wp_ajax_mm_consent_diag', array( __CLASS__, 'ajax_diagnostics' ) );
	}

	/* ── Defaults ──────────────────────────────────────────────── */

	public static function defaults() {
		return array(
			'enabled'          => '1',
			'title'            => 'Cookie Preferences',
			'description'      => 'We use cookies to understand how you use our site and improve your experience. Analytics cookies are optional.',
			'accept_label'     => 'Accept',
			'reject_label'     => 'Reject',
			'prefs_label'      => 'Manage Preferences',
			'prefs_title'      => 'Cookie Preferences',
			'privacy_url'      => '',
			'privacy_label'    => 'Privacy Policy',
			'cookie_url'       => '',
			'cookie_label'     => 'Cookie Policy',
			'position'         => 'bottom',       // bottom | top
			'expiry_days'      => '365',
			'show_reopener'    => '1',
			'reopener_label'   => 'Cookie Settings',
			'debug_mode'       => '0',
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

		return $clean;
	}

	/* ── Register settings ─────────────────────────────────────── */

	public static function register_settings() {
		register_setting( MM_Settings::OPTION_GROUP, self::OPTION_NAME, array(
			'sanitize_callback' => array( __CLASS__, 'sanitize' ),
		) );
	}

	/* ── Inline bootstrap config (wp_head, priority 1) ────────── */

	public static function inline_bootstrap() {
		if ( is_admin() ) return;

		$opts = self::get();
		if ( $opts['enabled'] !== '1' ) return;

		$main_opts = MM_Settings::get();
		if ( empty( $main_opts['api_key'] ) ) return;

		// Determine if debug mode should be active
		$debug_mode = ( $opts['debug_mode'] === '1' && current_user_can( 'manage_options' ) );

		$config = array(
			'enabled'       => true,
			'title'         => $opts['title'],
			'description'   => $opts['description'],
			'acceptLabel'   => $opts['accept_label'],
			'rejectLabel'   => $opts['reject_label'],
			'prefsLabel'    => $opts['prefs_label'],
			'prefsTitle'    => $opts['prefs_title'],
			'privacyUrl'    => $opts['privacy_url'],
			'privacyLabel'  => $opts['privacy_label'],
			'cookieUrl'     => $opts['cookie_url'],
			'cookieLabel'   => $opts['cookie_label'],
			'position'      => $opts['position'],
			'expiryDays'    => intval( $opts['expiry_days'] ),
			'showReopener'  => $opts['show_reopener'] === '1',
			'consentMode'   => $main_opts['consent_mode'] ?? 'strict',
			'debugMode'     => $debug_mode,
		);

		// Output inline bootstrap BEFORE any script loads
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
			array( 'mm-tracker' ), // must load AFTER tracker.js so mmConsent API exists
			MM_PLUGIN_VERSION,
			true
		);

		// Config is already set via inline_bootstrap in wp_head.
		// wp_localize_script kept as a secondary fallback in case inline bootstrap is stripped.
		$debug_mode = ( $opts['debug_mode'] === '1' && current_user_can( 'manage_options' ) );

		wp_localize_script( 'mm-consent-banner', 'mmConsentBannerConfig', array(
			'enabled'       => true,
			'title'         => $opts['title'],
			'description'   => $opts['description'],
			'acceptLabel'   => $opts['accept_label'],
			'rejectLabel'   => $opts['reject_label'],
			'prefsLabel'    => $opts['prefs_label'],
			'prefsTitle'    => $opts['prefs_title'],
			'privacyUrl'    => $opts['privacy_url'],
			'privacyLabel'  => $opts['privacy_label'],
			'cookieUrl'     => $opts['cookie_url'],
			'cookieLabel'   => $opts['cookie_label'],
			'position'      => $opts['position'],
			'expiryDays'    => intval( $opts['expiry_days'] ),
			'showReopener'  => $opts['show_reopener'] === '1',
			'consentMode'   => $main_opts['consent_mode'] ?? 'strict',
			'debugMode'     => $debug_mode,
		) );
	}

	/* ── Footer reopener link ──────────────────────────────────── */

	public static function render_reopener() {
		$opts = self::get();
		if ( $opts['enabled'] !== '1' || $opts['show_reopener'] !== '1' ) return;

		$label = esc_html( $opts['reopener_label'] ?: 'Cookie Settings' );
		echo '<div style="text-align:center;padding:8px 0;"><a href="#" id="mm-cookie-settings" class="mm-cb-reopen" role="button" tabindex="0">' . $label . '</a></div>';
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

		$conflict_hints = array();

		// Check for common consent/cookie plugins
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

		// Check for optimization plugins that may defer/delay JS
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
				$conflict_hints[] = 'Optimization plugin detected: ' . dirname( $op ) . '. JS defer/delay settings may prevent the consent banner from loading. Exclude mm-consent-banner.js and mm-tracker.js from optimization.';
			}
		}

		// Check for missing policy URLs
		if ( empty( $opts['privacy_url'] ) ) {
			$conflict_hints[] = 'No Privacy Policy URL configured. Consider adding one for GDPR compliance.';
		}
		if ( empty( $opts['cookie_url'] ) ) {
			$conflict_hints[] = 'No Cookie Policy URL configured.';
		}

		// Check API key
		if ( empty( $main_opts['api_key'] ) ) {
			$conflict_hints[] = 'No API key configured — banner will not render without a valid API key.';
		}

		return array(
			'banner_enabled'         => $opts['enabled'] === '1',
			'consent_mode'           => $main_opts['consent_mode'] ?? 'strict',
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

	/* ── Admin settings UI (rendered inside the existing ACTV TRKR settings page) ── */

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
						Show "Cookie Settings" link in footer
					</label>
					<br>
					<input type="text" name="<?php echo $name; ?>[reopener_label]" value="<?php echo esc_attr( $opts['reopener_label'] ); ?>" class="regular-text" style="margin-top:4px" placeholder="Cookie Settings" />
				</td>
			</tr>
			<tr>
				<th scope="row">Debug Mode (admin only)</th>
				<td>
					<label>
						<input type="checkbox" name="<?php echo $name; ?>[debug_mode]" value="1" <?php checked( $opts['debug_mode'] ?? '0', '1' ); ?> />
						Show banner diagnostics in browser console (only for logged-in admins)
					</label>
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
					<td><strong>Consent Mode</strong></td>
					<td><code><?php echo esc_html( $diag['consent_mode'] ); ?></code></td>
				</tr>
				<tr>
					<td><strong>Analytics Blocked Until Consent</strong></td>
					<td><?php echo $diag['consent_mode'] === 'strict' ? '✅ Yes — strict mode active' : '⚠️ No — relaxed mode (tracking starts immediately)'; ?></td>
				</tr>
				<tr>
					<td><strong>API Key Present</strong></td>
					<td><?php echo $diag['api_key_present'] ? '✅ Yes' : '❌ No — banner will not render'; ?></td>
				</tr>
				<tr>
					<td><strong>Frontend CSS Registered</strong></td>
					<td><?php echo $diag['css_registered'] ? '✅ Yes' : '⚠️ Not yet (check on front-end page load)'; ?></td>
				</tr>
				<tr>
					<td><strong>Frontend JS Registered</strong></td>
					<td><?php echo $diag['js_registered'] ? '✅ Yes' : '⚠️ Not yet (check on front-end page load)'; ?></td>
				</tr>
				<tr>
					<td><strong>Footer Reopener</strong></td>
					<td><?php echo $diag['footer_reopener'] ? '✅ Enabled' : '❌ Disabled'; ?></td>
				</tr>
				<tr>
					<td><strong>Debug Mode</strong></td>
					<td><?php echo $diag['debug_mode'] ? '🔧 Active (admin only)' : '❌ Off'; ?></td>
				</tr>
				<tr>
					<td><strong>Privacy Policy URL</strong></td>
					<td><?php echo $diag['privacy_url_set'] ? '✅ Set' : '⚠️ Not configured'; ?></td>
				</tr>
				<tr>
					<td><strong>Cookie Policy URL</strong></td>
					<td><?php echo $diag['cookie_url_set'] ? '✅ Set' : '⚠️ Not configured'; ?></td>
				</tr>
				<tr>
					<td><strong>Banner Position</strong></td>
					<td><code><?php echo esc_html( $diag['position'] ); ?></code></td>
				</tr>
				<tr>
					<td><strong>Consent Cookie</strong></td>
					<td><code>mm_consent_decision</code> — expires after <?php echo esc_html( $diag['expiry_days'] ); ?> days</td>
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
			<li>Open your site homepage in a <strong>private/incognito window</strong></li>
			<li>Confirm the consent banner appears at the bottom (or top) of the page</li>
			<li>Open DevTools → Application → Cookies — confirm <strong>no mm_vid or mm_sid</strong> cookies exist before consent</li>
			<li>Click <strong>Accept</strong> — confirm tracking starts (mm_vid cookie appears)</li>
			<li>Clear cookies and reload — click <strong>Reject</strong> — confirm no tracking cookies appear</li>
			<li>Look for a <strong>Cookie Settings</strong> link in the footer — click it to reopen the preferences modal</li>
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
		</script>
		<?php
	}
}
