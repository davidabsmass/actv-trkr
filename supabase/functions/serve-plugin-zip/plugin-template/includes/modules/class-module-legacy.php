<?php
/**
 * Generic legacy-class wrapper.
 *
 * Wraps any existing MM_* class that exposes a static init() method,
 * giving it a Module identity without rewriting the class itself.
 *
 * Used for PR 1 to register all current subsystems with minimal diff.
 * In a later PR, individual classes can be promoted to first-class modules
 * with richer health reporting.
 *
 * @package ACTV_TRKR
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACTV_Module_Legacy extends ACTV_Abstract_Module {

	private $key;
	private $name;
	private $class_name;
	private $init_callable;
	private $deps;
	private $critical;

	/**
	 * @param string         $key            Module key.
	 * @param string         $name           Display name.
	 * @param string         $class_name     Underlying class to load and init.
	 * @param callable|null  $init_callable  Custom init callable (defaults to [$class_name, 'init']).
	 * @param string[]       $deps           Module dependencies.
	 * @param bool           $critical       Whether failure should trigger reduced_mode.
	 */
	public function __construct( $key, $name, $class_name, $init_callable = null, $deps = array(), $critical = false ) {
		$this->key           = $key;
		$this->name          = $name;
		$this->class_name    = $class_name;
		$this->init_callable = $init_callable;
		$this->deps          = $deps;
		$this->critical      = (bool) $critical;
	}

	public function key()          { return $this->key; }
	public function name()         { return $this->name; }
	public function dependencies() { return $this->deps; }
	public function is_critical()  { return $this->critical; }

	public function init() {
		if ( ! class_exists( $this->class_name ) ) {
			throw new \RuntimeException( sprintf( 'Module class "%s" not loaded', $this->class_name ) );
		}

		if ( $this->init_callable && is_callable( $this->init_callable ) ) {
			call_user_func( $this->init_callable );
			return;
		}

		if ( ! method_exists( $this->class_name, 'init' ) ) {
			throw new \RuntimeException( sprintf( 'Module class "%s" has no init() method', $this->class_name ) );
		}

		call_user_func( array( $this->class_name, 'init' ) );
	}
}
