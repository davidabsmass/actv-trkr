## The bug

The user is correct: the "Direct: 5 sessions / 5 conversions / 100% CVR" is impossible.

`get_top_converting_sources` only returns sessions that already converted (it inner-joins on `converting_session_ids`). The frontend then counts those rows as "sessions" — so every row is by definition a conversion. CVR is always ~100%, and "sessions" is actually "converting sessions".

For Direct traffic, only 5 of (likely hundreds) of direct sessions converted, so the table reports 5 sessions / 5 conversions. The same flaw is silently affecting `ChannelBreakdown` since it consumes the same RPC.

Database confirms: ~5,016 sessions in the last 30d for the active org, but the RPC returns only the small converting subset.

## Fix

### 1. `get_top_converting_sources` RPC — return all sessions in range

Change the query so it returns every session in `[p_start, p_end]` for the org, with `has_lead` / `has_conversion` flags. Drop the inner join on `converting_session_ids`. Keep the same return shape so no frontend types change.

Key change (pseudo):
```sql
SELECT s.session_id, s.utm_source, s.utm_medium, s.utm_campaign,
       s.landing_referrer_domain,
       (ls.sid IS NOT NULL) AS has_lead,
       (gs.sid IS NOT NULL) AS has_conversion
FROM public.sessions s
LEFT JOIN lead_sessions ls ON ls.sid = s.session_id
LEFT JOIN goal_sessions gs ON gs.sid = s.session_id
WHERE s.org_id = p_org_id
  AND s.started_at >= p_start
  AND s.started_at <= p_end
  AND (p_site_id IS NULL OR s.site_id = p_site_id);
```

Bound by `sessions.started_at` (indexed) so this stays fast on large orgs. Lead/goal CTEs unchanged.

### 2. Frontend — no logic change needed, but tighten filter

`TopConvertingSources.tsx` currently filters `r.conversions > 0` after aggregating, which is exactly what we want once the RPC returns all sessions. CVR will then be `conversions / sessions` correctly. No code change required, but I'll verify the empty-state copy still reads well.

`ChannelBreakdown.tsx` will automatically start showing real CVR (e.g. "Direct 213 sess · 5 conv · 2.3% CVR") instead of zeros.

### 3. Dashboard "Top Converting Source" KPI

Already picks the source with most conversions; unaffected by sessions-count fix, will continue to work.

## Outcome

- "Top converting sources" table shows true Sessions, Conversions, and CVR per source/campaign
- "Traffic by channel" shows correct conversions and CVR per channel
- Numbers will reconcile with the rest of the dashboard
