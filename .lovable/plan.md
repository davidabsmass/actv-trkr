

# Add Deterministic Checks for Duplicate Meta Descriptions and Canonical Tags

## Problem
"Duplicate meta description" and "Multiple canonical tags" issues are currently only detected by the AI layer, which can hallucinate. These should be deterministic checks based on actual HTML tag counting.

## Changes

### 1. `supabase/functions/scan-site-seo/index.ts`

**In the HTML parsing section (~lines 224-229):**
- Count all `<meta name="description">` tags instead of just matching the first one
- Count all `<link rel="canonical">` tags instead of just checking existence

**In `buildDeterministicIssues` function signature (~line 60):**
- Add `metaDescCount: number` and `canonicalCount: number` to the context object

**In `buildDeterministicIssues` body:**
- After the existing meta description checks, add: if `metaDescCount > 1`, push a `"meta-desc-duplicate"` issue (impact: High, category: SEO)
- After the existing canonical check, add: if `canonicalCount > 1`, push a `"canonical-duplicate"` issue (impact: High, category: Technical)

### 2. `src/lib/seo-scoring.ts`

- Add `"meta-desc-duplicate"` and `"canonical-duplicate"` to the severity multiplier if needed (they use count, so the existing default multiplier handles it)

No database changes needed — the issues are stored as JSON in `seo_scans.issues_json`.

