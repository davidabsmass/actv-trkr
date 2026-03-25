## Operator Brief

### Done
- Landing page sections (copy + design)
- Multi-Site Plan pricing ($49/mo, up to 10 sites)
- Stripe connector linked (restricted key)
- All edge functions, auth, org context, dashboard queries

### Pending
1. **Dashboard white-screen fix** — forwardRef on card components, ErrorBoundary, per-query error fallbacks
2. **Stripe product creation** — needs key upgrade or manual product/price IDs
3. **Wire checkout** — connect Multi-Site price ID to `create-checkout` edge function

### Next Task
Fix dashboard resilience: `WhatsWorking.tsx`, `TopPagesAndSources.tsx` → forwardRef; new `ErrorBoundary.tsx`; wrap Outlet; add isError fallbacks in `Dashboard.tsx`.

### Acceptance Criteria
- [ ] No "Function components cannot be given refs" console warnings
- [ ] Dashboard renders even if one query fails
- [ ] White screen replaced by retry UI on render crash
