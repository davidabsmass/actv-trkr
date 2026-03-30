

## Fix PDF Page Breaks — Section-Based Capture

### Problem
Both activity report and SEO report PDFs render the entire HTML as a single giant canvas, then use pixel-scanning to find "white gap" rows between sections. This heuristic fails when sections have colored backgrounds, charts, or gradient elements — content gets sliced mid-section and becomes illegible.

### Solution
Switch from single-canvas-with-pixel-scanning to **per-section canvas capture**. Each logical section is captured as its own canvas, then placed onto PDF pages with intelligent overflow handling. If a section won't fit on the current page, it starts on a new page.

### Technical Approach

**1. Mark sections in HTML (`report-pdf.ts` and `seo-pdf.ts`)**
- Add `data-pdf-section` attribute to each top-level section `<div>` in the HTML builders (`buildReportHtml` and `buildSeoHtml`)
- The header, each report section (Executive Summary, Site Health, Growth Engine, etc.), and footer segments each become a discrete PDF section

**2. Replace canvas slicing with per-section capture (`report-pdf.ts`)**
- Instead of capturing the entire container as one canvas, query all `[data-pdf-section]` elements
- Capture each section individually with `html2canvas`
- Track current Y position on the PDF page
- If a section's height exceeds remaining page space, add a new page first
- Add a small gap (3–4mm) between sections for readability
- Remove the `findBreakPoints` pixel-scanning function entirely
- Remove the forced-break / natural-break slicing logic
- For very tall sections (taller than one full page), fall back to proportional slicing within that section only

**3. Same refactor for `seo-pdf.ts`**
- Apply identical per-section capture approach
- The SEO HTML builder already has distinct section blocks — just add `data-pdf-section` to each

**4. Shared helper (optional)**
- Extract the per-section PDF pagination logic into a shared utility if the two files share enough code, or keep inline if simpler

### Files Changed
- `src/lib/report-pdf.ts` — add `data-pdf-section` to HTML sections, replace canvas slicing with per-section capture
- `src/lib/seo-pdf.ts` — same treatment

### What This Fixes
- Charts and colored sections no longer get sliced at arbitrary pixel boundaries
- Each report section starts cleanly, either continuing on the current page or at the top of a new page
- No more illegible content split across pages

