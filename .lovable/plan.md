

## Fix: Forms not pulling all historical entries

### Problem
The backfill process chains batches of 5 entries via fire-and-forget HTTP requests to itself. For a form with 849 entries, that requires ~170 chained requests. If any single link in the chain fails (network hiccup, PHP timeout, slow response), all remaining entries are silently lost. This is why some forms show partial data (e.g., 147 out of 849).

### What stays the same
The form discovery, parsing, field mapping, and ingestion logic are untouched. The same `ingest-form` endpoint processes each entry exactly as it does today.

### What changes
Increase the batch size from 5 to 50 entries per batch, reducing the number of chain links from ~170 to ~17. Fewer links means far fewer opportunities for the chain to break.

### Files to modify

**1. `supabase/functions/serve-plugin-zip/plugin-template/includes/class-forms.php`**
- Change default `page_size` from `5` to `50`
- Raise the cap from `min(10, ...)` to `min(100, ...)`

**2. `mission-metrics-wp-plugin/includes/class-forms.php`**
- Same batch size changes as above

**3. Version bump to 1.6.0** across:
- `supabase/functions/serve-plugin-zip/plugin-template/mission-metrics.php`
- `mission-metrics-wp-plugin/mission-metrics.php`
- `supabase/functions/serve-plugin-zip/plugin-template/readme.txt`
- `mission-metrics-wp-plugin/readme.txt`
- `supabase/functions/plugin-update-check/index.ts`
- `src/lib/plugin-download.ts`

### After deploying
Update the plugin to v1.6.0 on the Apyx Medical site, then click "Sync Entries." The backfill will now process 50 entries per batch instead of 5, completing the full history reliably.

