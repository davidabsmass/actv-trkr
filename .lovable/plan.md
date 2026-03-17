

## AI Cost Limiting Plan

### 1. Database Migration: `ai_usage_log` table

Create a table to track and rate-limit AI gateway calls:

```sql
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  function_name text NOT NULL,
  cached boolean NOT NULL DEFAULT false,
  response_cache jsonb,
  metrics_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_org_fn_created ON public.ai_usage_log (org_id, function_name, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Only service_role can insert (from edge functions)
CREATE POLICY "service_insert" ON public.ai_usage_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Org members can read their usage
CREATE POLICY "org_select" ON public.ai_usage_log FOR SELECT TO authenticated
  USING (is_org_member(org_id));
```

### 2. Edge Function Changes (4 functions)

Each user-triggered AI function gets a rate-limit guard and usage logging, implemented with a service-role Supabase client.

**Shared pattern** (added after auth, before AI call):

```text
1. Resolve org_id (from request body or user's org_users row)
2. COUNT rows in ai_usage_log WHERE org_id + function_name + created_at > now() - 24h
3. If count >= limit → return 429 with { error, code: "RATE_LIMITED" }
4. For dashboard-ai-insights: check for cached response < 4h old with matching metrics_hash → return cached
5. After successful AI call → INSERT into ai_usage_log (with response_cache for dashboard insights)
```

**Per-function daily limits:**
- `dashboard-ai-insights`: 10/day, 4-hour cache with metrics hash
- `reports-ai-copy`: 20/day
- `scan-site-seo`: 5/day
- `seo-suggest-fix`: 15/day

**Org ID resolution:**
- `dashboard-ai-insights` and `reports-ai-copy`: don't receive org_id in body → look up from `org_users` table using authenticated user ID
- `scan-site-seo` and `seo-suggest-fix`: already receive org_id or page_url in body → resolve from request or user's org

### 3. Frontend Changes

**`AiInsights.tsx`:**
- Change from auto-fetch (`useQuery` with `enabled: true`) to manual trigger via a "Generate Insights" button
- Set `enabled: false` on the query, call `refetch()` on button click
- Handle 429 responses: show a toast "Daily AI limit reached. Try again tomorrow." instead of generic error

**Report tabs** (`OverviewTab.tsx`, `WeeklyTab.tsx`, `MonthlyTab.tsx`):
- Add 30-second cooldown after AI summary generation (disable button with countdown)
- Handle 429 from `reports-ai-copy` with a user-friendly message

**`SeoTab.tsx`:**
- Show remaining scan count badge next to "Scan Now" button (optional, stretch)
- Handle 429 from both `scan-site-seo` and `seo-suggest-fix`

### Technical Details

**Metrics hash for caching** (dashboard-ai-insights only):
- Hash = `${sessionsThisWeek}-${leadsThisWeek}-${cvrThisWeek.toFixed(4)}`
- If a cached row exists with same org_id + function_name + matching hash + created_at > now() - 4h → return `response_cache` without calling AI

**Service role client in edge functions:**
- Each function already has access to `SUPABASE_SERVICE_ROLE_KEY` (or can use it)
- The service-role client bypasses RLS to insert into `ai_usage_log`

### Files to Create/Edit

| File | Action |
|------|--------|
| Migration SQL | Create `ai_usage_log` table |
| `supabase/functions/dashboard-ai-insights/index.ts` | Add rate limit + cache |
| `supabase/functions/reports-ai-copy/index.ts` | Add rate limit |
| `supabase/functions/scan-site-seo/index.ts` | Add rate limit |
| `supabase/functions/seo-suggest-fix/index.ts` | Add rate limit |
| `src/components/dashboard/AiInsights.tsx` | Manual trigger + 429 handling |
| `src/components/reports/OverviewTab.tsx` | 429 handling + cooldown |
| `src/components/reports/WeeklyTab.tsx` | 429 handling + cooldown |
| `src/components/reports/MonthlyTab.tsx` | 429 handling + cooldown |

### Expected Impact

- Worst-case per-org daily AI calls capped at ~50 (down from unlimited)
- Dashboard insights served from cache most of the time
- Monthly cost per org capped at ~$45 worst case, ~$0.50 typical

