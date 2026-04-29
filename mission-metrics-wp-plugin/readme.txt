=== ACTV TRKR ===
Contributors: absolutelymassive
Tags: analytics, tracking, gravity forms, leads, pageviews
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.21.3
License: GPL-2.0-or-later

First-party pageview tracking and Gravity Forms lead ingestion for ACTV TRKR.
...
== Changelog ==

= 1.21.3 =
* HARDENED: Adds fallback ACTV TRKR REST health/sync routes from the main plugin file so the dashboard can distinguish an active-but-degraded install from a truly deactivated plugin.

= 1.19.0 =
* NEW: Form discovery now reports each form's `is_active` state so the dashboard can distinguish enabled vs. disabled forms in WordPress (Gravity, WPForms, Ninja, Fluent, Avada, CF7).
* NEW: Forms toggled off in WordPress now propagate to the dashboard automatically — they're hidden from active counts and Form Health, but historical leads stay accessible.
* Backward compatible: older dashboards that don't read `is_active` are unaffected.

= 1.9.1 =
* NEW: Built-in cookie consent banner — no third-party plugin required.
* Preferences modal with Essential (always on) and Analytics (opt-in) categories.
* Admin settings for banner text, button labels, policy URLs, position, and expiry.
* Footer "Cookie Settings" reopener link.
* Consent debug panel in WP admin.
* Full integration with existing mmConsent API and strict/relaxed modes.

= 1.8.13 =
* FIX: Dashboard downloads now always serve the canonical latest plugin ZIP.
* FIX: Keeps the downloadable package in sync with the WordPress updater build.

= 1.8.11 =
* FIX: Avada sync now reuses backend-known page mappings and encoded builder detection so the correct page URLs are matched during reconciliation.
* FIX: Avada active entry matching now checks all known page URL candidates, restoring missing Apyx Medical entries without touching live form requests.

= 1.8.9 =
* FIX: Avada historical backfill now loads matching rows from all supported submission tables instead of only the first table found.
* FIX: Prevents missing Avada entries after April 2 on sites where newer submissions live outside the first detected table.

= 1.8.3 =
* SAFETY: Disables shutdown fallback polling so visitor and form requests are never delayed by plugin housekeeping.
* SAFETY: Moves site signal to WP-Cron only; no front-end signal script runs on client pages.

= 1.8.2 =
* SAFETY: Disables all live form submission hooks so the plugin never runs in a client's form request path.
* SAFETY: Disables front-end form listeners entirely; tracking remains passive and non-invasive.

= 1.8.1 =
* EMERGENCY: Disables front-end JS submit capture so the plugin cannot interfere with form submissions.
* STABILITY: Avada live submissions now avoid database lookups during submit to keep the request lightweight.

= 1.8.0 =
* SECURITY: Moves REST API authentication into permission_callback to reject unauthenticated requests before callback execution.
* SECURITY: Adds IP-based rate limiting (10 req/min) to all REST API endpoints to prevent abuse.
* STABILITY: Form submission ingestion is now non-blocking — prevents forms from hanging if the API is slow or unreachable.

= 1.7.1 =
* Fixes entry sync timeout for sites with 700K+ entries by paginating Gravity Forms ID collection.
* Increases sync-entries timeout from 30s to 120s and Edge Function sync timeout from 8s to 120s.

= 1.7.0 =
* Adds Magic Login for remote WP-Admin access from the dashboard.
* Removes "heartbeat" terminology from all user-facing labels in favor of "signal".

= 1.6.2 =
* Signal now reports full WP environment: active plugins, theme, available updates, WP/PHP versions.

= 1.5.6 =
* Fixes large Gravity Forms and WPForms backfills timing out by breaking imports into chained batches.
* Continues importing automatically until every historical entry has been replayed.

= 1.5.5 =
* Fixes large Gravity Forms historical imports stalling mid-sync by dispatching backfill ingestion asynchronously.
* Prevents partial backfills that left big forms stuck below the WordPress entry count.

= 1.5.4 =
* Removes 500-entry backfill cap — now paginates through ALL Gravity Forms and WPForms entries.
* Fixes count mismatches for forms with more than 500 historical entries.

= 1.4.2 =
* Fixes click event delivery using fetch with proper headers instead of sendBeacon to resolve silent CORS failures on certain hosting environments.

= 1.3.21 =
* Fixes Avada backfill field extraction by parsing payloads across multiple submission columns and formats.
* Improves Avada form discovery fallback (normalized title tokens, serialized markers, slug/blob matching) to reduce strategy:none misses.

= 1.3.13 =
* Adds Avada historical backfill endpoint (/backfill-avada) for reset-and-reimport recovery.
* Reimports Avada submissions with stable avada_db_* IDs after legacy ID deadlocks.

= 1.3.8 =
* Expanded Avada entry discovery with multi-column form-ref matching (form_id, fusion_form_id, post_id, parent_id).
* Searches blob/payload columns (submission, data, fields, form_data) for form_id and URL markers.
* Per-form Avada diagnostics (strategy used, row count) returned in sync response.
* Plugin runtime version included in sync payload for accurate update gating.
* Warnings and avada_diagnostics surfaced through to dashboard UI.

= 1.3.7 =
* CRITICAL: Removed global Avada fallback that caused mass-trashing of all entries.
* Each Avada form now only returns entries scoped to its own form_id.
* Backend sync guards detect duplicate active-ID sets and full-trash patterns.
* Prevents accidental data loss when Avada entry discovery fails.

= 1.3.6 =
* Hardened Avada entry discovery with multi-table lookup.
* Added safety guard for all-empty Avada form payloads.

= 1.3.5 =
* Fixed Avada entry reconciliation when form IDs differ across installs.
* Improved active-entry lookup with URL and global table fallback.
* Fixes deleted Avada submissions still appearing after Sync Entries.

= 1.3.4 =
* Avada/Fusion Forms now included in form discovery and entry sync.
* Avada entries use stable DB-backed IDs for reliable delete reconciliation.
* All form providers included in discover_forms_list fallback.

= 1.3.3 =
* Fix Avada handler method structure so the plugin loads correctly and sync routes register.
* Restores manual sync route availability for entry reconciliation.

= 1.3.2 =
* Fix manual sync route handling for WordPress REST sync endpoint.
* Improve compatibility with sites using non-default permalink structures.

= 1.0.0 =
* Initial release
