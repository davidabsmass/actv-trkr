## Problem

The Form Health probe is correctly *detecting* "form markup not present on page", but two of its current hits are false positives:

1. **Third-party script masquerading as a form** — discovery picked up a vendor widget (e.g. an embedded chat/booking script) as a "form". It will never render via our shortcode/block detector, so it permanently shows as broken.
2. **Form on a deleted page** — the form still exists in WP, but the page that used to host it is gone (404). The form isn't broken; the page is.

Today the only escape valve is **Archive** in Settings → Forms, which hides the form everywhere — including from entry counts and history. That's too blunt for "this is real but not what you think it is" cases.

## Goal

Give the user one-click ways to tell the system **why** a flagged form should stop nagging, without losing legitimate detection of newly-broken forms. Keep it WP-read-only — all changes happen in our DB, not in WordPress.

## What we'll build

### 1. Two new resolution states on `forms` (DB)

Add nullable columns to `public.forms`:
- `health_check_disabled boolean default false` — skip the liveness probe entirely for this form
- `health_check_disabled_reason text` — one of: `not_a_form`, `page_removed`, `intentional`, `other`
- `health_check_disabled_at timestamptz`
- `health_check_disabled_by uuid` (auth.uid)

No CHECK constraint on the reason — validate in app/edge layer (per project rules on validation triggers).

### 2. Edge function changes
- `ingest-form-health`: skip any form where `health_check_disabled = true` (don't upsert a check, don't fire `FORM_NOT_RENDERED` alert).
- WP probe (`class-forms.php::get_form_page_checks`): query our `/forms-discovery-config` (or just rely on backend filter) — simplest is to filter at edge ingest, no plugin change needed in v1.

### 3. UI: Form Health Panel actions

In `FormHealthPanel.tsx`, when a form is in `not_rendered` state, replace the bare row with an expandable row that exposes a small **"Resolve"** menu:

```
⛔ Contact Form    Page not found (HTTP 404)              NOT FOUND
                                                          [Resolve ▾]
                   ├─ Page was removed → stop checking
                   ├─ This isn't a real form → stop checking
                   ├─ Re-check now
                   └─ Archive form (hide everywhere)
```

- "Page was removed" → sets `health_check_disabled = true`, reason `page_removed`. Form stays visible in Forms list with a small "Page removed — not monitored" pill.
- "This isn't a real form" → same mechanism, reason `not_a_form`. Recommended copy: *"We'll stop tracking this. Existing entries (if any) stay in your records."*
- "Re-check now" → calls a new `recheck-form-health` edge function that triggers a single fetch + detect for that one form (faster than waiting for the hourly cron).
- "Archive" → existing behavior.

### 4. Forms list visibility

In `src/components/settings/FormsSection.tsx`, add a fourth tab **"Not monitored"** showing forms with `health_check_disabled = true`, with a one-click "Resume monitoring" action. This keeps the decision reversible.

### 5. Hero / Needs Attention count

`SiteStatusHero` and any "X forms not rendering" counters must exclude forms where `health_check_disabled = true`. The hero should only nag about *unresolved* render failures.

### 6. Discovery hardening (small follow-up, same PR)

To reduce future false positives from #1 (third-party scripts), tighten `get_form_page_checks` so we **only** enqueue probes for forms that came from a known provider's API (Gravity, CF7, WPForms, Fluent, Ninja, Avada/Fusion). Anything ingested via generic submission listening but never confirmed by a provider API gets `is_probeable = false` and is skipped by the probe. This is the long-term fix; #1–#5 are the user-facing escape valve.

## Out of scope

- No changes to entries, lead history, or attribution.
- No edits to WordPress (read-only principle).
- No removal of the existing Archive flow.
- No schema changes to `form_health_checks` itself.

## Files touched

- **Migration** (new): add 4 columns to `public.forms`.
- `supabase/functions/ingest-form-health/index.ts` — skip disabled forms.
- `supabase/functions/recheck-form-health/index.ts` (new) — single-form on-demand probe via WP REST or stored `page_url`.
- `src/components/dashboard/FormHealthPanel.tsx` — Resolve menu + filter out disabled.
- `src/components/dashboard/SiteStatusHero.tsx` — exclude disabled from `formIssueCount`.
- `src/components/settings/FormsSection.tsx` — "Not monitored" tab + resume action.
- `src/pages/FormsTroubleshooting.tsx` — short note explaining the two new resolutions.

## Acceptance

- Clicking "Page was removed" on a flagged form makes it disappear from the dashboard's Form Health panel and from the hero's "X forms not rendering" count within a single re-render.
- The form remains visible in `/forms` with a "Not monitored" pill and can be re-enabled.
- No `FORM_NOT_RENDERED` alerts are created for disabled forms on the next probe cycle.
- Archived forms continue to behave exactly as before.
- No existing entries, leads, or analytics data are altered.
