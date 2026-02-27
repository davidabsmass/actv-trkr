

## Problem
The Visitor Map (`VisitorMapSection`) is conditionally rendered only when `hasFeature("multi_location_map")` returns `true`. That feature is locked to the **"growth"** plan tier. Your site's `plan_tier` in the `sites` table is set to "core" (the default), so the map never renders.

## Fix
Move `multi_location_map` from growth-only to all tiers so the map is always visible.

### Implementation
1. **Edit `src/hooks/use-plan-tier.ts`** line 16: Change `multi_location_map: ["growth"]` to `multi_location_map: ["core", "performance", "growth"]`

That single line change will make the visitor map appear for all plan tiers.

