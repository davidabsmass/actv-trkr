<?php
/**
 * WooCommerce order tracking for ACTV TRKR.
 * Sends completed orders to the ingest-order edge function
 * with session/visitor attribution from the tracking cookie.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MM_WooCommerce {

	public function __construct() {
		// Fire on order status change to completed, or on checkout processed
		add_action( 'woocommerce_order_status_completed', array( $this, 'send_order' ), 10, 1 );
		add_action( 'woocommerce_checkout_order_processed', array( $this, 'send_order' ), 10, 1 );
	}

	/**
	 * Send order data to the edge function.
	 */
	public function send_order( $order_id ) {
		$settings = MM_Settings::get_all();
		if ( empty( $settings['api_key'] ) || empty( $settings['endpoint'] ) ) {
			return;
		}

		// Prevent duplicate sends via meta flag
		$sent = get_post_meta( $order_id, '_mm_order_sent', true );
		if ( $sent === 'yes' ) {
			return;
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		// Read visitor/session from cookie (set by tracker.js)
		$visitor_id = isset( $_COOKIE['mm_vid'] ) ? sanitize_text_field( $_COOKIE['mm_vid'] ) : null;
		$session_id = isset( $_COOKIE['mm_sid'] ) ? sanitize_text_field( $_COOKIE['mm_sid'] ) : null;

		$items = array();
		foreach ( $order->get_items() as $item ) {
			$product = $item->get_product();
			$items[] = array(
				'product_name' => $item->get_name(),
				'product_id'   => $product ? $product->get_id() : null,
				'sku'          => $product ? $product->get_sku() : null,
				'quantity'     => $item->get_quantity(),
				'line_total'   => (float) $item->get_total(),
			);
		}

		$payload = array(
			'api_key'  => $settings['api_key'],
			'domain'   => home_url(),
			'order'    => array(
				'order_id'       => $order_id,
				'status'         => $order->get_status(),
				'total'          => (float) $order->get_total(),
				'currency'       => $order->get_currency(),
				'payment_method' => $order->get_payment_method_title(),
				'customer_email' => $order->get_billing_email(),
				'customer_name'  => trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ),
				'visitor_id'     => $visitor_id,
				'session_id'     => $session_id,
				'ordered_at'     => $order->get_date_created()
					? $order->get_date_created()->format( 'c' )
					: gmdate( 'c' ),
				'items'          => $items,
			),
		);

		$endpoint = rtrim( $settings['endpoint'], '/' );
		// Replace the function path for ingest-order
		$url = preg_replace( '/\/functions\/v1\/.*$/', '/functions/v1/ingest-order', $endpoint );

		$response = wp_remote_post( $url, array(
			'timeout' => 10,
			'headers' => array(
				'Content-Type' => 'application/json',
				'x-api-key'    => $settings['api_key'],
			),
			'body'    => wp_json_encode( $payload ),
		) );

		if ( ! is_wp_error( $response ) && wp_remote_retrieve_response_code( $response ) === 200 ) {
			update_post_meta( $order_id, '_mm_order_sent', 'yes' );
		} else {
			// Queue for retry
			if ( class_exists( 'MM_Retry_Queue' ) ) {
				MM_Retry_Queue::enqueue( $url, $payload );
			}
		}
	}
}
