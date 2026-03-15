

# SEO Auto-Fix System

## Overview

Build a pipeline where the dashboard sends SEO fix commands to the WordPress plugin, which applies them automatically. The system also tracks fix history and supports verify-after-fix rescanning.

## Architecture

```text
Dashboard UI                Edge Function              WP Plugin
─────────────               ─────────────              ─────────
"Fix this" button  ──►  seo-fix-command  ──►  seo_fix_queue table
                                                       │
                                              Plugin polls via cron
                                                       │
                                              Applies fix (post_meta
                                              / wp_head filters)
                                                       │
                                              Reports back: "applied"
                                                       ▼
Dashboard re-scans  ◄──  scan-site-seo  ◄──  Updated HTML
```

## Database Changes

### New table: `seo_fix_queue`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK |
| org_id | uuid | Org reference |
| site_id | uuid | Site reference |
| page_url | text | Which page to fix |
| issue_id | text | e.g. "meta-desc-missing" |
| fix_type | text | "set_meta_desc", "set_title", "add_canonical", "add_og_tags" |
| fix_value | text | The actual value to set |
| status | text | "pending" / "applied" / "failed" / "skipped" |
| created_at | timestamptz | When queued |
| applied_at | timestamptz | When plugin confirmed |
| scan_id | uuid | Which scan triggered this |

RLS: org members can select, admin/member can insert.

### New table: `seo_fix_history`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK |
| org_id | uuid | Org reference |
| site_id | uuid | Site reference |
| issue_id | text | The issue that was fixed |
| page_url | text | Page affected |
| fixed_at | timestamptz | When confirmed |
| before_score | integer | Score before fix |
| after_score | integer | Score after re-scan (nullable until verified) |

RLS: org members can select.

## Edge Function: `seo-fix-command`

Accepts authenticated POST with:
- `site_id`, `org_id`, `page_url`, `issue_id`, `fix_type`, `fix_value`

Validates org membership, inserts into `seo_fix_queue` with status "pending".

For deterministic issues, the fix values can be auto-generated:
- **meta-desc-missing/too-short**: AI generates an optimized meta description
- **title-missing/too-short/too-long**: AI generates an optimized title
- **canonical-missing**: Sets canonical to the page's own URL
- **og-tags-missing**: Copies title/description + generates OG image placeholder

## WordPress Plugin Changes

### New class: `class-seo-fixes.php`

1. **Poll endpoint** (WP-Cron, every 5 minutes): Calls a new edge function `seo-fix-poll` with the API key, gets pending fixes for this site.

2. **Apply fixes** using WordPress hooks:
   - `set_title` → `update_post_meta($post_id, '_mm_seo_title', $value)`
   - `set_meta_desc` → `update_post_meta($post_id, '_mm_seo_description', $value)`
   - `add_canonical` → `update_post_meta($post_id, '_mm_seo_canonical', $value)`
   - `add_og_tags` → `update_post_meta($post_id, '_mm_seo_og', $json)`

3. **Output hooks** in `wp_head`:
   - If `_mm_seo_title` is set, filter `pre_get_document_title`
   - If `_mm_seo_description` is set, output `<meta name="description">`
   - If `_mm_seo_canonical` is set, remove default and output custom
   - If `_mm_seo_og` is set, output OG tags

4. **Confirm back**: After applying, call edge function to mark fix as "applied".

5. **Yoast/RankMath detection**: If a known SEO plugin is active, skip conflicting fixes and mark as "skipped" with a note.

## Dashboard UI Changes (`SeoIssuesList.tsx`)

For each deterministic issue, add a "Fix This" button that:
1. For auto-fixable issues (title, meta desc, canonical, OG): Opens a modal showing the proposed fix value (AI-generated). User can edit and confirm.
2. Calls `seo-fix-command` to queue the fix.
3. Shows status: "Pending" → "Applied" → offers "Verify" button to re-scan.
4. For non-auto-fixable issues (HTTPS, render-blocking scripts): Show as "Manual fix required" with instructions only.

### Fix status badges on issues:
- No fix queued: "Fix This" button
- Pending: Yellow "Pending" badge
- Applied: Green "Applied" badge + "Verify" button
- Verified (re-scanned, issue gone): Green checkmark, issue faded

### Mark as Fixed (manual):
For any issue, allow user to click "Mark as Fixed" which records it in fix history and grays it out until next scan confirms.

## Auto-fixable Issue Map

| Issue ID | Fix Type | Auto-generate value? |
|----------|----------|---------------------|
| title-missing | set_title | Yes (AI) |
| title-too-short | set_title | Yes (AI) |
| title-too-long | set_title | Yes (AI) |
| meta-desc-missing | set_meta_desc | Yes (AI) |
| meta-desc-too-short | set_meta_desc | Yes (AI) |
| meta-desc-too-long | set_meta_desc | Yes (AI) |
| canonical-missing | add_canonical | Yes (page URL) |
| og-tags-missing | add_og_tags | Yes (from title/desc) |
| h1-missing | — | Manual only |
| not-https | — | Manual only |
| render-blocking-scripts | — | Manual only |

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/seo-fix-command/index.ts` | New — queue fixes |
| `supabase/functions/seo-fix-poll/index.ts` | New — plugin polls for pending fixes |
| `supabase/functions/seo-fix-confirm/index.ts` | New — plugin confirms fix applied |
| `mission-metrics-wp-plugin/includes/class-seo-fixes.php` | New — apply fixes, output hooks, poll/confirm |
| `mission-metrics-wp-plugin/mission-metrics.php` | Require new class, register cron |
| `src/components/reports/SeoIssuesList.tsx` | Add Fix buttons, status badges, mark-as-fixed |
| `src/components/reports/SeoFixModal.tsx` | New — preview/edit fix value before applying |
| `src/components/reports/SeoTab.tsx` | Wire fix queue status, verify button |
| Database migration | Create `seo_fix_queue` and `seo_fix_history` tables |

