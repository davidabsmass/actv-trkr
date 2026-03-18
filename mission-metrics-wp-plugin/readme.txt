=== ACTV TRKR ===
Contributors: absolutelymassive
Tags: analytics, tracking, gravity forms, leads, pageviews
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.3.20
License: GPL-2.0-or-later

First-party pageview tracking and Gravity Forms lead ingestion for ACTV TRKR.
...
== Changelog ==

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
