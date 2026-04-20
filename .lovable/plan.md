
The user approved the previous plan and added one requirement: **the active/inactive scan must also run during initial plugin connection**, not just on manual re-scan or hourly watchdog.

Looking at where initial discovery happens:
- When a site first connects, the plugin reports in via heartbeat/sync
- `manage-import-job` `handleDiscover` is called either manually from the dashboard or programmatically
- For first-time setup, the dashboard's auto-discovery flow already calls `discover` once the plugin is detected

So the "first-add" path is already covered by `handleDiscover` — as long as I include the `is_active` reconciliation logic there (which the plan already does), it runs automatically on first plugin connection. I'll just make this explicit in the implementation and verify the auto-discovery trigger fires on initial site registration.

## What I'll build

### 1. Plugin v1.15.0 — report `is_active` per form
Update `class-import-adapters.php` (both plugin mirrors) so each adapter's `discover_forms()` returns an `is_active` boolean:
- **Gravity Forms**: `!is_trash && is_active`
- **WPForms**: `post_status === 'publish'` and not disabled via meta
- **Ninja Forms**: not in trash, status check
- **Fluent / Avada / CF7**: already filter by published status — pass `true` through

Bump plugin to 1.15.0 across all 4 version files via `scripts/plugin-artifacts.mjs`.

### 2. Database migration
Add `is_active boolean not null default true` to `forms` and `form_integrations`. Keep `archived` as a separate user-controlled flag.

### 3. Backend reconciliation in `manage-import-job/handleDiscover`
- For every form returned by the plugin → upsert with `is_active` from payload.
- For every form previously known but **missing from the new scan** → set `is_active = false` (treats deletion as inactive).
- Backward compatible: if the plugin is older than 1.15.0 and doesn't send `is_active`, default to `true` (current behavior).

### 4. First-connect auto-trigger
Verify and ensure that when a new site is registered (`trigger-site-sync` / first plugin heartbeat), `handleDiscover` is called once automatically — so the very first scan populates `is_active` correctly.

### 5. Hourly watchdog re-discovery
Extend `form-import-watchdog` to call `discover` once per site per hour so WP toggles propagate within ~1 hour without a manual click.

### 6. UI changes
- **Settings → Discovered Forms**: add three tabs/filters → "Active (4) · Inactive (11) · Archived (0)". Inactive forms get a "Disabled in WordPress" badge.
- **Form Health widget**: filter to `is_active = true AND archived = false`.
- **Forms page + Leaderboard**: exclude inactive from active counts; historical entries remain accessible.
- **`useForms` hook**: surface the new `is_active` field.

## What you'll see

- Re-scan now reconciles inactive/deleted forms, not just additions.
- New plugin installs scan active state on first connection.
- Toggling a form off in WP shows up on the dashboard within ~1 hour automatically (or instantly on manual re-scan).
- Toggling a form back on auto-restores it.
- All historical lead data preserved regardless of active state.

## Files

**Plugin (both mirrors + version sync):**
- `mission-metrics-wp-plugin/includes/class-import-adapters.php`
- `mission-metrics-wp-plugin/includes/class-import-engine.php`
- `supabase/functions/serve-plugin-zip/plugin-template/includes/class-import-adapters.php`
- `supabase/functions/serve-plugin-zip/plugin-template/includes/class-import-engine.php`
- Run `node scripts/plugin-artifacts.mjs` to bump to 1.15.0

**Backend:**
- New migration: `is_active` columns
- `supabase/functions/manage-import-job/index.ts` — reconcile is_active on discover
- `supabase/functions/form-import-watchdog/index.ts` — hourly re-discover per site
- Verify `trigger-site-sync` (or first-heartbeat path) calls discover on first connect

**Frontend:**
- `src/components/settings/FormsSection.tsx` — Active/Inactive/Archived tabs
- `src/components/dashboard/FormHealthPanel.tsx` — filter active
- `src/pages/Forms.tsx` + `src/components/dashboard/FormLeaderboard.tsx` — exclude inactive from counts
- `src/hooks/use-dashboard-data.ts` — surface `is_active`
