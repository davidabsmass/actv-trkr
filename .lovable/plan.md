

# Problem Analysis: Inconsistent SEO Scoring

## Root Cause

The score is **entirely AI-dependent**. The edge function asks AI to decide what issues exist and their severity, then subtracts points. This means:

1. **Non-deterministic**: The AI can return different issues on each scan, even for the same page. Fixing a title might cause the AI to suddenly notice and report 2-3 new issues it missed before.
2. **No credit for fixes**: There's no mechanism to recognize that an issue was resolved — the score is rebuilt from scratch each time.
3. **Duplicate scoring logic**: The edge function has its own inline score calculation (line 236) that doesn't use the `calculateSeverityMultiplier` from `seo-scoring.ts`, so multipliers aren't applied properly.

## Fix: Deterministic-First Scoring

The server-side pre-checks (title, meta desc, H1, canonical, OG tags, HTTPS, blocking scripts, images) already detect ~80% of real issues deterministically. The fix is to **anchor scoring on these server-side checks** and only let AI add supplementary findings.

### Changes

#### 1. Edge Function (`supabase/functions/scan-site-seo/index.ts`)

**Build deterministic issues server-side first** — before calling AI:

| Check | Condition | Impact | Category |
|-------|-----------|--------|----------|
| Title missing | `titleStatus === "missing"` | Critical | SEO |
| Title too short/long | length out of 30-60 range | Medium | SEO |
| Meta desc missing | `!metaDescContent` | High | SEO |
| Meta desc too short/long | length out of 120-160 range | Medium | SEO |
| H1 missing | `h1Count === 0` (non-SPA) | Critical | SEO |
| Multiple H1s | `h1Count > 1` | Medium | Content |
| No canonical | `!hasCanonical` | Medium | Technical |
| Missing OG tags | any of title/desc/image missing | Low | SEO |
| Not HTTPS | `!isHttps` | Critical | Technical |
| Render-blocking scripts | `blockingScripts.length > 0` | Medium | Performance |
| Images without lazy loading | `imgsNoLazy > 5` | Low | Performance |

**Score calculation**:
- Start with deterministic issues (guaranteed consistent)
- AI can still add supplementary issues (capped at +3 extras) for things like thin content, keyword stuffing, accessibility
- Use the shared `calculateSeverityMultiplier` logic for count-based scaling
- This ensures fixing an issue **always** improves the score

**AI role changes**:
- AI still analyzes the page, but its output is **merged** with deterministic issues (deduped by `id`)
- AI-only issues are capped and marked as `ai_detected: true`
- AI generates the `fix` text for deterministic issues too (platform-specific guidance)

#### 2. Scoring Module (`src/lib/seo-scoring.ts`)
- No changes needed — the existing logic is sound; the edge function just needs to actually use it consistently.

#### 3. Edge Function Score Calc (line 235-239)
- Replace inline score math with the same formula from `seo-scoring.ts` (proper multiplier logic)

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/scan-site-seo/index.ts` | Deterministic issue detection, merge with AI, consistent scoring |

### Result
- Fixing the title → that specific deduction disappears → score goes up (guaranteed)
- AI can't inflate the issue count between scans
- Score becomes predictable and trustworthy

