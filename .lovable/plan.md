

## Fix: Historical entries not backfilling for livesinthebalance.org

### Root cause

The site is running **plugin v1.6.0**, confirmed by the database (`sites.plugin_version = '1.6.0'`). The v1.6.0 plugin uses the old "fire-and-forget chained batches" approach for backfilling entries — it sends batch 1, then makes a background HTTP request to itself for batch 2, etc. If any link in the chain breaks (which is common on shared hosting), all remaining entries are silently lost.

The v1.6.1 plugin (already built and available for download) uses a **synchronous loop** that processes all entries in a single reliable request. But the site hasn't been updated yet.

Current form counts for livesinthebalance.org:
- School Discipline Survey: 945 leads (likely complete)
- Contact Us Form: 696 leads (likely complete)
- Bill of Rights: 67 leads
- Become an advocator: 24 leads
- Newletter Sign-up: 22 leads
- 2025 Sign up for updates: **3 leads** (likely has many more in WordPress)
- Quick Contact: 0 leads

### Plan

**1. Immediate fix — update plugin on the site**
Download and install plugin v1.6.1 on livesinthebalance.org (from Settings → Plugin). Then click "Sync Entries" on the Forms page. The v1.6.1 synchronous backfill loop will pull all historical entries reliably in one pass.

**2. Server-side improvement — detect old plugin and warn clearly**
In `supabase/functions/trigger-site-sync/index.ts`, after the backfill response comes back, parse the response body. If it contains the old `dispatched_next` format (indicating v1.6.0 or older), add a clear warning telling the user to update:

```
"Your site is running an older plugin version that may not complete large backfills reliably. Please update to the latest plugin version from Settings → Plugin."
```

Also add a minimum version check (v1.6.1) before attempting backfill — if the plugin is too old, skip the backfill entirely and return a clear message instead of silently failing.

**3. Add a version guard for backfill in trigger-site-sync**
- Before calling `triggerWordPressEntryBackfill`, check if the site's `plugin_version` is at least `1.6.1`
- If not, skip the backfill call and add a warning: `"Plugin v{version} does not support reliable entry backfill. Please update to v1.6.1+ from Settings → Plugin."`
- This prevents the misleading "historical data may take a while" message when the backfill will actually fail silently

### Files changed
- `supabase/functions/trigger-site-sync/index.ts` — add version guard and response parsing for backfill

### After deploying
1. Update livesinthebalance.org to plugin v1.6.1
2. Click "Sync Entries" on the Forms page
3. All historical entries should populate within a few minutes

