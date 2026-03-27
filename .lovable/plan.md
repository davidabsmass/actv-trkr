

## How It Works Now (And Why It's Broken)

### Problem 1: AI Performance Insights — Poor Quality + Quick Lockout

**Current flow:**
1. Every time the Dashboard loads, the `AiInsights` component auto-fires a call to the `dashboard-ai-insights` edge function
2. The edge function receives pre-computed metrics (sessions, leads, CVR) but resolves the org by picking the **first org** in `org_users` for the user — not the currently selected one
3. The function has a daily limit of 15 calls per org (5 auto + 10 manual on the frontend side, 15 on the backend)
4. Auto-calls fire on every dashboard page load (up to 5 per day), burning through the quota fast
5. Once exhausted, the user sees "All caught up — try tomorrow"

**Why insights are bad:** The function only gets raw numbers (sessions this week: X, leads: Y). It has no site name, no page names, no source breakdown — just totals. The AI has very little context to work with.

### Problem 2: Chatbot Talks About Wrong Client

**Current flow:**
1. The chatbot frontend (`AiChatbot.tsx`) sends messages + language, but **no `orgId`**
2. The edge function resolves org via `org_users` with `limit(1)` — always picks the first org alphabetically/by insertion order
3. All data fetched (sessions, leads, pages, SEO, etc.) comes from that first org, not the one the user is looking at

---

## Plan

### Fix 1: Chatbot — Pass the Active Org

**`src/components/AiChatbot.tsx`**
- Import `useOrg` hook
- Send `orgId` in the request body alongside `messages` and `language`

**`supabase/functions/ai-chatbot/index.ts`**
- Read `orgId` from request body instead of guessing from `org_users`
- Validate that the authenticated user is a member of that org before fetching data
- Fall back to current behavior if no orgId provided

### Fix 2: AI Insights — Pass Org + Improve Context + Reduce Auto-Burn

**`src/components/dashboard/AiInsights.tsx`**
- Accept `orgId` as a prop and send it in the function call body
- Reduce `AUTO_LIMIT` from 5 to 1 (one auto-call per day is enough; the rest should be manual refreshes)
- Scope the sessionStorage cache key by orgId so switching clients doesn't show stale insights

**`supabase/functions/dashboard-ai-insights/index.ts`**
- Read `orgId` from request body (validate user membership)
- Enrich the AI prompt with actual org data: fetch the org name, site domains, top page names, and top sources server-side so the AI has real context to reference
- This transforms the AI from "you have 12 sessions" to "apyxmedical.com had 12 sessions, mostly from Google, with /services as the top page"

**`src/pages/Dashboard.tsx`**
- Pass `orgId` to the `AiInsights` component

### Technical Details

| Change | File | What |
|--------|------|------|
| Pass orgId to chatbot | `AiChatbot.tsx` | Add `useOrg()`, include `orgId` in POST body |
| Chatbot uses passed org | `ai-chatbot/index.ts` | Read `orgId` from body, validate membership, skip blind `limit(1)` lookup |
| Pass orgId to insights | `Dashboard.tsx` → `AiInsights.tsx` | Thread orgId prop through |
| Insights uses passed org | `dashboard-ai-insights/index.ts` | Read `orgId` from body, validate, fetch enriched context (org name, domains, top pages, sources) |
| Reduce auto-burn | `AiInsights.tsx` | `AUTO_LIMIT` 5→1, scope cache key by orgId |
| Better AI prompt | `dashboard-ai-insights/index.ts` | Add org name, site domains, top 5 pages, top 5 sources to the prompt so insights are specific and useful |

