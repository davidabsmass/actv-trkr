# Add "ACTV TRKR Support" Role + Export Audit Logging

Additive enhancement. Admin and Manager behavior is preserved exactly. New role `actv_support` is a Manager-clone with hard-blocked access to Settings (Plugin/API Keys/Form Import), Team Management, and Billing. All exports get a confirmation modal and are written to a new audit log.

## 1. Database changes (migration)

### 1a. New role value
`org_users.role` is a free-form `text` column (not the `app_role` enum) with no CHECK constraint, so no enum work is needed. Allowed values become: `admin`, `manager`, `actv_support`.

### 1b. New helper functions (SECURITY DEFINER, search_path=public)
- `is_org_actv_support(_user_id uuid, _org_id uuid) returns boolean` — true when the row's role is `actv_support`.
- `is_org_member_or_support(_org_id uuid) returns boolean` — convenience wrapper used by code paths that already call `is_org_member`. Returns true for any `org_users` row regardless of role (admin/manager/actv_support all count).

No existing RLS policies change. They already key off `is_org_member(org_id)`, which is membership-based and will naturally include `actv_support` rows. Front-end gating is what restricts what `actv_support` can *see/use*.

### 1c. Trigger update — `org_users_first_member_owner`
Currently forces `role := 'admin'` when first member. Update so it only does this if the inserted role is not `actv_support` — prevents a misconfigured invite from accidentally making a support user the org owner. (Defensive; first-member is realistically always the signup owner.)

### 1d. Trigger update — `org_users_protect_owner_and_last_admin`
No change required. Owner protection and "last admin" guard already prevent demoting/removing the owner. `actv_support` invitees can be added/removed freely.

### 1e. New table — `export_audit_log`
```text
id              uuid pk default gen_random_uuid()
org_id          uuid not null references orgs(id) on delete cascade
site_id         uuid null references sites(id) on delete set null
user_id         uuid not null references auth.users(id) on delete set null
role_at_export  text not null      -- 'admin' | 'manager' | 'actv_support' | 'platform_admin'
export_type     text not null      -- e.g. 'leads_csv', 'forms_xlsx', 'archive_csv', 'sessions_pdf'
export_scope    text null          -- e.g. 'all_time', '2026-01-01..2026-01-31', 'form:<id>'
export_job_id   uuid null references export_jobs(id) on delete set null
metadata        jsonb not null default '{}'::jsonb
created_at      timestamptz not null default now()
```
Indexes: `(org_id, created_at desc)`, `(user_id, created_at desc)`.

RLS:
- Enabled.
- INSERT: any authenticated org member (`is_org_member(org_id)`) where `user_id = auth.uid()`. Edge function uses service role and bypasses RLS.
- SELECT: org admins only — `is_org_admin(auth.uid(), org_id)` OR platform admin (`has_role(auth.uid(),'admin')`).
- No UPDATE / DELETE policies (immutable audit trail).

### 1f. Optional support-access metadata columns on `org_users`
Add nullable, non-breaking columns (used only when role = `actv_support`):
- `access_expires_at timestamptz null`
- `access_granted_by uuid null references auth.users(id) on delete set null`
- `access_granted_at timestamptz null`

These are informational only this round — no trigger auto-removes the user when expired (so existing flows keep working). UI shows the expiration; a follow-up can wire enforcement.

### 1g. Deprecate the old "dashboard access grant" toggle
The current `SupportAccessCard` consent toggle creates rows in `dashboard_access_grants` but **no RLS policy actually enforces it** (verified — zero policies reference `has_active_dashboard_grant`). It's effectively a consent-log UI. Plan:
- Keep the table + audit log for historical data — no destructive migration.
- Replace the `SupportAccessCard` UI in `src/pages/Account.tsx` with a new "ACTV TRKR Support members" panel (see §3) that shows current `actv_support` org members (with expiration if set) and lets an admin remove them.
- Hide the toggle. Existing active grants remain visible for 30 days as read-only history, then the card can be deleted in a later release.

## 2. Front-end role model

### 2a. Update `src/hooks/use-user-role.ts`
Extend `useOrgRole(orgId)` return shape:
```ts
return {
  orgRole,                              // 'admin' | 'manager' | 'actv_support' | null
  isOrgAdmin: orgRole === 'admin',
  isOrgManager: orgRole === 'manager',
  isActvSupport: orgRole === 'actv_support',
  // capability helpers (single source of truth)
  canManageSettings: orgRole === 'admin',          // Plugin / API Keys / Form Import
  canManageTeam:     orgRole === 'admin',
  canManageBilling:  orgRole === 'admin',
  canEditGoals:      orgRole === 'admin' || orgRole === 'manager' || orgRole === 'actv_support',
  canExport:         orgRole === 'admin' || orgRole === 'manager' || orgRole === 'actv_support',
  canViewDashboard:  !!orgRole,
  loading,
};
```
All gating across the app should switch to these capability flags. Non-admin gates that exist today already use `isOrgAdmin` for Settings/Team/Billing — they will automatically also block `actv_support` (they are non-admin). No silent permission widening.

### 2b. Audit existing gates (no behavior change for admin/manager)
Files that currently gate on `isOrgAdmin` and must stay admin-only — confirmed:
- `src/components/account/TeamSection.tsx` (team mgmt)
- Settings → Plugin, API Keys, Form Import panels (already admin-only via `Settings.tsx` tabs)
- Billing pages

Add a top-level guard component `<RequireOrgAdmin>` that redirects `actv_support` to `/dashboard` with a toast if they hit an admin-only route directly via URL.

## 3. Team management UI (`src/components/account/TeamSection.tsx`)

Additive changes only:
- `ROLE_LABEL` map gains: `actv_support: "ACTV TRKR Support"`.
- Both `<Select>` invite/edit dropdowns gain a third option: `"ACTV TRKR Support"`.
- Member rows showing `actv_support` get a distinct visual: blue/indigo `Badge` with shield icon and tooltip "Internal ACTV TRKR support — read-only access to dashboards, reports, and exports. No settings, team, or billing access."
- The `adminCount` / last-admin guard logic is unchanged (`actv_support` are never counted as admins, so they never trigger last-admin protection).
- Invite default stays `manager`. Choosing `actv_support` shows an inline note and (if the new columns are added) a "Default expiration" select (24h / 7 days / 30 days / never). Selected value is sent in the invite payload.

## 4. Invite flow

`supabase/functions/invite-user/index.ts` (or whichever function handles invites — confirmed by `TeamSection`'s call signature `{ email, orgId, role }`):
- Accept `role: 'admin' | 'manager' | 'actv_support'` and optional `access_expires_at`, write through to `org_users`.
- Set `access_granted_by = auth.uid()` and `access_granted_at = now()` when role is `actv_support`.
- Existing audit-log insert (`previous_role` / `new_role`) handles the rest.

## 5. Export confirmation modal + audit logging

### 5a. Shared confirmation component
New `src/components/exports/ExportConfirmDialog.tsx`:
- Props: `open`, `onCancel`, `onConfirm`, optional `description` override.
- Title: "Export client data?"
- Body: "This export may contain client or lead data. The action will be logged."
- Buttons: Cancel / Continue Export.
- Built on existing `AlertDialog` for visual consistency.

### 5b. Wire into every export trigger
Confirmed call sites (4):
1. `src/pages/Exports.tsx` (line 97)
2. `src/pages/Forms.tsx` (lines 530 and 1610 — single-form export dropdown)
3. `src/pages/Entries.tsx` (line 419)
4. `src/components/archives/ArchivesContent.tsx` (line 118)

Refactor each to: open confirm dialog → on Continue, perform existing invoke. No change to the export logic itself.

### 5c. Server-side audit insert
Two equally good options. Plan goes with **client-side insert immediately after a successful `functions.invoke()`** (simpler, no edge function changes, RLS already permits it):

```ts
await supabase.from('export_audit_log').insert({
  org_id, site_id: site_id ?? null,
  user_id: user.id,
  role_at_export: orgRole ?? (isAdmin ? 'platform_admin' : 'unknown'),
  export_type, export_scope,
  export_job_id: createdJob?.id ?? null,
  metadata: { source: '<page>' },
});
```

Wrapped in a small helper `logExportAudit(...)` in `src/lib/export-audit.ts` so all four call sites stay tidy. Errors are swallowed (logged to console) — never block the export.

For completeness: also add the same insert at the end of `supabase/functions/process-export/index.ts` and `process-archive-export/index.ts` using the service role, **only if** the row hasn't already been inserted (dedupe by `export_job_id` unique partial index where `export_job_id is not null`). This guarantees logging even if the client tab closes mid-flight.

### 5d. Audit log viewer (admin-only)
New section in Settings → Team (or a small "Export activity" card under the existing Audit log) listing the most recent 50 entries: when, who (display name), role badge, type, scope. Read uses RLS — only org admins see anything.

## 6. Capability matrix (final)

```text
Capability                          | Admin | Manager | ACTV TRKR Support
------------------------------------|-------|---------|-------------------
View Dashboard / Analytics / Leads  |  yes  |   yes   |       yes
View Forms / Sites / SEO / AI       |  yes  |   yes   |       yes
View Reports / Monitoring           |  yes  |   yes   |       yes
Create / edit Goals (Key Actions)   |  yes  |   yes   |       yes
Export data + reports (w/ confirm)  |  yes  |   yes   |       yes (logged)
Settings → Plugin / Install         |  yes  |   no    |       no
Settings → API Keys                 |  yes  |   no    |       no
Settings → Form Import              |  yes  |   no    |       no
Team management                     |  yes  |   no    |       no
Billing / subscription              |  yes  |   no    |       no
Owner-only controls                 | owner |   no    |       no
Delete orgs / sites / users         |  yes  |   no    |       no
```

## 7. Files to create / edit

Create:
- `supabase/migrations/<ts>_actv_support_role.sql` (everything in §1)
- `src/components/exports/ExportConfirmDialog.tsx`
- `src/lib/export-audit.ts`
- `src/components/account/ExportActivityLog.tsx` (admin-only viewer)

Edit:
- `src/hooks/use-user-role.ts` — add capability helpers
- `src/components/account/TeamSection.tsx` — new role label, dropdown option, badge styling, optional expiration field
- `src/pages/Exports.tsx`, `src/pages/Forms.tsx`, `src/pages/Entries.tsx`, `src/components/archives/ArchivesContent.tsx` — wrap export triggers in confirm dialog + audit log call
- `supabase/functions/invite-user/index.ts` (or equivalent) — accept `actv_support` role + expiration fields
- `src/pages/Account.tsx` — replace deprecated `SupportAccessCard` toggle with the new ACTV TRKR Support members panel (read-only list of current support members for the org)

Memory updates after build:
- Update `mem://features/team-rbac` to add `actv_support` role.
- Add `mem://features/export-audit-log` describing the new table and confirmation flow.

## 8. Verification checklist

- Existing admin keeps every capability (smoke test Settings → Plugin, API Keys, Form Import, Team, Billing).
- Existing manager keeps every capability (smoke test Goals/Key Actions edit, dashboard, exports — exports now show confirm modal).
- New `actv_support` user can: open dashboards, edit Key Actions, run an export (sees modal, audit row written).
- New `actv_support` user **cannot**: open Plugin/API Keys/Form Import tabs, see Team management actions, see Billing. Direct URL navigation redirects with a toast.
- Owner protection + last-admin trigger still fire (try to demote sole admin → blocked).
- `export_audit_log` rows are insertable by the exporting user, readable only by org admins (verified via two test sessions).
- Existing dashboard_access_grants data remains queryable; old `SupportAccessCard` toggle is hidden.
