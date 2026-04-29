## Move White Label to Reports + fix six PDF export bugs

One pass: relocate White Label to the Reports page where it belongs, then fix all six PDF issues uncovered while investigating.

### 1. Move White Label tab to Reports page

- `src/pages/Reports.tsx` — add fifth top-level tab: `[ Overview ] [ Activity Reports ] [ Customize ] [ White Label ] [ Archives ]`. New `<TabsContent value="white-label">` mounts the existing `<WhiteLabelSection />` unchanged. URL syncs as `?reportTab=white-label`.
- `src/pages/Settings.tsx` — remove the White Label tab + import. Add a small effect: if `?tab=white-label` is detected, `navigate("/reports?reportTab=white-label", { replace: true })` so old links keep working.
- No DB / RLS / `WhiteLabelSection.tsx` changes — the component is org-scoped via `useOrg()` and works wherever it's mounted.

### 2. Fix: client logo not appearing on PDF

**Root cause:** the `client-logos` Storage bucket is `public = false` (verified via DB). `getPublicUrl()` still returns a URL, but the PDF builder's `<img src>` request 403s, so the logo silently never paints.

**Fix:** migration to make the bucket public + add a public-read RLS policy. Logos are non-sensitive brand assets; writes stay restricted to authenticated org admins via existing policies.

```sql
update storage.buckets set public = true where id = 'client-logos';
create policy "Public read on client-logos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'client-logos');
```

Also harden `src/lib/report-pdf.ts` and `src/lib/seo-pdf.ts`: before calling `renderSectionsToPdf`, explicitly await `img.decode()` on every `<img>` inside the hidden container so html2canvas captures a fully-loaded logo (current `setTimeout(150)` is insufficient for remote images).

### 3. Fix: white dot in PDF header

`src/lib/report-pdf.ts` line 130 and the matching span in `src/lib/seo-pdf.ts` hardcode a 4×4 white circle between brand name and "Activity Report". Remove both spans. Existing `gap:6px` on the parent flex preserves spacing.

### 4. Fix: Goal Conversions toggle ignored on re-export

**Root cause:** Two issues stacked.

(a) `Reports.tsx:381` reads `(tplResult.data as any)?.sections_config || null` — the `||` collapses any falsy value (including a fresh template that legitimately has all sections off → `[]` truthy, but `null` from no row → "all enabled" via `isSectionEnabled`'s default).

(b) More importantly, the template **load** in `ReportTemplateBuilder.tsx:169` does not order or limit, while the **download** path (`Reports.tsx:378`) does `.order("created_at", desc).limit(1)`. If a user has multiple template rows for the same `(user_id, org_id)` (which currently has no unique constraint), the builder edits row A and the downloader reads row B. Toggle never applies.

**Fix:**
- Align `ReportTemplateBuilder.tsx` load query to `.order("created_at", { ascending: false }).limit(1).maybeSingle()`.
- Migration: dedupe and add unique constraint:
```sql
delete from report_custom_templates a using report_custom_templates b
where a.user_id = b.user_id and a.org_id = b.org_id
  and a.created_at < b.created_at;
alter table report_custom_templates
  add constraint report_custom_templates_user_org_unique unique (user_id, org_id);
```
- `Reports.tsx:381` — change `|| null` to `?? null` so `[]` is preserved.

### 5. Fix: wrong fonts on the last page

**Root cause:** every report section is rendered as an image (html2canvas captures the hidden DOM in `'BR Omega', 'Segoe UI', system-ui'`). But the **footer** on every page — and specifically the only text-rendering on the last page beyond captured sections — is drawn by `jsPDF.text()` directly (`report-pdf.ts:382-399`), which uses jsPDF's built-in Helvetica. The mismatch is most visible on the last page where the footer is the dominant element.

**Fix:** explicitly call `doc.setFont("helvetica", "normal")` is fine — the real fix is to make the **section HTML** use the same web-safe stack the footer falls back to, so they look consistent on every page. Change the root `font-family` in `report-pdf.ts:125` and `seo-pdf.ts` to `"Helvetica, Arial, 'Segoe UI', sans-serif"` (drop `'BR Omega'` which isn't loaded inside html2canvas's offscreen render anyway). Result: captured sections + jsPDF footer all read as the same sans-serif family.

### 6. Fix: misleading "Key Win — Leads increased 100%" with insufficient history

**Root cause:** `supabase/functions/process-report/index.ts:313` blindly reports `pctChange(totalLeads, prevTotalLeads)` whenever it's positive. With a fresh install, `prevTotalLeads` is often 0 or 1, so any current value produces a misleading "+100% / +∞%" headline. Per memory `[Org Age Awareness]`, WoW comparisons must be suppressed when the install lacks adequate history — same principle applies here.

**Fix in `process-report/index.ts`:**
- Compute `installAgeDays` from the org's earliest signal (or `org.created_at` as fallback).
- Compute `previousPeriodCoverage` = how many of `actualDays` the install actually existed for (clamp to 0 when install is younger than `periodStart - actualDays`).
- Add a guard: only emit a `%`-based Key Win if **both** of these hold:
  - `previousPeriodCoverage >= actualDays` (i.e., the install was alive for the full prior comparison window), AND
  - `prevTotalLeads >= 5` (avoid silly small-sample percentages like "1 → 2 = +100%").
- When the guard fails, fall back to absolute language: `"Captured ${totalLeads} leads in your first ${actualDays} days"` or `"Stable performance maintained"` if there's nothing notable.
- Same guard applies to `keyRisk` so we don't manufacture a fake "lead volume declined" alarm when prev period was 0 or partial.

### Files touched

- `src/pages/Reports.tsx` — White Label tab + `?? null` fix
- `src/pages/Settings.tsx` — remove tab + legacy redirect
- `src/lib/report-pdf.ts` — remove white dot, swap font stack, await image decode
- `src/lib/seo-pdf.ts` — same font + dot + image fixes
- `src/components/reports/ReportTemplateBuilder.tsx` — align template load query
- `supabase/functions/process-report/index.ts` — install-age guard on Key Win/Risk
- New migration: public `client-logos` bucket + read policy; dedupe `report_custom_templates` + unique constraint

### Acceptance

- Reports page shows White Label tab; Settings no longer does; old `?tab=white-label` redirects
- After uploading a logo and exporting, the logo renders in the gradient header
- No white dot between brand and "Activity Report"
- Toggling Goal Conversions OFF in Customize → re-downloading existing run → PDF has no Goal Conversions section
- Footer text font matches the body sections on every page including the last
- A new install (no prior period data) shows Key Win as `"Captured X leads in your first N days"` not `"Leads increased 100%"`. An established org with ≥5 prior leads still gets the percentage callout
- No regressions in Activity Reports / Customize / Archives / Overview tabs