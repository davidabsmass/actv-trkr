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
				// CSV-style data
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
	 * Resolve WP post ID to Avada internal form_id if needed.
	 */
	private function resolve_form_id( string $form_id ): string {
		$meta_id = get_post_meta( (int) $form_id, 'form_id', true );
		if ( $meta_id ) return (string) $meta_id;
		$meta_id = get_post_meta( (int) $form_id, '_fusion_form_id', true );
		if ( $meta_id ) return (string) $meta_id;
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
