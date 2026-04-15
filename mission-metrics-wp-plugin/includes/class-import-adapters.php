<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Builder-specific adapters for historical form entry import.
 * Each adapter handles discovery, counting, cursor-based pagination,
 * and entry normalization for its specific form builder.
 */

interface MM_Import_Adapter {
	public function get_builder_type(): string;
	public function discover_forms(): array;
	public function count_entries( string $form_id ): int;
	public function fetch_entries_page( string $form_id, ?string $cursor, int $limit ): array;
	public function normalize_entry( array $raw_entry, string $form_id ): array;
	public function get_stable_entry_id( array $raw_entry ): string;
	public function supports_cursor_pagination(): bool;
}

// ═══════════════════════════════════════════════════════════════════
// Gravity Forms Adapter
// ═══════════════════════════════════════════════════════════════════
class MM_Adapter_Gravity implements MM_Import_Adapter {

	public function get_builder_type(): string { return 'gravity_forms'; }

	public function discover_forms(): array {
		if ( ! class_exists( 'GFAPI' ) ) return array();
		$forms = \GFAPI::get_forms();
		if ( ! is_array( $forms ) ) return array();
		$result = array();
		foreach ( $forms as $form ) {
			$result[] = array(
				'external_form_id' => (string) ( $form['id'] ?? '' ),
				'form_name'        => $form['title'] ?? 'Gravity Form',
			);
		}
		return $result;
	}

	public function count_entries( string $form_id ): int {
		if ( ! class_exists( 'GFAPI' ) ) return 0;
		return (int) \GFAPI::count_entries( $form_id, array( 'status' => 'active' ) );
	}

	public function fetch_entries_page( string $form_id, ?string $cursor, int $limit ): array {
		if ( ! class_exists( 'GFAPI' ) ) return array( 'entries' => array(), 'next_cursor' => null );

		$search = array( 'status' => 'active' );
		$sorting = array( 'key' => 'id', 'direction' => 'ASC' );

		if ( $cursor ) {
			$search['field_filters'] = array(
				array( 'key' => 'id', 'operator' => '>', 'value' => $cursor ),
			);
		}

		$entries = \GFAPI::get_entries( $form_id, $search, $sorting, array( 'offset' => 0, 'page_size' => $limit ) );
		if ( ! is_array( $entries ) || empty( $entries ) ) {
			return array( 'entries' => array(), 'next_cursor' => null );
		}

		$last = end( $entries );
		$next_cursor = count( $entries ) >= $limit ? (string) $last['id'] : null;

		return array( 'entries' => $entries, 'next_cursor' => $next_cursor );
	}

	public function normalize_entry( array $raw_entry, string $form_id ): array {
		$form = \GFAPI::get_form( $form_id );
		$fields = array();
		if ( ! empty( $form['fields'] ) ) {
			foreach ( $form['fields'] as $field ) {
				$fid = $field->id;
				$value = $raw_entry[ (string) $fid ] ?? '';
				if ( $value === '' ) continue;
				$fields[ $field->label ?: "field_$fid" ] = $value;
			}
		}
		return array(
			'fields'       => $fields,
			'submitted_at' => $raw_entry['date_created'] ?? null,
			'source_url'   => $raw_entry['source_url'] ?? null,
		);
	}

	public function get_stable_entry_id( array $raw_entry ): string {
		return (string) ( $raw_entry['id'] ?? '' );
	}

	public function supports_cursor_pagination(): bool { return true; }
}

// ═══════════════════════════════════════════════════════════════════
// Avada / Fusion Forms Adapter
// ═══════════════════════════════════════════════════════════════════
class MM_Adapter_Avada implements MM_Import_Adapter {

	/** @var array Cache of resolved form IDs: post_id => internal_id */
	private $resolved_cache = array();

	public function get_builder_type(): string { return 'avada'; }

	public function discover_forms(): array {
		$posts = get_posts( array(
			'post_type'      => 'fusion_form',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );
		if ( ! is_array( $posts ) || empty( $posts ) ) return array();
		$result = array();
		foreach ( $posts as $pid ) {
			$result[] = array(
				'external_form_id' => (string) $pid,
				'form_name'        => get_the_title( $pid ) ?: 'Avada Form',
			);
		}
		return $result;
	}

	public function count_entries( string $form_id ): int {
		global $wpdb;
		$table = $this->get_submissions_table();
		if ( ! $table ) return 0;
		$resolved_id = $this->resolve_form_id( $form_id );
		return (int) $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM {$table} WHERE form_id = %s",
			$resolved_id
		) );
	}

	public function fetch_entries_page( string $form_id, ?string $cursor, int $limit ): array {
		global $wpdb;
		$table = $this->get_submissions_table();
		if ( ! $table ) return array( 'entries' => array(), 'next_cursor' => null );

		$resolved_id = $this->resolve_form_id( $form_id );

		if ( $cursor ) {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM {$table} WHERE form_id = %s AND id > %d ORDER BY id ASC LIMIT %d",
				$resolved_id, (int) $cursor, $limit
			), ARRAY_A );
		} else {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM {$table} WHERE form_id = %s ORDER BY id ASC LIMIT %d",
				$resolved_id, $limit
			), ARRAY_A );
		}

		if ( ! is_array( $rows ) || empty( $rows ) ) {
			return array( 'entries' => array(), 'next_cursor' => null );
		}

		$last = end( $rows );
		$next_cursor = count( $rows ) >= $limit ? (string) $last['id'] : null;

		return array( 'entries' => $rows, 'next_cursor' => $next_cursor );
	}

	public function normalize_entry( array $raw_entry, string $form_id ): array {
		$data = array();
		// Avada stores submission data as serialized or in a data column
		if ( isset( $raw_entry['data'] ) ) {
			$parsed = maybe_unserialize( $raw_entry['data'] );
			if ( is_array( $parsed ) ) {
				$data = $parsed;
			} elseif ( is_string( $parsed ) ) {
				$data = array( 'raw_data' => $parsed );
			}
		}
		return array(
			'fields'       => $data,
			'submitted_at' => $raw_entry['time'] ?? $raw_entry['date_created'] ?? $raw_entry['created_at'] ?? null,
			'source_url'   => null,
		);
	}

	public function get_stable_entry_id( array $raw_entry ): string {
		return (string) ( $raw_entry['id'] ?? '' );
	}

	public function supports_cursor_pagination(): bool { return true; }

	private function get_submissions_table(): ?string {
		global $wpdb;
		$candidates = array(
			$wpdb->prefix . 'fusion_form_submissions',
			$wpdb->prefix . 'fusion_form_db_entries',
		);
		foreach ( $candidates as $t ) {
			if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $t ) ) === $t ) {
				return $t;
			}
		}
		return null;
	}

	/**
	 * Multi-layer resolution of WP post ID to Avada internal form_id.
	 * Mirrors the same strategy used in MM_Forms::get_form_entry_ids().
	 *
	 * Layer 0a: postmeta keys (form_id, _fusion_form_id, fusion_form_id)
	 * Layer 0b: page content scan for form_post_id="X" references
	 * Layer 0c: source_url reverse-match in submissions table
	 * Fallback: raw post ID (may return 0 results if Avada uses different IDs)
	 */
	private function resolve_form_id( string $form_id ): string {
		if ( isset( $this->resolved_cache[ $form_id ] ) ) {
			return $this->resolved_cache[ $form_id ];
		}

		global $wpdb;

		// Layer 0a: postmeta
		$meta_candidates = array( 'form_id', '_fusion_form_id', 'fusion_form_id' );
		foreach ( $meta_candidates as $meta_key ) {
			$meta_val = get_post_meta( (int) $form_id, $meta_key, true );
			if ( ! empty( $meta_val ) && is_numeric( $meta_val ) && intval( $meta_val ) !== intval( $form_id ) ) {
				$resolved = (string) intval( $meta_val );
				$this->resolved_cache[ $form_id ] = $resolved;
				return $resolved;
			}
		}

		$table = $this->get_submissions_table();
		if ( ! $table ) {
			$this->resolved_cache[ $form_id ] = $form_id;
			return $form_id;
		}

		// Check if the raw post ID actually has submissions (common case)
		$direct_count = (int) $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM {$table} WHERE form_id = %s LIMIT 1",
			$form_id
		) );
		if ( $direct_count > 0 ) {
			$this->resolved_cache[ $form_id ] = $form_id;
			return $form_id;
		}

		// Layer 0b: page content scan — find which internal form_id corresponds
		// by scanning pages whose content embeds form_post_id="<post_id>"
		$cols = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );
		$has_source_url = is_array( $cols ) && in_array( 'source_url', $cols, true );

		$internal_ids = $wpdb->get_col( "SELECT DISTINCT form_id FROM {$table}" );
		if ( is_array( $internal_ids ) && count( $internal_ids ) > 0 && $has_source_url ) {
			foreach ( $internal_ids as $iid ) {
				$sample_url = $wpdb->get_var( $wpdb->prepare(
					"SELECT source_url FROM {$table} WHERE form_id = %d AND source_url IS NOT NULL AND source_url != '' LIMIT 1",
					intval( $iid )
				) );
				if ( ! $sample_url ) continue;

				$url_path = wp_parse_url( $sample_url, PHP_URL_PATH );
				if ( ! $url_path ) continue;
				$url_path = trim( $url_path, '/' );
				if ( empty( $url_path ) ) continue;

				$page_post = get_page_by_path( $url_path );
				if ( ! $page_post ) continue;

				$content = $page_post->post_content ?? '';
				$decoded = html_entity_decode( $content );
				if (
					strpos( $decoded, 'form_post_id="' . $form_id . '"' ) !== false ||
					strpos( $decoded, "form_post_id='" . $form_id . "'" ) !== false ||
					strpos( $decoded, '"form_post_id":"' . $form_id . '"' ) !== false
				) {
					$resolved = (string) intval( $iid );
					$this->resolved_cache[ $form_id ] = $resolved;
					return $resolved;
				}
			}
		}

		// Layer 0c: source_url reverse-match using the form's known page_url
		if ( $has_source_url ) {
			// Get the page URL from the forms table in our DB (passed as context)
			// or derive from the WP post's shortcode pages
			$page_url = get_post_meta( (int) $form_id, '_page_url', true );
			if ( ! $page_url ) {
				// Try to find the page URL from the WP post slug
				$form_post = get_post( (int) $form_id );
				if ( $form_post ) {
					$page_url = get_permalink( $form_post );
				}
			}

			// Also build URL candidates from pages that embed this form
			$url_candidates = array();
			if ( $page_url ) {
				$parsed_path = wp_parse_url( $page_url, PHP_URL_PATH );
				if ( $parsed_path ) {
					$url_candidates[] = trim( $parsed_path, '/' );
				}
			}

			// Search all pages for form_post_id references to find URL candidates
			$pages_with_form = $wpdb->get_col( $wpdb->prepare(
				"SELECT ID FROM {$wpdb->posts} WHERE post_type IN ('page','post') AND post_status = 'publish' AND (post_content LIKE %s OR post_content LIKE %s)",
				'%form_post_id="' . intval( $form_id ) . '"%',
				"%form_post_id='" . intval( $form_id ) . "'%"
			) );
			if ( is_array( $pages_with_form ) ) {
				foreach ( $pages_with_form as $page_id ) {
					$purl = get_permalink( $page_id );
					if ( $purl ) {
						$pp = wp_parse_url( $purl, PHP_URL_PATH );
						if ( $pp ) $url_candidates[] = trim( $pp, '/' );
					}
				}
			}

			foreach ( $url_candidates as $url_cand ) {
				$like = '%' . $wpdb->esc_like( $url_cand ) . '%';
				$matched_iid = $wpdb->get_var( $wpdb->prepare(
					"SELECT form_id FROM {$table} WHERE source_url LIKE %s AND form_id IS NOT NULL LIMIT 1",
					$like
				) );
				if ( $matched_iid && is_numeric( $matched_iid ) && intval( $matched_iid ) !== intval( $form_id ) ) {
					// Verify no collision with another form post via postmeta
					$collision = false;
					foreach ( $meta_candidates as $mk ) {
						$other_posts = $wpdb->get_col( $wpdb->prepare(
							"SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value = %s AND post_id != %d",
							$mk, (string) $matched_iid, intval( $form_id )
						) );
						if ( ! empty( $other_posts ) ) { $collision = true; break; }
					}
					if ( ! $collision ) {
						$resolved = (string) intval( $matched_iid );
						$this->resolved_cache[ $form_id ] = $resolved;
						return $resolved;
					}
				}
			}
		}

		// Fallback: use raw post ID
		$this->resolved_cache[ $form_id ] = $form_id;
		return $form_id;
	}
}

// ═══════════════════════════════════════════════════════════════════
// WPForms Adapter
// ═══════════════════════════════════════════════════════════════════
class MM_Adapter_WPForms implements MM_Import_Adapter {

	public function get_builder_type(): string { return 'wpforms'; }

	public function discover_forms(): array {
		if ( ! function_exists( 'wpforms' ) || ! isset( wpforms()->form ) ) return array();
		$forms = wpforms()->form->get( '', array( 'posts_per_page' => -1 ) );
		if ( ! is_array( $forms ) ) return array();
		$result = array();
		foreach ( $forms as $form ) {
			$result[] = array(
				'external_form_id' => (string) $form->ID,
				'form_name'        => $form->post_title ?: 'WPForm',
			);
		}
		return $result;
	}

	public function count_entries( string $form_id ): int {
		if ( ! function_exists( 'wpforms' ) || ! isset( wpforms()->entry ) ) return 0;
		return (int) wpforms()->entry->get_entries( array( 'form_id' => $form_id ), true );
	}

	public function fetch_entries_page( string $form_id, ?string $cursor, int $limit ): array {
		if ( ! function_exists( 'wpforms' ) || ! isset( wpforms()->entry ) ) {
			return array( 'entries' => array(), 'next_cursor' => null );
		}

		global $wpdb;
		$table = $wpdb->prefix . 'wpforms_entries';
		$table_exists = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) ) === $table;
		if ( ! $table_exists ) return array( 'entries' => array(), 'next_cursor' => null );

		if ( $cursor ) {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM {$table} WHERE form_id = %d AND entry_id > %d ORDER BY entry_id ASC LIMIT %d",
				(int) $form_id, (int) $cursor, $limit
			), ARRAY_A );
		} else {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM {$table} WHERE form_id = %d ORDER BY entry_id ASC LIMIT %d",
				(int) $form_id, $limit
			), ARRAY_A );
		}

		if ( ! is_array( $rows ) || empty( $rows ) ) {
			return array( 'entries' => array(), 'next_cursor' => null );
		}

		$last = end( $rows );
		$next_cursor = count( $rows ) >= $limit ? (string) $last['entry_id'] : null;

		return array( 'entries' => $rows, 'next_cursor' => $next_cursor );
	}

	public function normalize_entry( array $raw_entry, string $form_id ): array {
		$fields = array();
		if ( isset( $raw_entry['fields'] ) ) {
			$parsed = json_decode( $raw_entry['fields'], true );
			if ( is_array( $parsed ) ) {
				foreach ( $parsed as $fid => $field ) {
					$label = $field['name'] ?? "field_$fid";
					$fields[ $label ] = $field['value'] ?? '';
				}
			}
		}
		return array(
			'fields'       => $fields,
			'submitted_at' => $raw_entry['date'] ?? $raw_entry['date_created'] ?? null,
			'source_url'   => null,
		);
	}

	public function get_stable_entry_id( array $raw_entry ): string {
		return (string) ( $raw_entry['entry_id'] ?? $raw_entry['id'] ?? '' );
	}

	public function supports_cursor_pagination(): bool { return true; }
}

// ═══════════════════════════════════════════════════════════════════
// Contact Form 7 Adapter (requires Flamingo for stored entries)
// ═══════════════════════════════════════════════════════════════════
class MM_Adapter_CF7 implements MM_Import_Adapter {

	public function get_builder_type(): string { return 'cf7'; }

	public function discover_forms(): array {
		if ( ! class_exists( 'WPCF7_ContactForm' ) ) return array();
		$forms = \WPCF7_ContactForm::find();
		if ( ! is_array( $forms ) ) return array();
		$result = array();
		foreach ( $forms as $form ) {
			$result[] = array(
				'external_form_id' => (string) $form->id(),
				'form_name'        => $form->title(),
			);
		}
		return $result;
	}

	public function count_entries( string $form_id ): int {
		// CF7 doesn't store entries natively. Flamingo does.
		if ( ! post_type_exists( 'flamingo_inbound' ) ) return 0;
		global $wpdb;
		$channel = $this->get_channel_slug( $form_id );
		if ( ! $channel ) return 0;
		return (int) $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'flamingo_inbound' AND post_status = 'publish'
			 AND ID IN (SELECT object_id FROM {$wpdb->term_relationships} tr
			            JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
			            WHERE tt.taxonomy = 'flamingo_inbound_channel' AND tt.term_id IN (
			              SELECT term_id FROM {$wpdb->terms} WHERE slug = %s
			            ))",
			$channel
		) );
	}

	public function fetch_entries_page( string $form_id, ?string $cursor, int $limit ): array {
		if ( ! post_type_exists( 'flamingo_inbound' ) ) {
			return array( 'entries' => array(), 'next_cursor' => null );
		}

		$args = array(
			'post_type'      => 'flamingo_inbound',
			'post_status'    => 'publish',
			'posts_per_page' => $limit,
			'orderby'        => 'ID',
			'order'          => 'ASC',
		);

		if ( $cursor ) {
			global $wpdb;
			$args['where'] = $wpdb->prepare( "AND {$wpdb->posts}.ID > %d", (int) $cursor );
		}

		// Filter by channel
		$channel = $this->get_channel_slug( $form_id );
		if ( $channel ) {
			$args['tax_query'] = array(
				array(
					'taxonomy' => 'flamingo_inbound_channel',
					'field'    => 'slug',
					'terms'    => $channel,
				),
			);
		}

		$query = new \WP_Query( $args );
		$entries = array();
		foreach ( $query->posts as $post ) {
			$meta = get_post_meta( $post->ID, '_fields', true );
			$entries[] = array(
				'id'     => $post->ID,
				'fields' => is_array( $meta ) ? $meta : array(),
				'date'   => $post->post_date,
			);
		}

		$last = ! empty( $entries ) ? end( $entries ) : null;
		$next_cursor = ( $last && count( $entries ) >= $limit ) ? (string) $last['id'] : null;

		return array( 'entries' => $entries, 'next_cursor' => $next_cursor );
	}

	public function normalize_entry( array $raw_entry, string $form_id ): array {
		$fields = is_array( $raw_entry['fields'] ?? null ) ? $raw_entry['fields'] : array();
		return array(
			'fields'       => $fields,
			'submitted_at' => $raw_entry['date'] ?? null,
			'source_url'   => null,
		);
	}

	public function get_stable_entry_id( array $raw_entry ): string {
		return (string) ( $raw_entry['id'] ?? '' );
	}

	public function supports_cursor_pagination(): bool { return true; }

	private function get_channel_slug( string $form_id ): ?string {
		if ( ! class_exists( 'WPCF7_ContactForm' ) ) return null;
		$form = \WPCF7_ContactForm::get_instance( $form_id );
		if ( ! $form ) return null;
		return sanitize_title( $form->title() );
	}
}

// ═══════════════════════════════════════════════════════════════════
// Adapter Registry
// ═══════════════════════════════════════════════════════════════════
class MM_Adapter_Registry {

	private static $adapters = array();

	public static function init() {
		self::register( new MM_Adapter_Gravity() );
		self::register( new MM_Adapter_Avada() );
		self::register( new MM_Adapter_WPForms() );
		self::register( new MM_Adapter_CF7() );
	}

	public static function register( MM_Import_Adapter $adapter ) {
		self::$adapters[ $adapter->get_builder_type() ] = $adapter;
	}

	public static function get( string $builder_type ): ?MM_Import_Adapter {
		return self::$adapters[ $builder_type ] ?? null;
	}

	public static function all(): array {
		return self::$adapters;
	}
}
