# PROJECT HANDOFF — ACTV TRKR / Mission Control

## Product Decisions (Confirmed)
- **Multi-Site Plan**: $49/mo for up to 10 sites (Stripe product created, price ID pending — key permissions blocked creation)
- **Annual pricing**: 17% discount on all plans
- **Landing page copy**: Updated for Performance Snapshot, Lead Attribution, Smart Insights, Form Monitoring, Website Health sections — all live in `src/pages/Index.tsx`

## Open Issue: Dashboard White Screen
- **Symptom**: Intermittent blank white screen on `/dashboard` after login
- **Console clue**: "Function components cannot be given refs" warnings from dashboard children
- **Root cause**: `WhatsWorking.tsx` and `TopPagesAndSources.tsx` are plain function components receiving refs; no error boundary catches render crashes

### Fix Path (implement first)
1. Wrap `WhatsWorking` and `TopPagesAndSources` with `React.forwardRef`
2. Create `src/components/ErrorBoundary.tsx` — class component, shows retry UI
3. Wrap `<Outlet />` in `AppLayout.tsx` (or `App.tsx` route tree) with ErrorBoundary
4. In `Dashboard.tsx`, add per-query `isError` fallbacks so one failed panel doesn't blank everything

## Stripe Status
- Stripe connector is linked but restricted-key lacks `Products:write`
- Multi-Site product needs manual creation or upgraded key permissions
- Once product+price IDs exist, wire them into `create-checkout` edge function

## Architecture Notes
- Auth: `use-auth.ts` → Supabase session; `ProtectedRoute` in `App.tsx`
- Org context: `use-org.tsx` → `OrgProvider` wraps `AppLayout`; active org in `localStorage` key `mm_active_org`
- Dashboard: parallel queries with 15s refetch; no failure isolation currently
- Key files: `Dashboard.tsx`, `AppLayout.tsx`, `App.tsx`, `WhatsWorking.tsx`, `TopPagesAndSources.tsx`

## New Thread Starter Prompt
Copy/paste this into the new chat:

> Read PROJECT_HANDOFF.md first. Ignore older chat history. Start with task: Fix dashboard white-screen resilience (forwardRef fixes, ErrorBoundary, query error fallbacks). Keep responses short and one task at a time.
