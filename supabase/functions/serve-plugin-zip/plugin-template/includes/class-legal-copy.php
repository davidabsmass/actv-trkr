<?php
/**
 * Centralized legal/policy copy blocks for ACTV TRKR.
 *
 * Provides Privacy Policy and Consent-Tool description text in three
 * variants (short, full, technical). Used by the Tools tab modals so
 * legal copy never has to be dumped inline on the main settings page.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class MM_Legal_Copy {

	/**
	 * Privacy Policy snippets, for pasting into the site's own Privacy Policy.
	 *
	 * @return array{short:string,full:string,technical:string}
	 */
	public static function privacy_policy_blocks() {
		return array(
			'short' => 'We use ACTV TRKR to measure website performance and usage. This includes anonymized data such as page views, clicks, and form interactions. This data is used only for internal analytics.',
			'full'  => 'We use ACTV TRKR, an analytics tool, to understand how visitors interact with our website and to improve performance. ACTV TRKR may collect anonymized usage data such as page views, clicks, and form submissions. This data is used solely for internal analytics and is not used for advertising or sold to third parties.',
			'technical' => 'ACTV TRKR uses first-party cookies (such as mm_vid, mm_sid, and related identifiers) to measure site usage. These are only activated after user consent where required by law.',
		);
	}

	/**
	 * Consent-tool / CMP category descriptions, for pasting into a third-party
	 * consent management tool's Analytics / Statistics category.
	 *
	 * @return array{short:string,full:string,technical:string}
	 */
	public static function consent_tool_blocks() {
		return array(
			'short' => 'We use ACTV TRKR to measure website performance and usage. This includes anonymized data such as page views, clicks, and form interactions. This data is used only for internal analytics.',
			'full'  => 'We use ACTV TRKR, an analytics tool, to understand how visitors interact with our website and to improve performance. ACTV TRKR may collect anonymized usage data such as page views, clicks, and form submissions. This data is used solely for internal analytics and is not used for advertising or sold to third parties.',
			'technical' => 'ACTV TRKR uses first-party analytics identifiers such as mm_vid, mm_sid, and related tracking data. ACTV TRKR should only be activated after Analytics or Statistics consent has been granted.',
		);
	}

	/**
	 * Custom "Cookie Settings" link/button snippets for site footers.
	 *
	 * @return array{link:string,button:string}
	 */
	public static function custom_link_snippets() {
		return array(
			'link'   => "<a href=\"#\" onclick=\"if(window.mmConsentBanner && typeof window.mmConsentBanner.open === 'function'){ window.mmConsentBanner.open(); } return false;\">\n  Cookie Settings\n</a>",
			'button' => "<button type=\"button\" onclick=\"if(window.mmConsentBanner && typeof window.mmConsentBanner.open === 'function'){ window.mmConsentBanner.open(); }\">\n  Cookie Settings\n</button>",
		);
	}
}
