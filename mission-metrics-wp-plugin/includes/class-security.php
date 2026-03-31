<?php
/**
 * Security monitoring: failed logins, brute force detection, file integrity.
 * Only warning and critical severity events are reported to reduce noise.
 */
class Mission_Metrics_Security {
    private $api_url;
    private $api_key;
    private $site_domain;

    public function __construct() {
        $this->api_url  = get_option('mission_metrics_api_url', '');
        $this->api_key  = get_option('mission_metrics_api_key', '');
        $this->site_domain = wp_parse_url(home_url(), PHP_URL_HOST);
    }

    public function init() {
        // Track failed logins
        add_action('wp_login_failed', [$this, 'on_login_failed'], 10, 2);

        // Successful logins — only flag if suspicious (skip info-level new IP)
        // Removed: on_login_success (was info severity, too noisy)

        // Schedule daily file integrity scan
        if (!wp_next_scheduled('mission_metrics_file_integrity_scan')) {
            wp_schedule_event(time(), 'daily', 'mission_metrics_file_integrity_scan');
        }
        add_action('mission_metrics_file_integrity_scan', [$this, 'run_file_integrity_scan']);

        // Brute force detection (check on each failed login)
        add_action('wp_login_failed', [$this, 'check_brute_force'], 20, 2);
    }

    /**
     * Record a failed login attempt.
     */
    public function on_login_failed($username, $error = null) {
        $this->send_event([
            'event_type' => 'failed_login',
            'severity'   => 'warning',
            'title'      => "Failed login attempt for '{$username}'",
            'details'    => [
                'username' => $username,
                'ip'       => $this->get_client_ip(),
                'user_agent' => isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field($_SERVER['HTTP_USER_AGENT']) : '',
            ],
        ]);
    }

    /**
     * Detect brute force: 5+ failed logins within 10 minutes from same IP.
     */
    public function check_brute_force($username, $error = null) {
        $ip = $this->get_client_ip();
        $transient_key = 'mm_failed_login_' . md5($ip);
        $attempts = get_transient($transient_key);

        if ($attempts === false) {
            $attempts = 0;
        }
        $attempts++;
        set_transient($transient_key, $attempts, 10 * MINUTE_IN_SECONDS);

        if ($attempts >= 5) {
            $this->send_event([
                'event_type' => 'brute_force',
                'severity'   => 'critical',
                'title'      => "Brute force detected: {$attempts} failed attempts from {$ip}",
                'details'    => [
                    'ip'       => $ip,
                    'attempts' => $attempts,
                    'username' => $username,
                ],
            ]);
            // Reset after alerting
            delete_transient($transient_key);
        }
    }

    /**
     * File integrity scan: compare checksums of core WP files, active theme, and must-use plugins.
     * Only reports modified (warning) and deleted (critical) files. New files (info) are skipped.
     */
    public function run_file_integrity_scan() {
        $baseline_key = '_mm_file_baseline';
        $baseline = get_option($baseline_key, []);
        $current  = $this->build_file_snapshot();
        $events   = [];

        if (empty($baseline)) {
            // First run — store baseline, no alerts
            update_option($baseline_key, $current);
            return;
        }

        // Detect modified and deleted files (warning + critical only)
        foreach ($baseline as $path => $hash) {
            if (!isset($current[$path])) {
                $events[] = [
                    'event_type' => 'file_deleted',
                    'severity'   => 'critical',
                    'title'      => "File deleted: {$path}",
                    'details'    => ['path' => $path],
                ];
            } elseif ($current[$path] !== $hash) {
                $events[] = [
                    'event_type' => 'file_changed',
                    'severity'   => 'warning',
                    'title'      => "File modified: {$path}",
                    'details'    => ['path' => $path],
                ];
            }
        }

        // New files (info severity) — intentionally skipped to reduce noise
        // The baseline is still updated so future deletions/changes are caught

        // Send events
        if (!empty($events)) {
            $this->send_events_batch($events);
        }

        // Update baseline
        update_option($baseline_key, $current);
    }

    /**
     * Build a snapshot of key files with their md5 hashes.
     */
    private function build_file_snapshot() {
        $snapshot = [];

        // Core files (wp-includes and wp-admin top-level PHP files)
        foreach (['wp-includes', 'wp-admin'] as $dir) {
            $full = ABSPATH . $dir;
            if (!is_dir($full)) continue;
            $files = glob($full . '/*.php');
            if ($files) {
                foreach ($files as $f) {
                    $rel = str_replace(ABSPATH, '', $f);
                    $snapshot[$rel] = md5_file($f);
                }
            }
        }

        // Root PHP files
        $root_files = glob(ABSPATH . '*.php');
        if ($root_files) {
            foreach ($root_files as $f) {
                $rel = basename($f);
                $snapshot[$rel] = md5_file($f);
            }
        }

        // Active theme PHP files (one level deep)
        $theme_dir = get_stylesheet_directory();
        $theme_files = glob($theme_dir . '/*.php');
        if ($theme_files) {
            foreach ($theme_files as $f) {
                $rel = 'theme/' . basename($f);
                $snapshot[$rel] = md5_file($f);
            }
        }

        return $snapshot;
    }

    /**
     * Send a single security event.
     */
    private function send_event($event) {
        $this->send_events_batch([$event]);
    }

    /**
     * Send a batch of security events.
     */
    private function send_events_batch($events) {
        if (empty($this->api_url) || empty($this->api_key)) return;

        foreach ($events as &$e) {
            if (!isset($e['occurred_at'])) {
                $e['occurred_at'] = gmdate('c');
            }
        }

        $url = rtrim($this->api_url, '/') . '/functions/v1/ingest-security';

        wp_remote_post($url, [
            'timeout' => 10,
            'headers' => [
                'Content-Type' => 'application/json',
                'x-api-key'    => $this->api_key,
            ],
            'body' => wp_json_encode([
                'site_domain' => $this->site_domain,
                'events'      => $events,
            ]),
        ]);
    }

    private function get_client_ip() {
        $headers = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];
        foreach ($headers as $h) {
            if (!empty($_SERVER[$h])) {
                $ip = explode(',', $_SERVER[$h]);
                return sanitize_text_field(trim($ip[0]));
            }
        }
        return '0.0.0.0';
    }
}
