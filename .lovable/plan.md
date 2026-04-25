## Goal

Set honest expectations about how long large form backfills take. Today the copy says "several minutes for large forms" — that misleads anyone with 4,000+ entries (which can legitimately take an hour or more).

## What changes

### 1. Persistent banner on Forms page (`src/pages/Forms.tsx` ~line 749-760)

Update the "Importing historical entries — N forms still syncing" banner so the second line gives a realistic range based on size:

> *Smaller forms (under ~500 entries) usually finish within a few minutes. Larger forms can take **30 minutes to several hours** — we throttle the import so it doesn't overload your WordPress site. Counts below update automatically as entries arrive; you can safely leave this page and come back.*

### 2. Toast shown right after clicking "Sync Entries" (`src/pages/Forms.tsx` line 587)

Replace:
> "Importing historical entries in the background — this may take a few minutes for large forms..."

With:
> *"Import started in the background. Small forms finish in minutes; forms with thousands of entries can take an hour or more. You can leave this page — counts will update automatically."*

### 3. Per-form "IMPORTING X / Y" pill — add tooltip

The pill in the screenshot (`IMPORTING 673 / 4,994`) has no explanation. Add a `title` tooltip on hover:

> *"Importing historical entries from WordPress. Large forms (1,000+ entries) can take 30 minutes to several hours. Progress updates automatically."*

Locate the pill component (likely in `src/pages/Forms.tsx` form list rendering near the activeJobsByForm map ~line 680-702) and wrap with a tooltip.

### 4. Help content (`src/components/support/helpContent.ts`)

Add a short FAQ entry under the Forms section:

> **Why is my form import taking so long?**
> We pull entries from WordPress in small, throttled batches to avoid overloading your site. A form with a few hundred entries usually finishes in 2–5 minutes. A form with several thousand entries can take 30 minutes to several hours. The import resumes automatically and is safe to leave running — you don't need to keep the page open.

## Why these numbers

The current importer (per recent fix) uses `MAX_BATCH_SIZE=100` with adaptive shrinking on errors, polled by the queue processor. At ~100 entries per batch and conservative pacing between batches to be polite to the WP site, **~4,994 entries genuinely takes 1–3 hours** depending on WP response times. So "30 minutes to several hours" is accurate, not a hedge.

## Out of scope (not changing)

- Importer throughput itself — that's a separate perf project; the current pacing is intentional to protect customer WordPress sites
- The "Sync Entries" button behavior — already correct (won't restart in-progress jobs, as confirmed last turn)

## Files touched

- `src/pages/Forms.tsx` — banner copy, toast copy, tooltip on importing pill
- `src/components/support/helpContent.ts` — new FAQ entry

No backend or schema changes. Pure copy + one tooltip wrapper.
