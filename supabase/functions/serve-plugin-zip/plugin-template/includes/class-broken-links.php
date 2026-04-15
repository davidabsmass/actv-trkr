<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Broken Link Scanner – crawl sitemap, check for 404/5xx responses.
 */
class MM_Broken_Links {

	const MAX_PAGES = 200;

	public static function init() {
		add_action( 'wp_ajax_mm_scan_broken_links', array( __CLASS__, 'ajax_scan' ) );

		// Schedule weekly automated scan.
		add_action( 'mm_broken_links_cron', array( __CLASS__, 'scan_and_report' ) );
		if ( ! wp_next_scheduled( 'mm_broken_links_cron' ) ) {
			wp_schedule_event( time(), 'weekly', 'mm_broken_links_cron' );
		}
	}

	public static function ajax_scan() {
		check_ajax_referer( 'mm_scan_links', '_wpnonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}

		$result = self::scan_and_report();
		if ( isset( $result['error'] ) ) {
			wp_send_json_error( $result['error'] );
		}
		wp_send_json_success( $result );
	}

	public static function scan_and_report() {
		$pages = self::get_pages_from_sitemap();
		if ( empty( $pages ) ) {
			// Fallback: use published pages/posts
			$pages = self::get_pages_from_db();
		}

		$broken = array();
		$checked = 0;

		foreach ( array_slice( $pages, 0, self::MAX_PAGES ) as $page_url ) {
			$response = wp_remote_get( $page_url, array( 'timeout' => 10, 'redirection' => 3 ) );
			if ( is_wp_error( $response ) ) continue;

			$body = wp_remote_retrieve_body( $response );
			if ( empty( $body ) ) continue;

			// Extract internal links
			$links = self::extract_links( $body, $page_url );
			$checked++;

			foreach ( $links as $link ) {
				$link_resp = wp_remote_head( $link, array( 'timeout' => 5, 'redirection' => 3 ) );
				if ( is_wp_error( $link_resp ) ) {
					$broken[] = array(
						'source_page' => $page_url,
						'broken_url'  => $link,
						'status_code' => 0,
					);
					continue;
				}

				$code = wp_remote_retrieve_response_code( $link_resp );
				if ( $code >= 400 ) {
					$broken[] = array(
						'source_page' => $page_url,
						'broken_url'  => $link,
						'status_code' => $code,
					);
				}
			}
		}

		if ( empty( $broken ) ) {
			return array( 'pages_checked' => $checked, 'broken_found' => 0 );
		}

		// Send to backend
		$opts     = MM_Settings::get();
		$endpoint = rtrim( $opts['endpoint_url'], '/' ) . '/ingest-broken-links';
		$domain   = wp_parse_url( home_url(), PHP_URL_HOST );

		$response = wp_remote_post( $endpoint, array(
			'timeout' => 30,
			'headers' => array(
				'Content-Type'   => 'application/json',
				'x-actvtrkr-key' => $opts['api_key'],
			),
			'body' => wp_json_encode( array(
				'domain' => $domain,
				'links'  => $broken,
			) ),
		) );

		return array(
			'pages_checked' => $checked,
			'broken_found'  => count( $broken ),
		);
	}

	private static function get_pages_from_sitemap() {
		$sitemap_url = home_url( '/sitemap.xml' );
		$response    = wp_remote_get( $sitemap_url, array( 'timeout' => 10 ) );
		if ( is_wp_error( $response ) ) return array();

		$body = wp_remote_retrieve_body( $response );
		preg_match_all( '/<loc>(.*?)<\/loc>/', $body, $matches );
		return $matches[1] ?? array();
	}

	private static function get_pages_from_db() {
		$posts = get_posts( array(
			'post_type'   => array( 'page', 'post' ),
			'post_status' => 'publish',
			'numberposts' => self::MAX_PAGES,
		) );
		return array_map( function ( $p ) { return get_permalink( $p ); }, $posts );
	}

	private static function extract_links( $html, $page_url ) {
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		preg_match_all( '/href=["\']([^"\']+)["\']/', $html, $matches );
		$links = array();

		// Static asset extensions to skip – these are not navigable pages
		$skip_exts = array( '.css', '.js', '.xsl', '.xslt', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.pdf', '.zip', '.map' );

		foreach ( $matches[1] as $href ) {
			if ( strpos( $href, '#' ) === 0 || strpos( $href, 'mailto:' ) === 0 || strpos( $href, 'tel:' ) === 0 ) continue;
			if ( strpos( $href, 'javascript:' ) === 0 ) continue;

			// Skip static assets / non-page resources
			$lower = strtolower( $href );
			$skip  = false;
			foreach ( $skip_exts as $ext ) {
				// Check before any query string
				$path_part = strtok( $lower, '?' );
				if ( substr( $path_part, -strlen( $ext ) ) === $ext ) {
					$skip = true;
					break;
				}
			}
			if ( $skip ) continue;

			// Make absolute
			if ( strpos( $href, '/' ) === 0 ) {
				$href = home_url( $href );
			}

			// Only internal links
			$link_host = wp_parse_url( $href, PHP_URL_HOST );
			if ( $link_host && $link_host !== $host ) continue;

			$links[] = $href;
		}

		return array_unique( array_slice( $links, 0, 50 ) ); // limit per page
	}
}
