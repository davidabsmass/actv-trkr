<?php
/**
 * SEO Fixes — polls fix queue and applies meta overrides.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MM_SEO_Fixes {

	/** Meta keys used for overrides. */
	const META_TITLE       = '_mm_seo_title';
	const META_DESC        = '_mm_seo_description';
	const META_CANONICAL   = '_mm_seo_canonical';
	const META_OG          = '_mm_seo_og';

	/** Known SEO plugins that may conflict. */
	private static $seo_plugins = array(
		'wordpress-seo/wp-seo.php',              // Yoast
		'seo-by-rank-math/rank-math.php',        // RankMath
		'all-in-one-seo-pack/all_in_one_seo_pack.php', // AIOSEO
	);

	public static function init() {
		add_action( 'mm_seo_fix_cron', array( __CLASS__, 'poll_fixes' ) );
		add_action( 'wp_head', array( __CLASS__, 'output_meta' ), 1 );
		add_filter( 'pre_get_document_title', array( __CLASS__, 'filter_title' ), 999 );
		add_filter( 'document_title_parts', array( __CLASS__, 'filter_title_parts' ), 999 );

		// Remove default canonical if we have an override.
		add_action( 'wp', array( __CLASS__, 'maybe_remove_canonical' ) );

		// Safety-first: never poll on shutdown during a visitor request.
	}

	/**
	 * Fallback polling on shutdown if cron is stuck.
	 * Uses a transient to avoid running on every request.
	 */
	public static function maybe_fallback_poll() {
		// Safety-first: fallback polling is disabled so no visitor request can be delayed.
		return;
	}

	/* ─── Polling ─── */

	public static function poll_fixes() {
		// Mark that we polled so the shutdown fallback won't double-run.
		set_transient( 'mm_seo_last_poll', time(), 5 * MINUTE_IN_SECONDS );

		// F-4 (Phase 0): read from the canonical settings array. The legacy
		// `mm_api_key` / `mm_api_url` standalone option keys never existed in
		// production, so the cron silently no-op'd before this fix.
		$opts    = MM_Settings::get();
		$api_key = isset( $opts['api_key'] ) ? trim( (string) $opts['api_key'] ) : '';
		$api_url = isset( $opts['endpoint_url'] ) ? trim( (string) $opts['endpoint_url'] ) : '';
		if ( empty( $api_key ) || empty( $api_url ) ) {
			return;
		}

		$domain = wp_parse_url( home_url(), PHP_URL_HOST );
		$domain = preg_replace( '/^www\./', '', $domain );

		// F-4 (Phase 0): endpoint_url already contains the `/functions/v1` segment,
		// so we only append the function name. Previously this code re-appended
		// `/functions/v1/...` and produced a 404, silently disabling SEO fixes.
		$base = rtrim( $api_url, '/' );
		$poll_url = $base . '/seo-fix-poll';

		// Guarded by cron_seo_fix breaker — repeated 5xx/timeouts trip the
		// breaker so we stop hammering a failing endpoint each cron tick.
		$response = class_exists( 'ACTV_Safe_HTTP' )
			? ACTV_Safe_HTTP::post( 'cron_seo_fix', $poll_url, array(
				'headers' => array(
					'Content-Type' => 'application/json',
					'x-api-key'    => $api_key,
				),
				'body'    => wp_json_encode( array( 'domain' => $domain ) ),
				'timeout' => 15,
			) )
			: wp_remote_post( $poll_url, array(
				'headers' => array(
					'Content-Type' => 'application/json',
					'x-api-key'    => $api_key,
				),
				'body'    => wp_json_encode( array( 'domain' => $domain ) ),
				'timeout' => 15,
			) );

		if ( is_wp_error( $response ) ) {
			return;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( empty( $body['fixes'] ) || ! is_array( $body['fixes'] ) ) {
			return;
		}

		foreach ( $body['fixes'] as $fix ) {
			self::apply_fix( $fix, $api_key, $api_url );
		}
	}

	/* ─── Apply a single fix ─── */

	private static function apply_fix( $fix, $api_key, $api_url ) {
		$fix_id   = $fix['id'] ?? '';
		$page_url = $fix['page_url'] ?? '';
		$type     = $fix['fix_type'] ?? '';
		$value    = $fix['fix_value'] ?? '';

		if ( ! $fix_id || ! $page_url || ! $type ) {
			return;
		}

		// Check for conflicting SEO plugins.
		if ( self::has_seo_plugin() && in_array( $type, array( 'set_title', 'set_meta_desc', 'add_canonical', 'add_og_tags' ), true ) ) {
			self::confirm( $fix_id, 'failed', 'Another SEO plugin is active', $api_key, $api_url );
			return;
		}

		// Resolve post from URL.
		$post_id = url_to_postid( $page_url );

		// For homepage, use the front-page or posts page.
		if ( ! $post_id ) {
			$path = wp_parse_url( $page_url, PHP_URL_PATH );
			if ( empty( $path ) || $path === '/' ) {
				$post_id = (int) get_option( 'page_on_front', 0 );
			}
		}

		if ( ! $post_id ) {
			self::confirm( $fix_id, 'failed', 'Could not resolve post', $api_key, $api_url );
			return;
		}

		$status = 'applied';
		switch ( $type ) {
			case 'set_title':
				update_post_meta( $post_id, self::META_TITLE, sanitize_text_field( $value ) );
				break;
			case 'set_meta_desc':
				update_post_meta( $post_id, self::META_DESC, sanitize_text_field( $value ) );
				break;
			case 'add_canonical':
				update_post_meta( $post_id, self::META_CANONICAL, esc_url_raw( $value ) );
				break;
			case 'add_og_tags':
				update_post_meta( $post_id, self::META_OG, sanitize_text_field( $value ) );
				break;
			default:
				$status = 'failed';
				break;
		}

		self::confirm( $fix_id, $status, '', $api_key, $api_url );
	}

	/* ─── Confirm back ─── */

	private static function confirm( $fix_id, $status, $note, $api_key, $api_url ) {
		$args = array(
			'headers' => array(
				'Content-Type' => 'application/json',
				'x-api-key'    => $api_key,
			),
			'body'    => wp_json_encode( array(
				'fix_id' => $fix_id,
				'status' => $status,
				'note'   => $note,
			) ),
			'timeout' => 10,
		);
		if ( class_exists( 'ACTV_Safe_HTTP' ) ) {
			ACTV_Safe_HTTP::post( 'cron_seo_fix', $api_url . '/functions/v1/seo-fix-confirm', $args );
		} else {
			wp_remote_post( $api_url . '/functions/v1/seo-fix-confirm', $args );
		}
	}

	/* ─── SEO plugin detection ─── */

	private static function has_seo_plugin() {
		if ( ! function_exists( 'is_plugin_active' ) ) {
			include_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		foreach ( self::$seo_plugins as $plugin ) {
			if ( is_plugin_active( $plugin ) ) {
				return true;
			}
		}
		return false;
	}

	/* ─── Output hooks ─── */

	public static function filter_title( $title ) {
		if ( ! is_singular() && ! is_front_page() ) {
			return $title;
		}
		$post_id  = self::get_current_post_id();
		$override = $post_id ? get_post_meta( $post_id, self::META_TITLE, true ) : '';
		return $override ? $override : $title;
	}

	public static function filter_title_parts( $parts ) {
		$post_id  = self::get_current_post_id();
		$override = $post_id ? get_post_meta( $post_id, self::META_TITLE, true ) : '';
		if ( $override ) {
			$parts['title'] = $override;
		}
		return $parts;
	}

	public static function output_meta() {
		$post_id = self::get_current_post_id();
		if ( ! $post_id ) {
			return;
		}

		// Meta description.
		$desc = get_post_meta( $post_id, self::META_DESC, true );
		if ( $desc ) {
			echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
		}

		// Canonical.
		$canonical = get_post_meta( $post_id, self::META_CANONICAL, true );
		if ( $canonical ) {
			echo '<link rel="canonical" href="' . esc_url( $canonical ) . '">' . "\n";
		}

		// OG tags.
		$og_json = get_post_meta( $post_id, self::META_OG, true );
		if ( $og_json ) {
			$og = json_decode( $og_json, true );
			if ( is_array( $og ) ) {
				if ( ! empty( $og['title'] ) ) {
					echo '<meta property="og:title" content="' . esc_attr( $og['title'] ) . '">' . "\n";
				}
				if ( ! empty( $og['description'] ) ) {
					echo '<meta property="og:description" content="' . esc_attr( $og['description'] ) . '">' . "\n";
				}
				if ( ! empty( $og['url'] ) ) {
					echo '<meta property="og:url" content="' . esc_url( $og['url'] ) . '">' . "\n";
				}
				if ( ! empty( $og['image'] ) ) {
					echo '<meta property="og:image" content="' . esc_url( $og['image'] ) . '">' . "\n";
				}
			}
		}
	}

	public static function maybe_remove_canonical() {
		$post_id = self::get_current_post_id();
		if ( $post_id && get_post_meta( $post_id, self::META_CANONICAL, true ) ) {
			remove_action( 'wp_head', 'rel_canonical' );
		}
	}

	/* ─── Helpers ─── */

	private static function get_current_post_id() {
		if ( is_front_page() && get_option( 'page_on_front' ) ) {
			return (int) get_option( 'page_on_front' );
		}
		if ( is_singular() ) {
			return get_the_ID();
		}
		return 0;
	}
}
