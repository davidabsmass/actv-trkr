## What's actually happening

Good news — **the dropdown is selecting the correct form**. I checked the database directly and confirmed it.

For "Renew You, Near You" (the form you most likely tried to export):
- 43 leads in the last 30 days
- Last submission: April 15, 2026
- 0 leads in the strict "last 7 days" window — your last batch came in ~15 days ago

The "no form fills in that time period" toast you saw is technically truthful for a 7-day window, but it's misleading because:

1. **The export screen has no "Last 7 days" preset.** You either pick calendar dates or get "All time." If you (or the dashboard hint) led you to expect 7-day data, the date pickers don't enforce that — but if the previous run set a tight range, you can land on an empty window.

2. **More importantly — I found a real bug.** Your most recent export attempt for that form (job `620da457…` at 09:56 UTC today) is stuck in `queued` and never ran. The `process-export` edge function was never invoked successfully for it (no logs, no error, no row count). Six other forms exported in the same batch all succeeded. This one silently hung.

   Root cause: when the client-side `supabase.functions.invoke("process-export")` call fails or times out, the job stays `queued` forever. There's no retry, no cron, no recovery. The user just sees "queued" or, if they navigate away and come back to a fresh attempt, gets confused output.

## Plan

### 1. Fix the silent-stuck-job bug (the actual problem)

- **Mark job `failed` if invocation throws.** In `src/pages/Exports.tsx` `createExport.mutationFn`, when `supabase.functions.invoke("process-export")` returns an error, update the just-inserted job row to `status='failed'` with a clear error message before re-throwing. Today it just throws and leaves a phantom queued row.
- **Add a stale-job sweeper.** In `process-export/index.ts`, when called without a specific `job_id`, also auto-fail any `queued` or `running` jobs older than 5 minutes for the caller's org. That way the next export attempt cleans up zombies.
- **Surface stuck jobs in the UI.** In Export History, show jobs that have been `queued` or `running` for more than 2 minutes with a "Retry" button that re-invokes `process-export` for that `job_id`.

### 2. Fix the "no fills in that period" UX confusion

- **Tell the user *why* it's empty.** When the edge function returns 0 rows, include the date range and total-form lead count in the toast, e.g.:
  > "No submissions for *Renew You, Near You* between Apr 23 – Apr 30. This form has 43 entries in the last 30 days — try widening the date range."
- **Add a "Last 7 days / Last 30 days / Last 90 days / All time" preset row** above the calendar pickers on the form-detail export view. Matches what the rest of the dashboard offers and removes guesswork.
- **Show the form's 7d / 30d count next to the Export button** so the user sees "0 in last 7d · 43 in last 30d" before clicking and can pick the right window.

### 3. One small correctness fix

- The form-detail view's "leads" count (`leadCounts?.[form.id]`) currently includes trashed leads. Add `.neq("status", "trashed")` to match the export's own filter, so the count and the export agree.

## Technical notes

- Files to change: `src/pages/Exports.tsx`, `supabase/functions/process-export/index.ts`.
- The stale-job sweep should be scoped (org-only) and bounded (LIMIT 50) to avoid runaway updates.
- The "Retry" button reuses the existing `job_id` body parameter that `process-export` already accepts — no schema changes needed.
- No DB migration required.

Shall I implement this?