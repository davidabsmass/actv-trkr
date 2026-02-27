

## Problem
The dashboard is showing a locked "Conversion Funnel" section with a "Growth Plan" badge because your sites have `plan_tier = 'core'`. This feature gating was built for future SaaS customers — not for you as the product owner.

## Plan

### 1. Update your sites to "growth" tier
Run a database migration to set both of your sites' `plan_tier` to `'growth'` so all dashboard sections are fully unlocked (Funnel View, Multi-Location Map, AI Insights, Attribution, etc.).

### 2. Remove the locked/paywall UI from the Funnel View
Instead of showing a lock icon and "Upgrade to Growth" message, the Funnel View component should simply not render when the feature isn't available — no upsell messaging. The locked state with the padlock icon feels like an ad in your own product.

### Technical Details
- **Database**: `UPDATE sites SET plan_tier = 'growth' WHERE org_id = '8e02f31e-32a8-4843-8595-f2cc7cc216c6'`
- **`src/components/dashboard/FunnelView.tsx`**: Remove the `locked` prop UI block that shows the lock icon and upgrade message. If `locked`, simply return `null`.
- **`src/pages/Dashboard.tsx`**: Simplify the FunnelView rendering — if the feature isn't available, don't render the component at all (already partially done with `locked` prop, just clean it up).

