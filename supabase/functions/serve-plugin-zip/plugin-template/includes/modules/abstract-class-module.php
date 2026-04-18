<?php
/**
 * Base implementation for ACTV_Module.
 *
 * Provides default no-op behavior so subclasses can override only what they need.
 * Most existing MM_* classes are wrapped by trivial subclasses that delegate
 * their init() to the legacy class's static init().
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

abstract class ACTV_Abstract_Module implements ACTV_Module {

	public function dependencies() {
		return array();
	}

	public function is_critical() {
		return false;
	}

	public function name() {
		// Default to humanized key.
		return ucwords( str_replace( '_', ' ', $this->key() ) );
	}

	/**
	 * Helper: safely invoke a callable, returning [$ok, $error].
	 *
	 * @param callable $cb
	 * @return array{0:bool,1:?string}
	 */
	protected function safe_call( $cb ) {
		try {
			call_user_func( $cb );
			return array( true, null );
		} catch ( \Throwable $e ) {
			return array( false, $e->getMessage() );
		}
	}
}
