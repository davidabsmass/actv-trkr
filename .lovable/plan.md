

## Diagnosis

You're right -- the site is running **v1.3.7**, not 1.3.5. I confirmed:

- The update endpoint is **live and working** -- it correctly reports `has_update: true` for v1.3.7, with download URL pointing to the v1.3.8 zip.
- The v1.3.8 zip is being served correctly with the expanded Avada multi-column discovery code.
- The problem: **v1.3.7's Avada discovery is too limited** -- it can only match entries via a single `form_id` column, and your Avada DB likely stores the form reference in a different column (like `fusion_form_id` or `post_id`). That's why it returns 0 entries, triggering the safety guard.

The sync logic itself (in the app) is working correctly. When it calls WordPress, WordPress responds, but the v1.3.7 plugin code reports 0 Avada entries because it can't find them. The backend then correctly blocks reconciliation to avoid mass-trashing.

## What needs to happen

**The only fix is getting v1.3.8 installed on WordPress.** The v1.3.8 code searches 5 different form-ref columns and 6 blob columns to find Avada entries -- that's the entire point of the update.

WordPress auto-updaters **only show a notice** in wp-admin -- they never silently install. So you need to do one of:

1. Go to **WordPress Admin → Plugins** and click "Update Now" next to ACTV TRKR (the notice should be showing)
2. Or download v1.3.8 from **Settings → Plugin** in the dashboard and upload it manually

## Code changes (to make this less painful going forward)

1. **Add a persistent "Update Available" banner** on the Forms page when `sync_status` is `partial` or `blocked` with a direct "Download v1.3.8" button right there -- no navigating to Settings.

2. **Add a "Download Latest Plugin" button** directly in the sync error/warning toast, so the user can act immediately.

3. **Show the currently-detected plugin version** on the Forms page header so there's no ambiguity about what's running.

### Files to edit
- `src/pages/Forms.tsx` -- add persistent update banner with download button, show detected plugin version

