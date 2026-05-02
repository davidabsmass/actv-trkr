## Why the tab says "No converting sources yet"

The component currently calls `get_session_journeys`, which returns the **most recent 1,000 sessions** ordered by `started_at DESC`.

For your org we have:
- 7,057 sessions in the last 30 days
- 71 sessions tied to a Key Action (goal completion)
- All 71 have UTM or referrer attribution

Because converting sessions are spread across the full 30-day window, almost none of them fall inside the latest 1,000 — so the component sees zero conversions and renders the empty state. (Separately, 308 of 310 form-fill leads are missing `session_id` from ingestion, so leads contribute almost nothing to this view today — that's a different fix and not in scope here.)

## The fix

Stop sampling sessions. Query the converting sessions **directly** by joining `goal_completions` and `leads` to `sessions`, then aggregate by source/campaign client-side.

### 1. New database function: `get_top_converting_sources`

Server-side aggregator that returns one row per converting session with its attribution:

```text
input:  org_id, start, end, optional site_id
output: session_id, utm_source, utm_medium, utm_campaign,
        landing_referrer_domain, has_lead, has_conversion
```

Logic:
- Build set of `session_id`s from `goal_completions` (Key Actions) in range.
- Union with `session_id`s from `leads` in range.
- Join back to `sessions` to fetch attribution columns.
- Authorization: `is_org_member(org_id) OR admin role` — same gate as `get_session_journeys`.
- `SECURITY DEFINER`, `STABLE`, `search_path = public`, granted to `authenticated`.

This returns only the sessions that actually converted — typically dozens to a few thousand rows even for high-traffic orgs — so the 1k client cap stops being a problem.

### 2. Update `TopConvertingSources.tsx`

- Replace the `get_session_journeys` RPC call with `get_top_converting_sources`.
- Keep the existing client-side `classify()` logic (Paid Social / Search / Email / Organic / Referral / Direct) and the table UI — they're already correct.
- Drop the "(latest 1k)" caveat; it no longer applies.
- Keep the empty-state copy but re-word it to be accurate: "No tracked sessions have completed a form fill or Key Action in this date range yet."

### 3. No other callers affected

`get_session_journeys` stays as-is — it's still used by the Channels tab and the journey list, where the 1k cap is acceptable because those views show sampled traffic, not totals.

## Files

- `supabase/migrations/<timestamp>_get_top_converting_sources.sql` (new) — function + grant
- `src/components/journeys/TopConvertingSources.tsx` — switch RPC, refresh empty-state copy

## Verification

After deploy, the Top Converting Sources tab on Visitor Journeys (30d range) should list sources for the 71 converting sessions we found in the database, ranked by conversions with CVR alongside.
