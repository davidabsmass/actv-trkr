# ACTV TRKR — Operator Recovery Runbook

> **Audience:** site owners, agencies, and on-call engineers who need to recover the ACTV TRKR WordPress plugin when something goes wrong.
> **Promise:** every escape hatch in this document is **idempotent and safe to run twice**. Nothing here can damage your WordPress install or your tracking data.

---

## TL;DR — "My site is broken, what do I do?"

| Symptom | First thing to try |
|---|---|
| White screen of death after activating/updating | Add `define('ACTV_TRKR_FORCE_SAFE_MODE', true);` to `wp-config.php` |
| Admin works but tracking is offline | Click **Reconnect Now** in the red admin banner, or run `wp actv-trkr status` |
| Plugin update keeps failing | `wp actv-trkr versions` then `wp actv-trkr unblock-version <ver>` |
| Stuck in "migration locked" mode | `wp actv-trkr clear-migration-lock && wp actv-trkr migrate --retry` |
| One feature is dead but others work | `wp actv-trkr module disable <key>` |

If none of those help, jump to [Full Diagnostics](#full-diagnostics) and send the output to support.

---

## 1. Concepts you should know

The plugin runs through a **state machine** with four modes (see `ACTV_Mode`):

| Mode | What loads | Auto-exit |
|---|---|---|
| `healthy` | Everything | n/a |
| `degraded` | Skips heavy modules (broken-link scanner, SEO fixes, import engine) | → `healthy` after 10 clean boots |
| `reduced_mode` | Only tracker + forms + consent banner + magic login + recovery | → `degraded` after 5 clean boots |
| `migration_locked` | Only recovery + magic login (no schema-touching code) | Only via successful migration replay |

Mode transitions are driven by:
- **Boot Counter** — 3 bootstrap failures within 5 minutes trips `reduced_mode`.
- **Circuit Breakers** — per-subsystem (e.g. `remote_sync`, `import_adapter`) trip after repeated failures, cool down automatically.
- **Update Health Gate** — versions that crash on first boot are added to a local block-list, suppressing future offers until manually unblocked.

You almost never need to set the mode by hand — but every transition is observable and reversible.

---

## 2. Emergency override (use this if the admin is unreachable)

If WP Admin won't even load, edit `wp-config.php` (above the `/* That's all, stop editing! */` line) and add:

```php
define( 'ACTV_TRKR_FORCE_SAFE_MODE', true );
```

This forces `reduced_mode` regardless of database state. Only the tracker, forms capture, consent banner, magic login, and recovery code will run. Page loads should return to normal within seconds.

**To exit safe mode:** remove the line, then run `wp actv-trkr reset` to clear the boot counter so the plugin stops thinking it was in a loop.

You can also pre-disable specific modules from `wp-config.php`:

```php
define( 'ACTV_TRKR_DISABLE_MODULES', 'broken_links,seo_fixes,import_engine' );
```

This takes effect on the next request and survives until you remove or change the constant.

---

## 3. WP-CLI commands (the primary recovery interface)

All commands are namespaced under `wp actv-trkr` and registered by `includes/recovery/class-cli.php`. They never throw — failures are returned as structured errors.

Run them from the WordPress install root.

### Status & diagnostics

```bash
# Human-readable summary: mode, boot counter, schema version, breakers, modules
wp actv-trkr status

# Full machine-readable snapshot (good for support tickets)
wp actv-trkr status --format=json

# Tail the recent in-plugin health log (default 50 rows, max 500)
wp actv-trkr log --limit=200
```

### Reset the state machine

```bash
# Clear the "I'm in a boot loop" memory and return to healthy mode.
# Does NOT touch breakers or the migration lock.
wp actv-trkr reset
```

### Migrations (schema)

```bash
# Apply any pending migrations
wp actv-trkr migrate

# Force-exit migration_locked mode and retry
wp actv-trkr migrate --retry

# Force-release a stuck migration lock without running anything
wp actv-trkr clear-migration-lock
```

### Circuit breakers

```bash
# List every breaker, its state, failure count, and last reason
wp actv-trkr breakers list

# Reset a single breaker (e.g. after the upstream issue is fixed)
wp actv-trkr breakers reset remote_sync

# Reset all breakers
wp actv-trkr breakers reset all
```

Common breaker keys: `remote_sync`, `import_adapter`, `health_reporter`, `seo_fixes`, `broken_links`.

### Modules

```bash
# Permanently disable a module until you re-enable it
wp actv-trkr module disable broken_links

# Re-enable a previously disabled module
wp actv-trkr module enable broken_links
```

Module keys mirror the file names under `includes/`: `tracker`, `forms`, `gravity`, `consent_banner`, `recovery_banner`, `magic_login`, `broken_links`, `seo_fixes`, `security`, `woocommerce`, `import_engine`, `health_reporter`, `heartbeat`, `retry_queue`.

### Update health gate

```bash
# Show currently running version, last known-good, and any blocked versions
wp actv-trkr versions

# Remove a version from the local block-list so the updater will offer it again
wp actv-trkr unblock-version 1.16.0
```

A version is blocked automatically when the first few boots after install fail. Unblocking is purely a local action — it does not affect what the update server publishes.

---

## 4. Recipes by symptom

### "Tracking is offline" admin banner

The admin banner (rendered by `MM_Recovery_Banner`) polls `/check-site-status` every 15 minutes. If our server has flagged the domain as stalled, click **Reconnect Now** — that re-fires a heartbeat and refreshes the cached status.

If reconnect fails:

1. Open **Settings → ACTV TRKR → General** and confirm the API key + endpoint are correct.
2. Click **Test Connection** (top of the General tab).
3. From CLI: `wp actv-trkr status` — check whether the `remote_sync` breaker is tripped.
4. If tripped, fix the upstream condition (DNS, firewall, expired key) and run `wp actv-trkr breakers reset remote_sync`.

### Plugin update fails or rolls the site into a loop

1. `wp actv-trkr versions` — see which version was running and whether it's blocked.
2. `wp actv-trkr status` — confirm `boot_counter.consecutive_failures > 0`.
3. If the update is the cause, the update health gate has likely already added the bad version to the block-list. Pin to the known-good version listed under "Last known-good" and wait for the next release.
4. Once the new release ships and you've manually verified it on staging, run `wp actv-trkr unblock-version <ver>` to allow it again.

### "Migration locked" mode

This means a schema migration crashed mid-run. The plugin is intentionally refusing to run any feature code that might touch a half-applied schema.

```bash
wp actv-trkr status                          # confirm mode == migration_locked
wp actv-trkr clear-migration-lock            # release the advisory lock
wp actv-trkr migrate --retry                 # exit the mode + replay pending migrations
wp actv-trkr status                          # should be back to healthy
```

If `migrate` returns an error, capture the message and the relevant `wp actv-trkr log` rows before contacting support.

### One feature is misbehaving but the rest is fine

Disable that single module and continue operating in `degraded` mode:

```bash
wp actv-trkr module disable seo_fixes
```

The decision is persistent across restarts. Re-enable when the upstream cause is resolved.

### You suspect a boot loop but the site renders

```bash
wp actv-trkr status
# Look for: "Boot counter : N consecutive failures"
# If N >= 3 and last fail is recent, the plugin is in reduced_mode.

wp actv-trkr reset                           # clears the counter
wp actv-trkr breakers reset all              # optional: clear stale trips
```

After `reset`, a single successful page load will restore `healthy` mode automatically (via `ACTV_Mode::record_successful_boot`).

---

## 5. Full diagnostics

When you open a support ticket, paste the output of:

```bash
wp actv-trkr status --format=json > actv-status.json
wp actv-trkr versions
wp actv-trkr log --limit=200
```

The JSON snapshot includes: plugin version, current/forced mode, boot counter, last 10 mode transitions, every breaker's state, every module's enabled+health flag, schema version, lock state, and update-health summary. It contains no PII and no API keys.

---

## 6. Where this lives in the code

| Concern | File |
|---|---|
| State machine | `includes/bootstrap/class-mode.php` |
| Boot loop detection | `includes/bootstrap/class-boot-counter.php` |
| Bootstrap entry point | `includes/bootstrap/class-bootstrap.php` |
| Module registry | `includes/modules/class-module-registry.php` |
| Recovery API (used by CLI + future admin UI) | `includes/recovery/class-recovery.php` |
| WP-CLI commands | `includes/recovery/class-cli.php` |
| Admin reconnect banner | `includes/class-recovery-banner.php` |
| Update health gate | `includes/reliability/class-update-health.php` |
| Migration runner & lock | `includes/migrations/` |
| Circuit breaker | `includes/reliability/class-circuit-breaker.php` |
| Health log | `includes/observability/class-logger.php` |

Every recovery action emits a log row tagged with the actor (`wp-cli`, `admin:<login>`, or `unknown`), so any state change is auditable from `wp actv-trkr log`.
