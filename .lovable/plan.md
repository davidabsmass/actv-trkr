

## Speed Optimization Plan

Two targets: faster AI chat replies and faster Sync Entries UX.

---

### Problem 1: Sync Entries is Slow

The `trigger-site-sync` edge function is doing too much sequentially:

1. Tries WordPress sync endpoint (wp-json path), waits for timeout/404
2. Falls back to ?rest_route= path, waits again
3. Runs `runDirectFormChecks` which fetches each form's page URL over HTTP (sequential)
4. Runs 3-4 sequential Supabase queries for Avada lead counting
5. Optionally calls WordPress backfill endpoint (another HTTP roundtrip)

Right now the WordPress site is returning 404 on both sync routes (plugin crashed or inactive from the v1.3.24 issue), so every sync attempt burns ~20-30 seconds on failed HTTP calls before falling back.

### Problem 2: UI Gives No Feedback During Sync

The "Sync Entries" button shows a spinner but no progress. User has no idea if it's working or stuck.

---

### Fix 1: Add Timeouts and Parallelize Backend (trigger-site-sync)

**File**: `supabase/functions/trigger-site-sync/index.ts`

- Reduce WordPress HTTP timeout from default to 8 seconds (currently no explicit timeout on fetch calls)
- Run WordPress sync call and Avada lead counting queries in parallel (they don't depend on each other for the initial check)
- Skip `runDirectFormChecks` when WordPress sync succeeds (it currently always runs)
- Add `AbortController` with 8s timeout on WordPress fetch calls

### Fix 2: Add Progress Feedback to Sync Button

**File**: `src/pages/Forms.tsx`

- Show elapsed time on the sync button ("Syncing… 5s")
- Add a 30-second client-side timeout with a warning toast if exceeded
- Show per-site results as they complete (not wait for all)

### Fix 3: Fix the Actual Blocker — Plugin Not Responding

**File**: `supabase/functions/serve-plugin-zip/index.ts`

The edge function logs show the WordPress site returns `rest_no_route` for both sync endpoints. This means the plugin is either:
- Not installed (user needs to reinstall after the v1.3.24 crash)
- Installed but the REST route registration crashed

The `class-forms.php` in the distributed ZIP has a syntax error at line 1950 — the `parse_avada_csv_format` method is missing its closing brace and `return` statement before the debug endpoint method starts. This is causing a PHP fatal error that prevents the REST routes from registering.

Fix the PHP structure in the generated `class-forms.php` so the method properly closes before the debug endpoint begins.

### Fix 4: Reduce WordPress Fallback Penalty

**File**: `supabase/functions/trigger-site-sync/index.ts`

When WordPress returns 404 on the first endpoint, immediately try the fallback. If both fail within 5 seconds total (not 10+ sequential), return the fallback result faster.

---

### Summary

| Step | File | What | Impact |
|------|------|------|--------|
| 1 | `trigger-site-sync/index.ts` | 8s timeout + parallel queries | Cuts worst-case from 30s to ~10s |
| 2 | `Forms.tsx` | Elapsed timer + 30s client timeout | User knows what's happening |
| 3 | `serve-plugin-zip/index.ts` | Fix PHP syntax in distributed plugin | Fixes root cause (404s) |
| 4 | `trigger-site-sync/index.ts` | Parallel WordPress endpoint attempts | Cuts fallback time in half |

