<?php
/**
 * Module contract.
 *
 * Every plugin feature implements this interface so the registry
 * can boot it in isolation, track its health, and skip it cleanly
 * when the plugin is in a degraded or reduced state.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

interface ACTV_Module {

	/**
	 * Stable module identifier (e.g. 'tracker', 'forms', 'seo_fixes').
	 *
	 * @return string
	 */
	public function key();

	/**
	 * Human-readable name for admin/recovery UI.
	 *
	 * @return string
	 */
	public function name();

	/**
	 * Other module keys this module depends on.
	 * Registry will skip this module if any dependency is unhealthy.
	 *
	 * @return string[]
	 */
	public function dependencies();

	/**
	 * Whether this module is in the critical set (failure → reduced_mode).
	 *
	 * @return bool
	 */
	public function is_critical();

	/**
	 * Boot the module. May throw \Throwable — registry catches.
	 */
	public function init();
}
