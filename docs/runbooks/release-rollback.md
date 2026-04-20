# Release & Rollback Runbook

## Release sequence

1. Bump version in `mission-metrics-wp-plugin/mission-metrics.php` (only place — never edit the other 3 files manually).
2. Add a `## X.Y.Z` block at the **top** of the changelog in `supabase/functions/plugin-update-check/index.ts`.
3. Run `node scripts/plugin-artifacts.mjs`. This regenerates:
   - `public/downloads/actv-trkr-latest.zip`
   - `src/generated/plugin-manifest.ts` (with version + sha256)
   - `supabase/functions/serve-plugin-zip/index.ts`
   - `supabase/functions/plugin-update-check/index.ts` (version + sha256 patched)
4. Verify SECURITY_AUDIT.md status section is current.
5. Tag: `git tag vX.Y.Z && git push --tags` (handled by Lovable's release flow).
6. The release workflow runs:
   - full CI suite
   - `node scripts/plugin-artifacts.mjs` (must be a no-op)
   - ZAP baseline against staging
   - `scripts/check-baseline-shrink.mjs` (PHPStan baseline must not grow)

## What gets verified at install time

- `plugin-update-check` returns `{ version, download_url, signature, signature_alg, signed_at, sha256 }`.
- The plugin verifies the HMAC signature with the embedded `PLUGIN_RELEASE_SIGNING_SECRET` public counterpart (see `class-update-checker.php`).
- After download, the updater computes `sha256(zip)` and compares to the response field. **Mismatch → install refused, error surfaced in WP admin.**

## C-2 phased rollout

| Step | When | What to do |
| --- | --- | --- |
| Ship v1.18.1 | now | Dual-accept window opens. Backend signs every call, plugin accepts both signed and legacy. |
| Monitor `legacy_auth_used` audit events | weekly | Identify any site stuck on `< 1.18.0`. Push them to update. |
| Confirm 0 legacy events for 7 consecutive days | before v1.19.0 | Required gate. |
| Ship v1.19.0 | once gate is green | Plugin rejects legacy hash. Backend stops including the legacy header. |

## Rollback

### Plugin (WP-side)

If a release breaks sites:

1. Edit the changelog in `supabase/functions/plugin-update-check/index.ts` to **remove the bad `##` block** at the top — the function picks the latest `##` it finds.
2. Run `node scripts/plugin-artifacts.mjs` and commit. Within 12 hours every site auto-update will see the previous version as "latest" and stop offering the bad one.
3. For sites already on the bad version, push a hotfix as `X.Y.Z+1` rather than trying to downgrade — WP does not auto-downgrade.

### Edge function

1. Lovable Cloud → Functions → pick the function → "Versions" → redeploy the previous version.
2. Verify in `supabase--edge_function_logs` that the prior code is live.

### Database migration

Migrations are forward-only. To roll back schema changes:

1. Write a new migration that reverses the change (e.g., `DROP COLUMN`).
2. Deploy it as a new migration. Never edit the original file.

### Stripe webhook poisoning

If a webhook handler corrupts state:

1. The `processed_stripe_events` table is the source of truth for what was processed. Query it to find the events you want to "unmark".
2. Delete the offending rows: `DELETE FROM processed_stripe_events WHERE event_id IN (...)`.
3. Replay from the Stripe dashboard (`Developers → Webhooks → resend`).

## Escalation

- Plugin: bug-report channel + `wp actv-trkr log` on affected sites.
- Backend: edge-function logs in Lovable Cloud.
- Billing: cross-reference `billing_recovery_events` and `processed_stripe_events`.
