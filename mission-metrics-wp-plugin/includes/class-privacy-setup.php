<?php
/**
 * Privacy Setup helper for ACTV TRKR.
 * Detects existing privacy/cookie policy pages, provides copy blocks,
 * and renders a setup checklist. Does NOT auto-edit user content.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Privacy_Setup {

	public static function init() {
		add_action( 'wp_ajax_mm_detect_privacy_pages', array( __CLASS__, 'ajax_detect_privacy_pages' ) );
	}

	/* ── Detect Privacy Policy page ──────────────────────────────
	 * Returns array with 'found' (bool), 'url' (string), 'source' (string).
	 */
	public static function detect_privacy_policy() {
		// 1. WordPress built-in Privacy Policy setting
		$wp_privacy_page_id = (int) get_option( 'wp_page_for_privacy_policy', 0 );
		if ( $wp_privacy_page_id && get_post_status( $wp_privacy_page_id ) === 'publish' ) {
			return array(
				'found'  => true,
				'url'    => get_permalink( $wp_privacy_page_id ),
				'source' => 'WordPress Privacy Settings',
				'title'  => get_the_title( $wp_privacy_page_id ),
			);
		}

		// 2. Common slugs
		$slugs = array( 'privacy-policy', 'privacy', 'datenschutz', 'politique-de-confidentialite' );
		foreach ( $slugs as $slug ) {
			$page = get_page_by_path( $slug );
			if ( $page && $page->post_status === 'publish' ) {
				return array(
					'found'  => true,
					'url'    => get_permalink( $page->ID ),
					'source' => 'Page slug: /' . $slug,
					'title'  => $page->post_title,
				);
			}
		}

		return array( 'found' => false, 'url' => '', 'source' => '', 'title' => '' );
	}

	/* ── Detect Cookie Policy page ───────────────────────────── */
	public static function detect_cookie_policy() {
		$slugs = array( 'cookie-policy', 'cookies', 'cookie-richtlinie' );
		foreach ( $slugs as $slug ) {
			$page = get_page_by_path( $slug );
			if ( $page && $page->post_status === 'publish' ) {
				return array(
					'found'  => true,
					'url'    => get_permalink( $page->ID ),
					'source' => 'Page slug: /' . $slug,
					'title'  => $page->post_title,
				);
			}
		}
		return array( 'found' => false, 'url' => '', 'source' => '', 'title' => '' );
	}

	/* ── Build checklist status ──────────────────────────────── */
	public static function get_checklist() {
		$consent_opts = MM_Consent_Banner::get();
		$main_opts    = MM_Settings::get();
		$privacy      = self::detect_privacy_policy();
		$external_cmps = method_exists( 'MM_Consent_Banner', 'detect_external_cmps' )
			? array() // private method, check via diagnostics
			: array();

		$privacy_linked = ! empty( $consent_opts['privacy_url'] ) || $privacy['found'];
		$banner_active  = $consent_opts['enabled'] === '1';

		// Check if external CMP is likely active (we can infer from config)
		$has_external_cmp = false;
		$active_plugins = apply_filters( 'active_plugins', get_option( 'active_plugins' ) );
		$known_cmps = array(
			'complianz-gdpr/complianz-gpdr.php',
			'cookie-law-info/cookie-law-info.php',
			'cookiebot/cookiebot.php',
			'real-cookie-banner/index.php',
			'gdpr-cookie-compliance/moove-gdpr.php',
			'cookie-notice/cookie-notice.php',
			'iubenda-cookie-law-solution/iubenda_cookie_solution.php',
			'cookie-script-com/cookie-script.php',
		);
		foreach ( $known_cmps as $cmp ) {
			if ( in_array( $cmp, $active_plugins, true ) ) {
				$has_external_cmp = true;
				break;
			}
		}

		$consent_handled = $banner_active || $has_external_cmp;
		$region_configured = in_array( $consent_opts['compliance_mode'], array( 'global_strict', 'eu_us', 'custom' ), true );

		return array(
			array(
				'id'     => 'privacy_linked',
				'label'  => 'Privacy Policy linked',
				'status' => $privacy_linked,
				'fix'    => '#mm-privacy-url-field',
			),
			array(
				'id'     => 'policy_includes_actv',
				'label'  => 'ACTV TRKR included in privacy policy',
				'status' => null, // cannot auto-detect — manual check
				'fix'    => '#mm-privacy-copy-blocks',
			),
			array(
				'id'     => 'consent_active',
				'label'  => 'Consent banner active OR external CMP configured',
				'status' => $consent_handled,
				'fix'    => '#mm-consent-enable',
			),
			array(
				'id'     => 'region_configured',
				'label'  => 'Region behavior configured',
				'status' => $region_configured,
				'fix'    => '#mm_compliance_mode',
			),
		);
	}

	/* ── AJAX endpoint ───────────────────────────────────────── */
	public static function ajax_detect_privacy_pages() {
		check_ajax_referer( 'mm_privacy_detect', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		wp_send_json_success( array(
			'privacy' => self::detect_privacy_policy(),
			'cookie'  => self::detect_cookie_policy(),
		) );
	}

	/* ── Render settings section ─────────────────────────────── */
	public static function render_settings_section() {
		$consent_opts = MM_Consent_Banner::get();
		$privacy      = self::detect_privacy_policy();
		$cookie       = self::detect_cookie_policy();
		$checklist    = self::get_checklist();
		$name         = MM_Consent_Banner::OPTION_NAME;

		// Determine effective URLs (admin-set > detected)
		$effective_privacy_url = ! empty( $consent_opts['privacy_url'] ) ? $consent_opts['privacy_url'] : $privacy['url'];
		$effective_cookie_url  = ! empty( $consent_opts['cookie_url'] ) ? $consent_opts['cookie_url'] : $cookie['url'];
		?>

		<hr />
		<h2>🔒 Privacy Setup</h2>
		<p class="description" style="max-width:700px">Connect your Privacy Policy and Cookie Policy pages so they appear in the consent banner and preferences modal. ACTV TRKR will detect existing pages automatically — you can also set them manually.</p>

		<!-- Detection Status -->
		<div style="max-width:700px;margin:16px 0">
			<h3 style="font-size:15px;margin-bottom:8px">📄 Policy Page Detection</h3>
			<table class="widefat" style="max-width:700px">
				<tbody>
					<tr>
						<td style="width:180px"><strong>Privacy Policy</strong></td>
						<td>
							<?php if ( $privacy['found'] ) : ?>
								✅ Detected: <a href="<?php echo esc_url( $privacy['url'] ); ?>" target="_blank"><?php echo esc_html( $privacy['title'] ); ?></a>
								<br><span style="font-size:12px;color:#888">Source: <?php echo esc_html( $privacy['source'] ); ?></span>
							<?php else : ?>
								⚠️ No Privacy Policy page detected.
								<br><span style="font-size:12px;color:#888">Tip: Create a page with the slug <code>/privacy-policy</code> or set one in WordPress → Settings → Privacy.</span>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<td><strong>Cookie Policy</strong></td>
						<td>
							<?php if ( $cookie['found'] ) : ?>
								✅ Detected: <a href="<?php echo esc_url( $cookie['url'] ); ?>" target="_blank"><?php echo esc_html( $cookie['title'] ); ?></a>
								<br><span style="font-size:12px;color:#888">Source: <?php echo esc_html( $cookie['source'] ); ?></span>
							<?php else : ?>
								⚠️ No Cookie Policy page detected.
								<br><span style="font-size:12px;color:#888">Tip: Create a page with the slug <code>/cookie-policy</code>, or add cookie details to your Privacy Policy.</span>
							<?php endif; ?>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- URL Fields (with auto-fill) -->
		<div id="mm-privacy-url-field">
			<h3 style="font-size:15px;margin-bottom:8px">🔗 Policy Links</h3>
			<p class="description" style="max-width:700px;margin-bottom:8px">These URLs are shown in the consent banner, preferences modal, and footer. Auto-filled from detected pages — override manually if needed.</p>
			<table class="form-table">
				<tr>
					<th scope="row"><label>Privacy Policy URL</label></th>
					<td>
						<input type="url" name="<?php echo $name; ?>[privacy_url]" value="<?php echo esc_attr( $consent_opts['privacy_url'] ); ?>" class="regular-text" placeholder="<?php echo esc_attr( $privacy['url'] ?: 'https://yoursite.com/privacy-policy' ); ?>" />
						<?php if ( $privacy['found'] && empty( $consent_opts['privacy_url'] ) ) : ?>
							<p class="description">
								Auto-detected: <a href="<?php echo esc_url( $privacy['url'] ); ?>" target="_blank"><?php echo esc_html( $privacy['url'] ); ?></a>
								<button type="button" class="button button-small mm-autofill-url" data-url="<?php echo esc_attr( $privacy['url'] ); ?>" data-field="privacy_url" style="margin-left:4px">Use This</button>
							</p>
						<?php endif; ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><label>Cookie Policy URL</label></th>
					<td>
						<input type="url" name="<?php echo $name; ?>[cookie_url]" value="<?php echo esc_attr( $consent_opts['cookie_url'] ); ?>" class="regular-text" placeholder="<?php echo esc_attr( $cookie['url'] ?: 'https://yoursite.com/cookie-policy' ); ?>" />
						<?php if ( $cookie['found'] && empty( $consent_opts['cookie_url'] ) ) : ?>
							<p class="description">
								Auto-detected: <a href="<?php echo esc_url( $cookie['url'] ); ?>" target="_blank"><?php echo esc_html( $cookie['url'] ); ?></a>
								<button type="button" class="button button-small mm-autofill-url" data-url="<?php echo esc_attr( $cookie['url'] ); ?>" data-field="cookie_url" style="margin-left:4px">Use This</button>
							</p>
						<?php endif; ?>
					</td>
				</tr>
			</table>
		</div>

		<!-- Privacy Policy Copy Blocks -->
		<div id="mm-privacy-copy-blocks" style="max-width:700px;margin-top:16px">
			<h3 style="font-size:15px;margin-bottom:8px">📝 Add ACTV TRKR to Your Privacy Policy</h3>
			<p class="description" style="margin-bottom:12px">Copy one of the blocks below and paste it into your Privacy Policy page. This lets visitors know you use analytics.</p>

			<div style="margin-bottom:12px">
				<label style="font-weight:600;display:block;margin-bottom:4px">Short version:</label>
				<textarea id="mm-pp-short" readonly rows="3" class="large-text" style="background:#f9fafb;font-size:13px">We use ACTV TRKR to measure website performance and usage. This includes anonymized data such as page views, clicks, and form interactions. This data is used only for internal analytics.</textarea>
				<button type="button" class="button button-small mm-copy-pp" data-target="mm-pp-short" style="margin-top:4px">📋 Copy</button>
			</div>

			<div style="margin-bottom:12px">
				<label style="font-weight:600;display:block;margin-bottom:4px">Full version:</label>
				<textarea id="mm-pp-full" readonly rows="4" class="large-text" style="background:#f9fafb;font-size:13px">We use ACTV TRKR, an analytics tool, to understand how visitors interact with our website and to improve performance. ACTV TRKR may collect anonymized usage data such as page views, clicks, and form submissions. This data is used solely for internal analytics and is not used for advertising or sold to third parties.</textarea>
				<button type="button" class="button button-small mm-copy-pp" data-target="mm-pp-full" style="margin-top:4px">📋 Copy</button>
			</div>

			<div style="margin-bottom:12px">
				<label style="font-weight:600;display:block;margin-bottom:4px">Technical version (for detailed policies):</label>
				<textarea id="mm-pp-tech" readonly rows="3" class="large-text" style="background:#f9fafb;font-size:13px">ACTV TRKR uses first-party cookies (such as mm_vid, mm_sid, and related identifiers) to measure site usage. These are only activated after user consent where required by law.</textarea>
				<button type="button" class="button button-small mm-copy-pp" data-target="mm-pp-tech" style="margin-top:4px">📋 Copy</button>
			</div>
		</div>

		<!-- Privacy Setup Checklist -->
		<div style="max-width:700px;margin-top:24px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px">
			<h3 style="margin:0 0 12px;font-size:15px">✅ Privacy Setup Checklist</h3>
			<ul style="list-style:none;padding:0;margin:0">
				<?php foreach ( $checklist as $item ) : ?>
					<li style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #d1fae5">
						<?php if ( $item['status'] === true ) : ?>
							<span style="font-size:16px">✅</span>
						<?php elseif ( $item['status'] === null ) : ?>
							<span style="font-size:16px" title="Manual check required">🔍</span>
						<?php else : ?>
							<span style="font-size:16px">⚠️</span>
						<?php endif; ?>
						<span style="flex:1"><?php echo esc_html( $item['label'] ); ?></span>
						<?php if ( $item['status'] !== true ) : ?>
							<a href="<?php echo esc_attr( $item['fix'] ); ?>" class="button button-small" style="font-size:12px">
								<?php echo $item['status'] === null ? 'View' : 'Fix'; ?>
							</a>
						<?php endif; ?>
					</li>
				<?php endforeach; ?>
			</ul>
			<p style="margin:12px 0 0;font-size:12px;color:#666">
				<em>This checklist is informational guidance — ACTV TRKR does not provide legal advice. Consult a legal professional for full compliance.</em>
			</p>
		</div>

		<script>
		(function() {
			// Copy buttons for privacy policy blocks
			var copyBtns = document.querySelectorAll('.mm-copy-pp');
			for (var i = 0; i < copyBtns.length; i++) {
				copyBtns[i].addEventListener('click', function() {
					var targetId = this.getAttribute('data-target');
					var textarea = document.getElementById(targetId);
					if (!textarea) return;
					var text = textarea.value;
					var btn = this;
					if (navigator.clipboard) {
						navigator.clipboard.writeText(text).then(function() {
							btn.textContent = '✅ Copied!';
							setTimeout(function() { btn.textContent = '📋 Copy'; }, 2000);
						});
					} else {
						textarea.select();
						document.execCommand('copy');
						btn.textContent = '✅ Copied!';
						setTimeout(function() { btn.textContent = '📋 Copy'; }, 2000);
					}
				});
			}

			// Auto-fill buttons
			var fillBtns = document.querySelectorAll('.mm-autofill-url');
			for (var j = 0; j < fillBtns.length; j++) {
				fillBtns[j].addEventListener('click', function() {
					var url = this.getAttribute('data-url');
					var field = this.getAttribute('data-field');
					var input = document.querySelector('input[name="mm_consent_banner[' + field + ']"]');
					if (input) {
						input.value = url;
						input.style.background = '#f0fdf4';
						setTimeout(function() { input.style.background = ''; }, 1500);
					}
					this.textContent = '✅ Applied';
					this.disabled = true;
				});
			}
		})();
		</script>
		<?php
	}
}
