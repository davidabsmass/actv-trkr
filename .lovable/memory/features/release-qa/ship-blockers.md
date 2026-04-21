---
name: Release QA Ship-Blockers
description: The 4 critical manual sign-offs that gate every release, plus the verified procedure for the RLS isolation test
type: feature
---

The Release QA panel (`/admin-setup → Release QA`) flags 4 manual checks as **ship-blockers** — they MUST be signed off before pushing a new version. The set is defined in `src/components/admin/ReleaseQAPanel.tsx` as `SHIP_BLOCKER_KEYS`:

1. `lifecycle.checkout_to_active_manual` — Stripe checkout → auth → onboarding → active subscriber works end-to-end
2. `security_boundaries.rls_smoke_test_manual` — Org A user cannot read Org B's data
3. `plugin.install_manual` — Fresh plugin .zip installs cleanly on a new WordPress site
4. `tracking.consent_strict_inert_manual` — Tracker stays 100% silent under Strict consent until granted

UI surfaces them with: a red `Ship-blocker` badge per row, a `Ship-blockers — X / 4 cleared` progress card, and a `Show ship-blockers only` filter toggle. The other 7 pending items can be signed off post-launch.

## RLS smoke test — verified procedure

Do NOT run RLS tests via `supabase--read_query` / `psql` superuser — those bypass RLS and produce false alarms. Use the public REST API with the anon key, which enforces RLS exactly as a real user would experience it:

```bash
curl -s "${VITE_SUPABASE_URL}/rest/v1/events?select=count" \
  -H "apikey: ${ANON_KEY}" \
  -H "Prefer: count=exact" \
  -H "Range: 0-0" -i
```

PASS criteria: `HTTP 200` with `content-range: */0` (zero rows returned despite the table containing thousands). Repeat for `forms`, `sites`, `subscribers`. Verified policies use `is_org_member(org_id)` scoped to `role=authenticated`.
