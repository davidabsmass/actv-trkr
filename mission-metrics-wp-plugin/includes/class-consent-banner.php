<?php
/**
 * Built-in cookie/consent banner for ACTV TRKR.
 * Renders a lightweight, accessible consent UI on the front-end and
 * provides WP-admin settings for customisation.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Consent_Banner {

	const OPTION_NAME = 'mm_consent_banner';

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_front' ) );
		add_action( 'wp_footer',          array( __CLASS__, 'render_reopener' ) );

		// Admin
		add_action( 'admin_init',         array( __CLASS__, 'register_settings' ) );
	}

	/* ── Defaults ──────────────────────────────────────────────── */

	public static function defaults() {
		return array(
			'enabled'          => '0',
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

		return $clean;
	}

	/* ── Register settings ─────────────────────────────────────── */

	public static function register_settings() {
		register_setting( MM_Settings::OPTION_GROUP, self::OPTION_NAME, array(
			'sanitize_callback' => array( __CLASS__, 'sanitize' ),
		) );
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

		// Pass config — this must load AFTER tracker.js so mmConsent exists
		// We use a high priority (99) via wp_script_add_data or just rely on
		// the fact that wp_localize_script runs inline before the script
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
		) );
	}

	/* ── Footer reopener link ──────────────────────────────────── */

	public static function render_reopener() {
		$opts = self::get();
		if ( $opts['enabled'] !== '1' || $opts['show_reopener'] !== '1' ) return;

		$label = esc_html( $opts['reopener_label'] ?: 'Cookie Settings' );
		echo '<div style="text-align:center;padding:8px 0;"><a href="#" id="mm-cookie-settings" class="mm-cb-reopen" role="button" tabindex="0">' . $label . '</a></div>';
	}

	/* ── Admin settings UI (rendered inside the existing ACTV TRKR settings page) ── */

	public static function render_settings_section() {
		$opts = self::get();
		$main_opts = MM_Settings::get();
		$name = self::OPTION_NAME;
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
		</table>

		<hr />
		<h2>Consent Status (Debug)</h2>
		<table class="widefat" style="max-width:600px">
			<tbody>
				<tr>
					<td><strong>Built-in Banner</strong></td>
					<td><?php echo $opts['enabled'] === '1' ? '✅ Enabled' : '❌ Disabled'; ?></td>
				</tr>
				<tr>
					<td><strong>Consent Mode</strong></td>
					<td><code><?php echo esc_html( $main_opts['consent_mode'] ?? 'strict' ); ?></code></td>
				</tr>
				<tr>
					<td><strong>Analytics Blocked Until Consent</strong></td>
					<td><?php echo ( $main_opts['consent_mode'] ?? 'strict' ) === 'strict' ? '✅ Yes — strict mode active' : '⚠️ No — relaxed mode (tracking starts immediately)'; ?></td>
				</tr>
				<tr>
					<td><strong>Consent Decision Cookie</strong></td>
					<td><code>mm_consent_decision</code> — stored in visitor browser for <?php echo esc_html( $opts['expiry_days'] ); ?> days</td>
				</tr>
			</tbody>
		</table>
		<?php
	}
}
