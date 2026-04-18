# ACTV TRKR Plugin — Crash Containment & Recovery Layer

**Status:** Architecture proposal (no code yet) — pending review
**Target plugin version:** 1.10.0
**Decisions locked:**
- Architecture-first; code in approved chunks
- Balanced auto-reduced-mode triggers
- Full Module class refactor (every feature implements a `Module` interface)
- Emergency recovery via WP-CLI only (no token-gated public URL)

---

## 1. Architecture Summary

The current plugin boots every subsystem (`MM_Tracker`, `MM_Forms`, `MM_Heartbeat`, `MM_Broken_Links`, `MM_SEO_Fixes`, `Mission_Metrics_Security`, `MM_Magic_Login`, `MM_Import_Engine`, `MM_Consent_Banner`, `MM_Privacy_Setup`, `MM_Recovery_Banner`) unconditionally on every request. A fatal in any one of them takes the whole site down.

The hardening layer introduces **four boundaries**:

| Boundary | Purpose |
|---|---|
| **Bootstrap gate** | Decide whether *any* feature code runs this request |
| **Module registry** | Each feature is a `Module`; failures are caught, recorded, isolated |
| **State machine** | Plugin state: `healthy → degraded → reduced_mode → migration_locked` |
| **Circuit breakers** | Per-feature kill-switches for cron, remote calls, scans, AI |

Everything else (logger, recovery UI, migrations, WP-CLI) hangs off these four.

**Design principles**
- **Frontend tracking must keep working** even in `reduced_mode` (it's the product). Only admin/cron/scan/sync code degrades.
- **Failures are local** — one module's exception cannot prevent another from loading.
- **Self-healing** — boot failure counters auto-reset after a successful boot; reduced mode auto-exits after N healthy boots.
- **No silent failures** — every trip surfaces in the recovery surface and (when remote sync is alive) the ACTV TRKR dashboard.

---

## 2. File / Component Structure

```
mission-metrics.php                        # Main file → only delegates to Bootstrap
includes/
  bootstrap/
    class-bootstrap.php                    # Entry point, environment gate, mode resolver
    class-environment.php                  # PHP/WP/extension/DB checks (pure, no side effects)
    class-mode.php                         # Plugin state enum + transitions + persistence
    class-boot-counter.php                 # Consecutive boot failure tracker
  modules/
    interface-module.php                   # Module contract
    abstract-class-module.php              # Base: safe init, health reporting, hook wrapper
    class-module-registry.php              # Register, resolve deps, init in order, isolate failures
    class-module-tracker.php               # Wraps existing MM_Tracker
    class-module-forms.php                 # Wraps existing MM_Forms
    class-module-heartbeat.php             # Wraps existing MM_Heartbeat
    class-module-seo-fixes.php             # Wraps existing MM_SEO_Fixes
    class-module-broken-links.php          # Wraps existing MM_Broken_Links
    class-module-security.php              # Wraps existing Mission_Metrics_Security
    class-module-magic-login.php           # Wraps existing MM_Magic_Login
    class-module-import-engine.php         # Wraps existing MM_Import_Engine
    class-module-consent-banner.php        # Wraps existing MM_Consent_Banner
    class-module-privacy-setup.php         # Wraps existing MM_Privacy_Setup
    class-module-recovery-banner.php       # Wraps existing MM_Recovery_Banner
    class-module-woocommerce.php           # Wraps existing MM_WooCommerce
    class-module-admin.php                 # Wraps existing MM_Settings (heaviest, gated last)
  migrations/
    class-migration-runner.php             # Versioned migration executor + lock
    class-migration-lock.php               # Transient + DB-backed lock (5-min TTL safety)
    versions/
      000-baseline.php                     # Captures current 1.9.18 schema as v1
      001-add-health-tables.php            # Adds wp_mm_health_log, wp_mm_module_state
  reliability/
    class-circuit-breaker.php              # Per-key failure counter + cooldown
    class-safe-invoke.php                  # try/catch wrapper for hook callbacks
    class-resource-guard.php               # Memory/time soft-limits for cron jobs
  observability/
    class-logger.php                       # Structured logger w/ redaction + degradable backends
    class-redactor.php                     # Pattern-based secret stripping
    class-diagnostics.php                  # Bundle export (JSON)
  recovery/
    class-cli.php                          # WP-CLI command registration
    class-cli-commands.php                 # safe-mode / disable-module / status / diagnostics / migrate
    class-admin-recovery.php               # Plain-PHP admin page (no React, no JS dependencies)
    class-admin-notices.php                # Persistent notice manager
```

The 8 existing `class-*.php` feature files stay where they are. Each gets a thin `class-module-*.php` wrapper so the legacy code keeps working while gaining isolation.

---

## 3. Data / State Model

### Options (autoloaded — small)
| Key | Shape | Purpose |
|---|---|---|
| `actv_trkr_state` | `'healthy'│'degraded'│'reduced_mode'│'migration_locked'` | Top-level plugin mode |
| `actv_trkr_boot_counter` | `{ consecutive_failures, last_failure_at, last_success_at }` | Bootstrap fail tracking |
| `actv_trkr_schema_version` | int | Last applied migration |
| `actv_trkr_plugin_version` | string | Last booted version |

### Options (NOT autoloaded — larger)
| Key | Shape | Purpose |
|---|---|---|
| `actv_trkr_module_state` | `{ [module_key]: { enabled, healthy, version, failure_count, last_error, last_init_at } }` | Per-module health |
| `actv_trkr_breakers` | `{ [breaker_key]: { tripped, trip_count, opened_at, cooldown_until, reason } }` | Circuit breaker state |
| `actv_trkr_migration_status` | `{ running, started_at, finished_at, version_from, version_to, error }` | Migration tracking |

### Custom table: `wp_mm_health_log`
Append-only ring buffer (capped at ~500 rows; older rows pruned weekly).
```
id BIGINT AUTO_INC PK
ts DATETIME
level VARCHAR(10)        -- info│warn│error│fatal
module VARCHAR(60)
event VARCHAR(80)        -- 'boot_fail', 'breaker_tripped', 'migration_failed', etc.
fingerprint CHAR(16)     -- MD5(module|event|first_line_of_message)[:16] for dedup
context_json LONGTEXT    -- redacted
```

### Why this storage mix
- **Autoloaded options** for hot-path values read on every request (`state`, `boot_counter`).
- **Non-autoloaded options** for state read only during admin/cron.
- **Custom table** for the log — options would bloat `wp_options` and trigger autoload bugs on shared hosting; transients get evicted.

### wp-config emergency constants
```php
define( 'ACTV_TRKR_FORCE_SAFE_MODE', true );      // Force reduced_mode regardless of state
define( 'ACTV_TRKR_DISABLE_REMOTE_SYNC', true );  // Skip all wp_remote_* calls
define( 'ACTV_TRKR_DISABLE_CRON', true );         // Unschedule + ignore all mm_* cron events
define( 'ACTV_TRKR_DISABLE_MODULES', 'seo_fixes,broken_links' );  // Comma list
```

---

## 4. Bootstrap Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ mission-metrics.php (≈20 lines)                                  │
│   require Bootstrap; Bootstrap::run( __FILE__ );                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ 1. Environment::check()       │  PHP ≥ 7.4, WP ≥ 6.0, mysqli, json, curl
              └──────────────┬───────────────┘
                  fail │     │ ok
                       ▼     ▼
              ┌──────────────────────────────┐
              │ 2. BootCounter::is_loop?     │  ≥3 consecutive failures in 5 min?
              └──────────────┬───────────────┘
                  yes │      │ no
                      ▼      ▼
              ┌──────────────────────────────┐
              │ 3. Mode::resolve()            │  Reads constants + persisted state
              └──────────────┬───────────────┘
                             │
              ┌──────────────┼──────────────┬─────────────────────┐
              ▼              ▼              ▼                     ▼
         migration_      reduced_       degraded               healthy
         locked          mode
              │              │              │                     │
         block all       load only      load all but skip      load all
         features        tracker +      breaker-tripped        modules
         except CLI +    consent +      modules
         recovery        recovery
              │              │              │                     │
              └──────────────┴──────┬───────┴─────────────────────┘
                                    ▼
              ┌──────────────────────────────┐
              │ 4. MigrationRunner::ensure() │  Run pending migrations under lock
              └──────────────┬───────────────┘
                             ▼
              ┌──────────────────────────────┐
              │ 5. Registry::boot( $mode )    │  For each module:
              │                                │   - check enabled + healthy + breaker
              │                                │   - try { ::init() } catch { mark unhealthy }
              │                                │   - record success/failure
              └──────────────┬───────────────┘
                             ▼
              ┌──────────────────────────────┐
              │ 6. BootCounter::record_ok()  │  Reset failure counter on full success
              └──────────────────────────────┘
```

**Key invariant:** `Bootstrap::run` is wrapped in a single top-level `try / catch ( \Throwable )`. Any escape becomes a `boot_fail` log entry; nothing reaches WordPress as a fatal.

---

## 5. Reduced Mode Logic

### Triggers (auto-entry — Balanced profile)
- 3 consecutive bootstrap failures within 5 minutes → `reduced_mode`
- Any module init throws `\Throwable` → that module unhealthy; if the module is in the **critical set** (`tracker`, `forms`), → `reduced_mode`
- Migration failure → `migration_locked`
- 3 consecutive cron job fatals on same hook → that cron's circuit breaker trips (does NOT escalate to reduced_mode by itself)

### What loads in each mode
| Module | healthy | degraded | reduced_mode | migration_locked |
|---|:-:|:-:|:-:|:-:|
| Tracker (frontend JS) | ✅ | ✅ | ✅ | ❌ |
| Consent Banner | ✅ | ✅ | ✅ | ❌ |
| Forms | ✅ | ✅ | ✅ | ❌ |
| Heartbeat | ✅ | ✅ | ❌ | ❌ |
| Recovery banner | ✅ | ✅ | ✅ | ✅ |
| Settings page | ✅ | ✅ | recovery-only | recovery-only |
| Broken Links scan | ✅ | ❌ | ❌ | ❌ |
| SEO Fixes | ✅ | ❌ | ❌ | ❌ |
| Security monitor | ✅ | ✅ | ❌ | ❌ |
| Magic Login | ✅ | ✅ | ✅ | ✅ |
| Import Engine | ✅ | ❌ | ❌ | ❌ |
| WooCommerce | ✅ | ✅ | ❌ | ❌ |

### Auto-exit
- After 5 successful full boots in `reduced_mode`, → `degraded`
- After 10 successful full boots in `degraded` with no module failures, → `healthy`
- `migration_locked` only exits via successful migration replay or WP-CLI override

---

## 6. Migration Safety Logic

### Migration contract
Each file in `migrations/versions/NNN-name.php` returns an object:
```php
return new class {
    public int $version = 1;
    public string $name = 'add health tables';
    public bool $destructive = false;   // gate for explicit ack
    public function up( wpdb $db ): void { ... }   // idempotent
    public function check( wpdb $db ): bool { ... } // post-condition assertion
};
```

### Runner flow
```
ensure_pending() →
  acquire_lock(ttl=5min) →
    for each version > schema_version:
      mark migration_status.running
      try: $migration->up($wpdb)
      assert: $migration->check($wpdb)
      bump schema_version atomically
    catch \Throwable:
      mark migration_status.error
      Mode::set('migration_locked')
      log fatal + admin notice
      break
  release_lock()
```

### Safety rules
- Lock prevents two concurrent runs (autoload cron + admin visit race)
- `check()` runs after `up()` — if the schema didn't actually land (e.g., dbDelta swallowed an error), we treat it as a failure
- `destructive=true` migrations require `actv_trkr migrate --confirm-destructive` via CLI; never auto-run
- A new plugin version with no new migration files is fine; only file presence triggers a run

### Recovery
- Admin notice: "ACTV TRKR is in migration-locked mode. Run `wp actv-trkr migrate --retry` or contact support with diagnostic bundle."
- WP-CLI `wp actv-trkr migrate --skip-version=2 --confirm` for emergency unblock

---

## 7. Circuit Breaker Logic

### Per-breaker config
```php
[
  'remote_sync'    => [ 'threshold' => 5,  'window' => 600, 'cooldown' => 1800 ],
  'cron_seo_fix'   => [ 'threshold' => 3,  'window' => 900, 'cooldown' => 3600 ],
  'cron_links'     => [ 'threshold' => 3,  'window' => 900, 'cooldown' => 3600 ],
  'cron_heartbeat' => [ 'threshold' => 10, 'window' => 600, 'cooldown' => 600  ],
  'webhook_in'     => [ 'threshold' => 20, 'window' => 300, 'cooldown' => 600  ],
  'ai_request'     => [ 'threshold' => 5,  'window' => 600, 'cooldown' => 1800 ],
]
```

### API
```php
CircuitBreaker::guard( 'remote_sync', function() {
  return wp_remote_post( $url, $args );
}, $fallback = null );
```
- Increments failure count on `WP_Error` or HTTP ≥ 500
- Trips when threshold hit within window → returns `$fallback` immediately for `cooldown` seconds
- Records trip in health log + triggers admin notice
- Resource guard: each guarded call wrapped with `set_time_limit(30)` + memory snapshot; exceeding 80% of `WP_MEMORY_LIMIT` trips the breaker

### Manual control
- WP-CLI: `wp actv-trkr breaker reset remote_sync`
- WP-CLI: `wp actv-trkr breaker list`

### What gets wrapped (existing code)
- `MM_Tracker` ingest endpoints → `webhook_in`
- `MM_Heartbeat::send()` → `cron_heartbeat`
- `MM_SEO_Fixes::poll_fixes()` → `cron_seo_fix`
- `MM_Broken_Links` scan → `cron_links`
- `MM_Settings::ajax_test_connection` and any `wp_remote_*` to ACTV TRKR → `remote_sync`
- `MM_Retry_Queue::process()` → already retries internally; gets a soft `remote_sync` guard

---

## 8. Admin Recovery UI Spec (plain PHP, no React)

**Location:** Tools → ACTV TRKR Recovery (separate from Settings → ACTV TRKR)
**Capability:** `manage_options`
**Survives:** main admin app failure, missing JS, missing assets — single PHP file, no enqueues beyond inline CSS

### Layout
```
┌──────────────────────────────────────────────────────────────┐
│ ACTV TRKR Recovery                                v1.10.0    │
├──────────────────────────────────────────────────────────────┤
│ Status                                                        │
│   ┌──────────────────────────────────────────────────────┐  │
│   │  ● HEALTHY / DEGRADED / REDUCED MODE / MIGRATION ... │  │
│   │  Last successful boot: 2 minutes ago                  │  │
│   │  Schema version: 2 (current)                          │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                               │
│ Modules                                                       │
│   tracker          ● healthy    init: 12ms                   │
│   forms            ● healthy    init: 8ms                    │
│   seo_fixes        ✕ unhealthy  3 failures   [Retry] [Off]   │
│   broken_links     ⊘ disabled                  [Enable]      │
│   ...                                                         │
│                                                               │
│ Circuit Breakers                                              │
│   remote_sync      ● closed                                   │
│   cron_seo_fix     ⚡ open (cooldown 23m)        [Reset]      │
│                                                               │
│ Recent Incidents (last 20)                                    │
│   2026-04-18 14:02  error  seo_fixes  init exception …       │
│   ...                                                         │
│                                                               │
│ Actions                                                       │
│   [ Re-run startup checks ]                                   │
│   [ Clear reduced mode ]                                      │
│   [ Retry migrations ]                                        │
│   [ Download diagnostic bundle (.json) ]                      │
└──────────────────────────────────────────────────────────────┘
```

All actions are POST-form-based with nonces. No AJAX. No bundle dependency.

### WP-CLI (primary emergency surface)
```
wp actv-trkr status                      # state + module table
wp actv-trkr safe-mode on|off            # force reduced_mode
wp actv-trkr module list
wp actv-trkr module disable <key>
wp actv-trkr module enable <key>
wp actv-trkr module retry <key>
wp actv-trkr breaker list
wp actv-trkr breaker reset <key>
wp actv-trkr migrate                     # run pending
wp actv-trkr migrate --retry             # retry failed
wp actv-trkr diagnostics > bundle.json   # full export
wp actv-trkr log tail --lines=50
```

### Diagnostic bundle (JSON)
```
{
  "plugin": { "version": "1.10.0", "schema_version": 2 },
  "environment": { "php": "8.1.27", "wp": "6.5.2", "mysql": "8.0", "memory_limit": "256M" },
  "state": { "mode": "degraded", "since": "2026-04-18T13:50:00Z" },
  "modules": [ ... ],
  "breakers": [ ... ],
  "migrations": { ... },
  "recent_log": [ ... last 100 entries ... ],
  "constants": { "ACTV_TRKR_FORCE_SAFE_MODE": false, ... },
  "redactions_applied": ["api_key", "ingest_token", "passwords"]
}
```

---

## 9. Testing Plan

| # | Scenario | How to simulate | Expected |
|---|---|---|---|
| 1 | Unsupported PHP | `define('ACTV_TRKR_TEST_PHP', '7.2');` shim | Plugin doesn't load features; admin notice; site unaffected |
| 2 | Failed activation preflight | Drop `wpdb->prefix` write permission | Activation aborts cleanly; no half-state |
| 3 | Module init fatal | Throw in `MM_SEO_Fixes::init()` via filter | seo_fixes marked unhealthy; other modules load; notice shown |
| 4 | Migration failure | Migration v2 throws | `migration_locked`; tracker still works; CLI can recover |
| 5 | Broken remote response | Mock `wp_remote_post` to return WP_Error 5x | `remote_sync` breaker trips; site unaffected |
| 6 | Cron fatal loop | Throw in `mm_seo_fix_cron` 3x | `cron_seo_fix` breaker open; cron unscheduled until cooldown |
| 7 | Admin app JS broken | Rename React bundle | Recovery page renders; standard admin still navigable |
| 8 | Reduced mode entry/exit | 3 consecutive boot fails | Enters reduced_mode; after 5 clean boots → degraded |
| 9 | Manual safe mode | `define('ACTV_TRKR_FORCE_SAFE_MODE', true);` | Forces reduced_mode regardless of counter |
| 10 | Log redaction | Log entry containing api_key value | Stored entry shows `api_key: [REDACTED]` |
| 11 | Concurrent migration | Two requests trigger migration simultaneously | One acquires lock; other no-ops cleanly |
| 12 | Memory guard | Cron job allocates 90% of limit | Resource guard trips breaker mid-execution |

Each test = one PHPUnit case in `tests/` (we don't have a test runner yet — adding minimal WP-Mock setup is part of Phase 1).

---

## 10. Phased Implementation Checklist

Implementation is split into 4 PRs to keep diffs reviewable. Each PR is independently shippable and backward-compatible.

### **PR 1 — Foundation (Bootstrap + Module Registry + Logger)** ≈ v1.10.0-alpha
- [ ] `class-bootstrap.php`, `class-environment.php`, `class-mode.php`, `class-boot-counter.php`
- [ ] `interface-module.php`, `abstract-class-module.php`, `class-module-registry.php`
- [ ] `class-logger.php`, `class-redactor.php`
- [ ] Migration v001 (creates `wp_mm_health_log`, `actv_trkr_module_state`)
- [ ] Refactor `mission-metrics.php` to delegate to Bootstrap (legacy modules still load via shim — no behavior change)
- [ ] Wp-config constants honored
- **Risk:** Medium — main file rewrite. Mitigated by shim keeping old `MM_*::init()` calls intact.

### **PR 2 — Module wrappers + Reduced Mode**
- [ ] One `class-module-*.php` per existing class (12 modules)
- [ ] Mode transitions wired (auto-entry, auto-exit)
- [ ] Mode-aware module loading table from §5
- [ ] Admin notice manager
- **Risk:** Low — wrappers, no logic changes inside legacy classes.

### **PR 3 — Migration framework + Circuit breakers + Resource guard**
- [ ] `class-migration-runner.php`, `class-migration-lock.php`
- [ ] Convert existing schema (`mm_retry_queue`) into baseline migration v000
- [ ] `class-circuit-breaker.php`, `class-safe-invoke.php`, `class-resource-guard.php`
- [ ] Wrap the 5 critical call sites listed in §7
- **Risk:** Medium — touches retry queue and remote calls. Feature-flagged via option for first release.

### **PR 4 — Recovery surfaces (CLI + Admin page + Diagnostics)**
- [ ] `class-cli.php`, `class-cli-commands.php` (10 commands)
- [ ] `class-admin-recovery.php` (Tools menu, plain PHP)
- [ ] `class-diagnostics.php` (JSON export)
- [ ] Pruner cron for `wp_mm_health_log` (weekly, capped at 500 rows)
- [ ] Documentation in `readme.txt`
- **Risk:** Low — pure addition, no existing code touched.

### Backward compatibility
- All existing `MM_*` classes keep their public API.
- `MM_PLUGIN_VERSION`, `MM_PLUGIN_DIR`, `MM_PLUGIN_URL` constants preserved.
- Existing options (`mm_options`, `mm_ingest_token`, etc.) untouched.
- Existing cron hooks (`mm_retry_cron`, `mm_form_probe_cron`, `mm_seo_fix_cron`) keep their names.

### Version policy
- Ship PRs 1+2 together as **v1.10.0** (foundation, no user-visible features).
- PR 3 → **v1.10.1** (under feature flag, default off for one release cycle).
- PR 4 → **v1.10.2** (recovery surfaces).
- Plugin version bumps follow `mem://constraints/plugin-version-sync`: every bump runs `scripts/plugin-artifacts.mjs`.

---

## Open questions for you before I start coding

1. **Critical module set for reduced-mode escalation** — `tracker` + `forms` are listed. Add `consent_banner`? (Failing consent banner in EU = compliance risk → maybe yes)
2. **`wp_mm_health_log` retention** — 500 rows cap + weekly prune is conservative. Bump to 2000 if you want longer support windows.
3. **Remote sync of health events** — when `remote_sync` breaker is closed, should we POST `health_log` rows to the ACTV TRKR backend (new `/ingest-plugin-health` endpoint) so the dashboard shows site health centrally? Useful but adds an edge function to scope.
4. **Activation preflight strictness** — if `wp_options` write fails during activation, hard-abort or activate in `reduced_mode`? Hard-abort is safer; reduced_mode is more forgiving.

Once you answer these (or say "your call"), I'll start PR 1.
