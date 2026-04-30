## Problem

The Gravity form **"Find a Licensed Provider Near You"** (apyxmedical.com) shows **Disabled** in the dashboard, but is **Active** in WordPress.

Database confirms both rows are stale:
- `forms.is_active = false`
- `form_integrations.is_active = false`

The WP plugin (`MM_Adapter_Gravity::discover_forms`) correctly reports `is_active`, but the dashboard's `is_active` value is only refreshed when a discovery scan runs. If a form was inactive at the time of its first/last scan and later re-activated in WP, the dashboard never flips the flag back until another full discovery is triggered. Today there's no easy way for an admin to force one for a single form, and the 15‑min reconciler cron only updates **counters**, not `is_active`.

## Fix (3 parts)

### 1. Immediate heal (data fix)
One-time SQL update flipping the affected rows:
```sql
UPDATE forms SET is_active = true
  WHERE id = '0ec8596f-de99-4db6-adc7-81a6fa5aef11';
UPDATE form_integrations SET is_active = true
  WHERE form_id = '0ec8596f-de99-4db6-adc7-81a6fa5aef11';
```
This unblocks the user immediately for this specific form.

### 2. Make the reconciler cron also refresh `is_active`
Update `supabase/functions/reconcile-forms-cron/index.ts` so that, for every site whose plugin namespace probes OK, it calls `manage-import-job?action=discover` (it currently only triggers `/sync` for entry counts). Discovery already updates `is_active` in both `forms` and `form_integrations`. Net effect: any toggle in WP converges to the dashboard within ~15 min, automatically, with no user action.

Cost is small — discovery is one HTTP call per site per 15 min and it's idempotent.

### 3. Add a "Re-sync forms" button on the Forms page
For users who don't want to wait 15 min. Surface a small action in the Forms page header (or per-form row menu) that POSTs to `manage-import-job?action=discover&site_id=…`. On success, invalidate the forms query so the table refreshes.

This also doubles as the "iron-clad" recovery the user has been asking for — any future drift between WP and dashboard is one click away from being healed.

## Files touched

- New SQL migration — heal the two stale rows.
- `supabase/functions/reconcile-forms-cron/index.ts` — call `discover` per site after the namespace probe.
- `src/pages/Forms.tsx` (or the equivalent forms list component) — add a "Re-sync forms" button wired to `manage-import-job` discover.
- Update `mem://features/forms/reconciler-cron` to document that the cron now also refreshes `is_active`.

## Notes

- No plugin update required. v1.21.3 already reports `is_active` correctly.
- No schema changes.
- No behavior change for active forms with correct flags — purely additive.