=== Mission Metrics — ACTV TRKR ===
Contributors: actvtrkr
Tags: analytics, tracking, gravity forms, leads, pageviews
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later

First-party pageview tracking and Gravity Forms lead ingestion for ACTV TRKR.

== Description ==

Mission Metrics connects your WordPress site to your ACTV TRKR dashboard.

**Features:**

* Lightweight first-party pageview tracking (no third-party scripts)
* Automatic Gravity Forms submission forwarding
* Cookie-based visitor and session identification
* UTM parameter capture and attribution
* Automatic retry queue for failed transmissions
* Zero impact on page load speed (async, non-blocking)

== Installation ==

1. Upload the `mission-metrics-wp-plugin` folder to `/wp-content/plugins/`
2. Activate the plugin through the Plugins menu
3. Go to **Settings → Mission Metrics**
4. Paste your API key from the ACTV TRKR onboarding screen
5. Enable tracking — pageviews start flowing immediately
6. If you use Gravity Forms, enable the Gravity Forms toggle

== Frequently Asked Questions ==

= Does this slow down my site? =
No. The tracking script is tiny (~3 KB) and sends data asynchronously.

= What cookies does it set? =
* `mm_vid` — Visitor ID (365 days)
* `mm_sid` — Session ID (30-minute rolling window)
* `mm_utm` — UTM parameters (30 days)
* `mm_ts` — Last activity timestamp (session timeout enforcement)

== Changelog ==

= 1.0.0 =
* Initial release
