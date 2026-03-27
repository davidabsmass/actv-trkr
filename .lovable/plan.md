

# Fix AI Features: Org Context, 300/Month Limit, Cost Reduction

## What We're Fixing

1. **Chatbot reads wrong org** — always picks first org instead of the one you're viewing
2. **Chatbot has no rate limit** — unlimited messages, unbounded cost
3. **AI Insights auto-fires too much** — burns 5 calls just navigating around
4. **AI Insights gives generic advice** — no site names, pages, or sources in the prompt

## What Changes

### Chatbot fixes
- Frontend sends the active orgId to the chatbot edge function
- Edge function validates user belongs to that org, then fetches data for that specific org
- Add 300 messages/month limit per org (checked against `ai_usage_log` table, current calendar month)
- Cache the site context for 1 hour so repeat messages skip all 18 database queries
- Use cheaper model (`gemini-2.5-flash-lite`) for follow-up messages in a conversation
- Show friendly message when limit reached: "You've used all 300 AI assistant messages this month"

### AI Insights fixes
- Frontend sends orgId, auto-call reduced from 5 to 1 per day
- Cache key scoped by orgId so switching clients doesn't show stale data
- Edge function fetches org name, site domains, top 5 pages, top 5 sources and includes them in the AI prompt
- Insights will reference actual site names and pages instead of generic advice

## Cost Impact

| Feature | Before | After |
|---------|--------|-------|
| Chatbot messages/month | Unlimited | 300 cap |
| Chatbot cost/org/month | Unbounded | ~$1.50 max |
| Insights auto-calls/day | 5 | 1 |
| Insights cost/org/month | ~$0.90 | ~$0.45 |
| Total AI cost (50 orgs) | $200-350+ | ~$100 |

## Files Changed

| File | Change |
|------|--------|
| `src/components/AiChatbot.tsx` | Import `useOrg`, send `orgId` in POST body |
| `supabase/functions/ai-chatbot/index.ts` | Read orgId from body, validate membership, add 300/month rate limit via `ai_usage_log`, cache context 1hr, use lite model for follow-ups |
| `src/components/dashboard/AiInsights.tsx` | Accept `orgId` prop, `AUTO_LIMIT` 5→1, scope sessionStorage key by orgId |
| `src/pages/Dashboard.tsx` | Pass `orgId` to `<AiInsights>` |
| `supabase/functions/dashboard-ai-insights/index.ts` | Read orgId from body, validate, fetch org name + domains + top pages + top sources, enrich AI prompt |

No database migrations needed — `ai_usage_log` table already exists with the right columns.

