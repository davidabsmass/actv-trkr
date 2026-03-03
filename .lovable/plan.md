

## Two Fixes: Real Device Split + Branded Client URL

### 1. Real Device Split in Form Leaderboard

**Problem**: The desktop/mobile columns show hardcoded 65/35% for every form. The `pageviews` table already captures a `device` column (`desktop`, `mobile`, `tablet`) per event.

**Approach**: In `FormLeaderboard`, query the `leads` table joined with pageview device data to compute real per-form device splits.

Since leads don't have a `device` column directly, but they do have `session_id`, and `pageviews` has both `session_id` and `device`, we can:
- Query `pageviews` for the org within the date range, grouped by device
- Cross-reference with leads via `session_id` to get per-form device splits
- If no device data exists yet, show "—" instead of fake percentages

**Files changed**:
- **`src/components/dashboard/FormLeaderboard.tsx`** — accept an optional `deviceData` prop (map of form_id → {desktop, mobile, tablet counts}), or compute it internally by querying `pageviews` joined through `leads.session_id`. Remove the hardcoded `{ desktop: 65, mobile: 35 }`.
- **`src/pages/Forms.tsx`** — pass device data down if the leaderboard is used there too.

### 2. Branded Client URL (`actvtrkr.com`)

**Problem**: Dashboard URLs shown to clients use `window.location.origin` which resolves to `mshnctrl.lovable.app`. Since the app is already deployed at `actvtrkr.com`, the URLs should use that domain instead.

**Approach**: Replace `window.location.origin` with a constant `https://actvtrkr.com` for all client-facing URLs:

**Files changed**:
- **`src/pages/Clients.tsx`** — Change `dashboardUrl`, invite link URLs, and inline references from `window.location.origin` to `https://actvtrkr.com`
- **`src/pages/Signup.tsx`** — Change the "Your Dashboard" URL from `window.location.origin/auth` to `https://actvtrkr.com/auth`

We'll define a single constant (e.g. `const APP_DOMAIN = "https://actvtrkr.com"`) in a shared location like `src/lib/utils.ts` so it's easy to update later.

### Summary

| Change | Files |
|--------|-------|
| Real device split from pageviews data | `FormLeaderboard.tsx`, `Forms.tsx` |
| Branded `actvtrkr.com` URLs for clients | `Clients.tsx`, `Signup.tsx`, `src/lib/utils.ts` |

