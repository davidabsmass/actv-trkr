
What’s happening right now (root cause)
1) The scanner is reading the live homepage HTML correctly, and the latest scan response is still:
   - "Page title is too short (19 chars, aim for 30-60)"
2) The latest saved scan records in Lovable Cloud also show the same 19-char title result repeatedly.
3) So this is not a stale UI bug — the page source being served to the scanner still has a short `<title>` (likely homepage title override behavior in your current WordPress/Avada/Yoast setup).

Plan to fix the confusion and make this debuggable in-product
1) Add “scan evidence” to the SEO scan result payload
   - Capture and return: `title_text`, `title_length`, `meta_description_length`, `og_title`, `canonical`, `final_url`, and `fetched_at`.
   - Keep this deterministic (no AI dependency).

2) Persist scan evidence with each scan
   - Add a new JSON column (e.g. `signals_json`) to `seo_scans` in Lovable Cloud.
   - Store the exact extracted values used for scoring so users can see exactly what the scanner saw.

3) Show “What we scanned” in SEO UI
   - Add a compact evidence panel in `/seo`:
     - Scanned title (raw text + char count)
     - Scanned meta description (char count)
     - Final fetched URL + timestamp
   - This removes guesswork when title updates “look right” in WP admin but not in live HTML.

4) Add smart mismatch hints for homepage
   - If title is short and looks like homepage default patterns (e.g., “HOME - Brand”), show targeted guidance:
     - “Live source is still serving a short homepage title.”
     - “Check homepage SEO title source priority (theme/page settings vs plugin settings).”

5) Keep scan logic strict and deterministic
   - No change to scoring thresholds.
   - No AI-generated title verdicts.
   - Continue cache-busting fetch, but now show evidence so users can verify instantly.

Files/areas to update
- `supabase/functions/scan-site-seo/index.ts`
  - Build and return/store scan evidence object.
- `src/components/reports/SeoTab.tsx`
  - Read and pass evidence to UI.
- `src/components/reports/SeoScoreCard.tsx` (or a new small component)
  - Render “What we scanned” block.
- `supabase/migrations/*`
  - Add `seo_scans.signals_json jsonb` (with safe default).

Validation steps (post-implementation)
1) Run a new homepage scan and confirm the evidence panel shows the exact title text and length.
2) Update homepage title in WP, rescan, and verify evidence changes immediately.
3) Confirm score/issue logic remains unchanged except when real title length changes.
4) Test end-to-end in `/seo`: New Scan → evidence updates → issue disappears once live title is 30–60 chars.
