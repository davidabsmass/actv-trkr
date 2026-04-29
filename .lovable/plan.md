## Grace period — answer

Yes. When someone cancels their ACTV TRKR plan, the org auto-enters the 30-day grace period:

- The `actv-webhook` function listens for Stripe's `customer.subscription.deleted` event.
- It calls `set_org_lifecycle_status(p_status='grace_period')`, which sets `orgs.status='grace_period'` and stamps `grace_period_ends_at = now() + 30 days`.
- The daily `billing-state-manager` job sends the cancellation email immediately, a 5-day-out warning at day 25, flips the org to `archived` when the 30 days expire, then sends a final notice ~50 days into archive.
- Tracking is paused via `gateOrgLifecycle` the moment the org leaves `active` (ingest endpoints return 402 with the grace-period payload).
- Owner accounts and `billing_exempt = true` orgs are skipped — they never enter grace.

So the answer is **yes — cancellation = automatic 30-day grace before archive, fully automated.** No admin action needed.

---

## Invite tracking + Resend / Cancel

### Current state
- `add-org-member` already inserts an `org_users` row with `status='active'` and writes a `team_audit_log` entry — so a record exists, but the UI treats invitees and accepted members identically.
- There's no resend action, no cancel action, and no visible "pending" state.
- `org_users` has a `status` column (currently always `'active'`) we can repurpose to mark unaccepted invites.

### Changes

**1. Schema migration (`org_users` + audit)**
- Add `org_users.invited_at timestamptz` and `org_users.invite_accepted_at timestamptz`.
- Allow `status` to be `'invited'` or `'active'` (text, no CHECK — keep flexible).
- Add a trigger on `auth.users` login (or a lightweight SECURITY DEFINER RPC `mark_invite_accepted`) that flips the matching `org_users` row to `status='active'` + `invite_accepted_at=now()` the first time the invitee signs in.
- Index on `(org_id, status)`.
- Add audit actions `invite_resent` and `invite_cancelled` (text values — `team_audit_log.action` is unconstrained).

**2. `add-org-member` edge function**
- For newly created users: insert with `status='invited'`, `invited_at=now()`.
- For existing users already on the platform but new to the org: still `status='active'` (no recovery link needed).
- Audit log unchanged otherwise.

**3. New edge function: `manage-org-invite`**
- Action `resend`: admin-only. Looks up the pending `org_users` row, regenerates the recovery link via `auth.admin.generateLink`, re-sends the `team-invite` template, refreshes `invited_at`, writes `invite_resent` audit entry. Rate-limit to once per 60 seconds per invite.
- Action `cancel`: admin-only. Deletes the pending `org_users` row (only if `status='invited'`). Writes `invite_cancelled` audit entry. Does NOT delete the underlying auth user (they may have other orgs).

**4. `TeamSection.tsx` UI**
- Add a "Pending invitations" sub-section above the active members list when any rows have `status='invited'`.
- Each pending row shows: email, role, invited X ago, and two buttons: **Resend** and **Cancel**.
- Active members list filters out `status='invited'` rows.
- Both actions invalidate `org_members` + `team_audit_log` queries; audit log already shows the new actions automatically.
- Replace the bottom helper text with: "New invitees receive a one-time link to set their password. You can resend or cancel a pending invite at any time."

**5. Login hook**
- Add a small client-side call from `useAuth` (after a successful sign-in) to `mark_invite_accepted` RPC, which flips any of the user's `org_users` rows from `invited` → `active`. Idempotent.

### Out of scope
- No invite-link expiration enforcement (Supabase recovery links already expire on their own — Resend regenerates).
- No bulk invite, no email change for a pending invite (cancel + reinvite covers it).
- Existing `team_audit_log` schema is sufficient — no changes needed.