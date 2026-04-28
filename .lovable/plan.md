## Goal

Cleanly separate **ACTV TRKR Contacts** (our own subscribers/prospects we may market to) from **Site Contacts** (customer-owned WordPress leads we must never market to). The existing `leads`, `forms`, `report_schedules`, ingestion, and reporting pipelines stay untouched — Site Contacts are a **read-only view layer over `public.leads`**, not a new ingestion path.

---

## What exists today

- `public.leads` — customer-owned form submissions (org-scoped, RLS-protected). Stays the canonical source.
- `public.subscribers` — Stripe-side subscriber records (admin-only).
- `public.profiles` — ACTV TRKR account users.
- `public.user_notification_preferences` — operational in-app/email toggles.
- `public.report_schedules.recipients` (jsonb) — operational report delivery.
- Signup goes through Stripe Checkout → webhook → org provisioning. No marketing opt-in checkbox anywhere.
- No table for ACTV TRKR marketing contacts, opt-in state, or unsubscribe tracking.

---

## Plan

### 1. Database — one new table + minimal extensions

**New: `public.marketing_contacts`** (ACTV TRKR's own marketing list)

Fields per spec: `id, org_id (nullable), user_id (nullable), email (unique citext), first_name, last_name, company_name, role, source (enum), lifecycle_stage (enum), marketing_consent_status (enum), marketing_consent_source, marketing_consent_text, marketing_consent_timestamp, marketing_consent_url, consent_ip_hash, email_provider (enum), email_provider_contact_id, unsubscribed_at, bounced_at, complained_at, created_at, updated_at`.

Enums: `mc_source`, `mc_lifecycle_stage`, `mc_consent_status`, `mc_email_provider`.

RLS: **admin-only** (`has_role(auth.uid(),'admin')`) for select/insert/update/delete. Service role full access. **Customer orgs cannot read this table.**

Trigger: auto-update `updated_at`.

**New: `public.marketing_contact_events`** (audit log)

`id, contact_id, event_type (opt_in|unsubscribe|export|sync_attempt|suppress|status_change|recipient_added), actor_user_id, metadata jsonb, occurred_at`. Admin-read, service-role-write.

**Extend `public.leads`** (additive only, no logic change):

- `customer_marketing_consent_status text` (default `'unknown'`)
- `customer_marketing_consent_text text`
- `customer_marketing_consent_timestamp timestamptz`
- `customer_marketing_consent_field_name text`
- `tags text[] default '{}'`
- `notes text`

These are populated opportunistically (e.g., if a form field maps to a consent checkbox) but **default to safe `unknown`**. Form parsing logic is NOT modified — see memory `data/form-parsing-stability`.

**Extend `public.profiles`**:

- `marketing_consent_status text default 'unknown'`
- `marketing_consent_timestamp timestamptz`
- `marketing_consent_source text`
- `unsubscribed_at timestamptz`

The profile is the user's own opt-in state; on signup, if checkbox ticked we both update the profile and upsert a `marketing_contacts` row with `lifecycle_stage='subscriber'` and `source='signup'`.

### 2. Signup opt-in checkbox

`src/pages/Auth.tsx` (signup branch) — add an unchecked checkbox below name/password:

> "Send me ACTV TRKR product updates, launch news, and website performance tips. I can unsubscribe at any time."

On signup success, call a new edge function `record-marketing-consent` that:
- Updates `profiles.marketing_consent_*`
- Upserts into `marketing_contacts` (only if checked)
- Logs a `marketing_contact_events` row with `event_type='opt_in'`, source='signup', captures consent text + URL + hashed IP.

If unchecked: no marketing_contacts row is created. Profile gets `not_opted_in`.

Also add the same checkbox at `Onboarding.tsx` final step as a second chance.

### 3. Email Preferences page

New section in `src/pages/Account.tsx` (or new `EmailPreferencesSection.tsx` under `src/components/account/`):

- **Product & account emails** (operational) — render existing `user_notification_preferences` toggles. Critical service notices marked non-disablable (visual lock icon).
- **Marketing emails** — single master toggle bound to `profiles.marketing_consent_status`. Subcategories listed as informational ("Product updates, launches, performance tips, offers").
- Unsubscribe action sets `status='unsubscribed'`, stamps `unsubscribed_at`, mirrors to `marketing_contacts`, logs event.

Public unsubscribe page (`/unsubscribe`) already exists — extend it to handle marketing scope as well.

### 4. Site Contacts UI (customer-facing, org-scoped)

New page `src/pages/SiteContacts.tsx` + sidebar entry. **Read-only view derived from `leads` + `lead_fields_flat`.** No new ingestion.

- Header: "Site Contacts"
- Subtext: "These contacts were captured from your connected website. They belong to your organization and are never used by ACTV TRKR for its own marketing."
- Table columns: Name/email, source site, source form/key action, source page, first seen, last seen, UTM, customer consent badge (Opted In / Not Detected / Unknown / Unsubscribed), tags.
- Aggregation: group `leads` by normalized email per org → derive first_seen/last_seen, latest UTM, latest source.
- **Export CSV** button (uses existing `src/lib/csv-export.ts`) including consent metadata; pre-export modal: "Only send marketing emails to contacts who have opted in according to your organization's consent policies."
- Disabled "Sync to your email/CRM provider" button with "Coming soon" tooltip (placeholder for future Mailchimp/Brevo/etc.).
- Trust banner: "ACTV TRKR does not use your website leads for its own marketing."

Tag/note editing writes to the new `leads.tags` / `leads.notes` columns (org-scoped RLS already protects these).

### 5. ACTV TRKR Marketing Contacts UI (admin-only)

New tab inside `src/pages/AdminSetup.tsx` → "Marketing Contacts" (only visible to `has_role('admin')`).

- Table over `marketing_contacts` with filters: consent status, lifecycle stage, source, plan (joined via `subscribers`), created date.
- Bulk actions: Export opted-in CSV (default), Suppress, Mark unsubscribed, View consent details (drawer showing consent text, source, URL, timestamp, ip_hash).
- Disabled "Sync to Mailchimp / Brevo / Loops" buttons (placeholders).
- Export label: "Export opted-in ACTV TRKR marketing contacts." Server-side filter `WHERE marketing_consent_status='opted_in'`.
- Every action writes a `marketing_contact_events` row.

### 6. Report recipient guardrails

In the existing report-schedule editor wherever recipients are added (search and update the component that edits `report_schedules.recipients`):

- Helper text under recipient input: "This person will receive selected ACTV TRKR reports for this organization. They will not receive ACTV TRKR marketing emails unless they independently opt in."
- Log a `marketing_contact_events` row with `event_type='recipient_added'` (no marketing_contacts row created).

In the report email template footer, add a small link: "Want ACTV TRKR product updates and website performance tips? Subscribe here." → routes to `/marketing-subscribe?email=…&token=…` (signed token), which on confirm creates a `marketing_contacts` row with `source='report_subscribe_link'`, `consent_status='opted_in'`.

### 7. Trust copy placement

- Site Contacts page: ownership banner (above).
- Existing "Mailchimp / integrations" copy locations (currently none — add when we add the disabled sync button): "ACTV TRKR can help you export or sync your own website leads to your own email provider. ACTV TRKR does not market to your customers' leads."
- Report recipient field: helper text above.

### 8. RLS summary

| Table | Customer org members | ACTV TRKR admins |
|---|---|---|
| `leads` (+ new fields) | RLS by org_id (existing) | All via `has_role('admin')` |
| `marketing_contacts` | **No access** | Full read/write |
| `marketing_contact_events` | No access | Read; service-role write |
| `profiles.marketing_consent_*` | Self only (existing policy) | All |

### 9. Audit logging

All consent state changes, exports, sync attempts, suppressions, recipient adds → `marketing_contact_events` (admin actions) or extend `security_audit_log` for org-side Site Contacts CSV exports (event_type `site_contacts_exported`).

### 10. Out of scope (explicitly)

- No changes to form parsing, field-mapping heuristics, or ingestion pipelines.
- No live Mailchimp/Brevo/Loops integration — placeholder buttons only.
- No new tracker.js behavior. Customer consent on `leads` is opportunistic/manual for now.
- No changes to billing/Stripe/checkout webhooks.

---

## Files to touch

**New**
- `supabase/migrations/<ts>_marketing_contacts.sql` (table, enums, RLS, triggers, additive `leads`/`profiles` columns)
- `supabase/functions/record-marketing-consent/index.ts`
- `src/pages/SiteContacts.tsx`
- `src/pages/MarketingSubscribe.tsx` (token-based opt-in landing for report-email link)
- `src/components/account/EmailPreferencesSection.tsx`
- `src/components/admin/MarketingContactsPanel.tsx`
- `src/hooks/use-marketing-contacts.ts`, `src/hooks/use-site-contacts.ts`

**Edited**
- `src/pages/Auth.tsx` — signup checkbox + post-signup consent call
- `src/pages/Onboarding.tsx` — second-chance opt-in
- `src/pages/Account.tsx` — mount EmailPreferencesSection
- `src/pages/AdminSetup.tsx` — Marketing Contacts tab
- `src/components/AppSidebar.tsx` — Site Contacts nav entry
- `src/pages/Unsubscribe.tsx` — handle marketing scope
- Report schedule editor (locate during build) — recipient helper text + footer link in email template
- `src/index.css` / shared badge usage — consent badges (Opted In / Not Opted In / Unknown / Unsubscribed / Suppressed)

**Memory updates after build**
- New `mem://features/contacts/separation-model.md` documenting the split + the ban on syncing site leads to ACTV TRKR's marketing provider.
- Add Core rule: "ACTV TRKR marketing exports are admin-only and `marketing_consent_status='opted_in'`. Site Contacts (`leads`) must never be added to ACTV TRKR's marketing list."

---

## Acceptance check (mapped to your criteria)

- ✅ Signup checkbox controls `marketing_consent_status` on `profiles` + `marketing_contacts`.
- ✅ Email Preferences allows opt-in / unsubscribe with timestamping.
- ✅ Marketing exports filter to `opted_in` and exclude all `leads`-derived data (separate table).
- ✅ Site Contacts page is org-scoped (RLS on `leads`), labeled as customer-owned, with consent badge + export warning.
- ✅ Report recipients = operational only; opt-in only via explicit `/marketing-subscribe` link.
- ✅ Audit log via `marketing_contact_events` + `security_audit_log`.
- ✅ Existing leads/forms/reports pipelines untouched.
