I agree: the large forms are still processing, not stuck. The current live state shows two active `livesinthebalance.org` jobs still advancing, with host rate-limit backoffs. The real problem is that the system can leave older jobs in a terminal `failed`/`error` state after repeated transient failures or plugin-route issues. That is what must be eliminated.

Plan to fix this:

1. Treat imports as recoverable until the source form is actually unavailable
   - Stop leaving a normal historical import permanently “stuck” or “failed” after transient problems.
   - Convert repeated timeout/rate-limit/partial-batch failures into scheduled retries with longer backoff, not terminal failure.
   - Only mark an import as blocked when the WordPress plugin route/form is genuinely unavailable after a fresh discover/count check.

2. Add a self-healing retry path for old failed jobs
   - Update the watchdog so it also reviews failed/error import jobs.
   - If the form still exists and has missing entries, automatically create/resume a pending import job.
   - Preserve the cursor/progress where safe; reset the cursor only when the previous cursor is stale or the plugin says pagination ended too early.

3. Fix progress accounting for imports that are clearly moving
   - The Forms page already reads job progress (`total_processed / total_expected`), which is why the large forms show movement.
   - Update backend integration totals more frequently during active jobs so admin/settings health views don’t show misleading `0 imported` while the job is actually at `865 / 4,994` or `1,126 / 1,313`.

4. Replace “stalled” user-facing language with “waiting / retrying / still importing”
   - In normal UI, show:
     - “Importing” when batches are running.
     - “Waiting, retrying automatically” when rate-limited or backed off.
     - “Needs attention” only when the source plugin/form is truly unavailable.
   - Remove alarming “stalled” labels from customer-facing areas unless it is an admin/debug-only health state.

5. Improve queue fairness without interrupting active imports
   - Make the queue pick smaller pending jobs first when multiple jobs are ready.
   - Keep active large jobs resumable and chunked; clicking Sync Entries again should not restart them.

6. Add a manual safety action for administrators
   - Add/adjust an admin repair action to trigger the watchdog/queue and clear recoverable failed jobs.
   - This gives us a controlled “repair imports now” path without asking customers to restart from scratch.

Technical details:

```text
Current issue
- Large active jobs: pending/running with recent heartbeat and increasing total_processed.
- Older jobs: failed after max retries, even when the correct behavior should be auto-retry or re-discover.

Target behavior
- transient error -> pending retry with backoff
- repeated transient error -> longer backoff, still auto-resume
- plugin route/form unavailable -> blocked/needs attention with clear explanation
- missing entries + no active job -> watchdog creates/resumes a job
- progress checkpoint -> job totals and integration totals stay aligned
```

Files/functions to update after approval:
- `supabase/functions/process-import-queue/index.ts`
- `supabase/functions/form-import-watchdog/index.ts`
- `supabase/functions/manage-import-job/index.ts`
- `src/pages/Forms.tsx`
- `src/components/settings/FormImportPanel.tsx`
- `src/components/admin/ImportHealthPanel.tsx`
- a database migration if a new non-terminal status such as `blocked` or repair metadata is needed

Validation after implementation:
- Confirm current large jobs still show as active and do not restart.
- Confirm failed recoverable jobs are picked back up by the watchdog or converted to clear “needs attention” only if the plugin/form is unavailable.
- Confirm customer UI no longer says “stuck” for jobs that are retrying/backing off.
- Confirm Sync Entries remains idempotent: it should not restart an already-running import.