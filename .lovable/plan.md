

The user wants two things:
1. **Visitor journey view** — entry, time spent, last page viewed (path from arrival to exit)
2. **Bulletproof legal** — cookies/privacy compliance verified end-to-end

Let me check what exists for #1 (the legal stuff is already extensively built per memory).

The data is already captured: `pageviews` (with `active_seconds`, `occurred_at`, `referrer_domain`, UTMs), `sessions` (with `started_at`, `ended_at`, `landing_page_path`, `landing_referrer_domain`), and `LeadActivityTimeline` already shows per-session timelines for leads.

What's missing: a **session-level journey view** that works for ALL visitors (not just leads who submitted forms). Right now you can only see the journey if a visitor became a lead.

For legal: per memory, comprehensive compliance setup, banner, region detection, CMP integration, Privacy/Cookie/Terms pages, consent enforcement, and ingestion hardening already exist. I'll do a verification pass rather than rebuild.

---

# Plan: Visitor Journey View + Legal Verification Pass

## Part 1 — Visitor Journey View

Add a new **"Visitor Journeys"** view that shows every session (not just lead-submitting ones), with entry → path → exit.

### Where it lives
New page at `/visitor-journeys` (linked from sidebar under Performance) **and** a "Recent Journeys" widget on Performance page.

### What each row shows
- **Arrival**: timestamp + landing page + traffic source (UTM/referrer)
- **Path**: ordered list of pages visited (collapsible)
- **Time spent**: total active seconds across all pageviews in the session
- **Last page viewed**: exit page + time of last activity
- **Outcome badge**: Lead / Bounced / Engaged / Converted-to-goal
- **Device + country** chip
- **Engagement score** (already exists via `calculate_engagement_score` RPC)

### Technical approach
1. **New RPC** `get_session_journeys(p_org_id, p_start, p_end, p_site_id, p_limit, p_offset)` — returns sessions with aggregated journey data joined from `sessions` + `pageviews` + `leads` + `goal_completions`.
2. **New component** `VisitorJourneys.tsx` — table with row expansion to show full page path (reuses `LeadActivityTimeline` rendering pattern).
3. **Filters**: date range (use global selector), site, outcome (all/leads/bounced/engaged), min duration.
4. **Reuse**: existing `calculate_engagement_score` RPC, existing event icons from `LeadActivityTimeline`.

### Privacy guardrails (already in place, will reaffirm)
- Visitor IDs displayed as short hash (e.g. `vis_a3f9…`) not raw UUIDs
- WP user identity only shown if site has visitor identification enabled AND consent is granted
- Country shown, IP never shown (already hashed at ingest)

## Part 2 — Legal Bulletproofing (Verification + Gap Fixes)

I'll audit and fix any gaps in:

| Area | Check | Action if gap found |
|---|---|---|
| Privacy Policy page | Lists all data collected, retention, processor role | Update copy where vague |
| Cookie Policy page | Lists every cookie + localStorage key with purpose/duration | Add any missing keys |
| Terms of Service | Customer-as-controller language present | Reaffirm |
| Consent banner | Renders before any tracking cookie set in strict mode | Verify in `tracker.js` boot order |
| Region detection | EU/UK strict, US opt-out, fallback logic | Already covered per `mem://compliance/region-detection-logic` |
| External CMP integration | Fail-closed when CMP detected but not granted | Already covered per `mem://compliance/external-cmp-integration` |
| Tracker before-consent inertness | Strict mode = zero cookies, zero localStorage, zero network | Verify with explicit test path |
| "Do Not Sell" link (US) | Required for US opt-out mode | Confirm `setupFooterLinks()` renders it |
| Data subject rights endpoint | Customer-facing way to request export/deletion | Add `/data-rights` info page if missing |
| Cookie inventory accuracy | Cookie Policy lists `mm_vid`, `mm_sid`, `mm_utm`, `mm_ts`, `mm_consent_decision`, etc. | Cross-check against `tracker.js` + `consent-banner.js` actual sets |

### Concrete file touches expected
- `src/pages/CookiePolicy.tsx` — refresh inventory if any cookie missing
- `src/pages/Privacy.tsx` — verify journey-data disclosure (add "page path & time-on-page" if absent)
- `src/pages/Terms.tsx` — no changes expected
- New: `src/pages/DataRights.tsx` — request data export / deletion (links to support form)
- Verify `tracker.js` strict-mode inertness with a code-read pass; document findings
- Verify `consent-banner.js` mounts before any `track()` call in strict mode

## Part 3 — Wiring & UX

- Sidebar entry "Visitor Journeys" under Performance group
- Empty state: "No visitor sessions yet for the selected range"
- Loading state: skeleton rows
- Pagination: 50 per page
- Click row → expand inline (reuses timeline component pattern)
- Click visitor → if identified, deep-link to lead detail; if anonymous, show journey-only view

## What I will NOT do
- Won't add a discrete "session_end" event (deferred from prior turn — server-side inference is sufficient for this view)
- Won't change `tracker.js` cookie names, durations, or transport
- Won't touch form parsing, field mapping, or attribution logic (per memory locks)
- Won't add per-keystroke or session-replay tracking (out of scope, privacy-invasive)

## Files to create/edit (~6 files)
1. `supabase/migrations/<timestamp>_session_journeys_rpc.sql` — new RPC
2. `src/pages/VisitorJourneys.tsx` — new page
3. `src/components/journeys/JourneyRow.tsx` — expandable row component
4. `src/components/Sidebar.tsx` (or equivalent) — add nav entry
5. `src/App.tsx` — add route
6. Legal pages — verify + patch as needed
7. Optional: `src/pages/DataRights.tsx` — new info page for DSAR requests

## Estimated outcome
- Subscribers can answer "where did this visitor come from, what did they look at, where did they leave" for every session, not just leads.
- Legal posture documented and confirmed bulletproof against EU/UK/US baseline requirements.

