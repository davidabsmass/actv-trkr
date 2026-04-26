# Surface Unread Support Replies on the Dashboard

When ACTV TRKR support replies to a customer ticket, call it out on their dashboard until they click through to read it.

## What the user will see

1. **Dashboard banner** (top of `/dashboard`, above KPIs): an attention-grabbing banner appears whenever there are 1+ unread admin replies on the org's tickets.
   - Single ticket: "Support replied to your ticket #1234 — *<subject>*" with a "View reply" button.
   - Multiple tickets: "You have N new replies from support" with a "View tickets" button.
   - Banner uses the existing `warning`/accent styling (matches `GetStartedBanner`/`FirstSyncBanner` look).
2. **Header bell dot**: the existing `NotificationBell` red dot also lights up when unread support replies exist (so the indicator is consistent app-wide).
3. **Auto-dismiss**: opening the ticket detail (`/account?tab=support&ticket=<id>`) marks that ticket's admin messages as read. The banner disappears once all are read. No manual "dismiss" — clicking through is the only way to clear it (per the request).

## How "unread" is tracked

Add a lightweight per-user read marker on tickets:

- New table `support_ticket_reads (user_id uuid, ticket_id uuid, last_read_at timestamptz, PRIMARY KEY (user_id, ticket_id))` with RLS so a user can only read/write their own rows.
- A ticket has unread admin messages for the current user when:
  `EXISTS (admin message in support_ticket_messages where created_at > coalesce(last_read_at, ticket.created_at) AND is_internal = false AND author_type = 'admin')`
  AND the user is the ticket submitter (or an org admin who can see it).
- Helper SQL view `v_my_unread_support_replies` returns `{ ticket_id, ticket_number, subject, latest_admin_reply_at, unread_count }` for `auth.uid()`, scoped to tickets the caller can see (uses existing RLS on `support_tickets` + `support_ticket_messages`).

Marking-as-read happens client-side when `TicketDetail` mounts: upsert `support_ticket_reads` with `last_read_at = now()` for `(auth.uid(), ticket_id)`. Then invalidate the dashboard query so the banner clears immediately.

## Files

**Migration (new)**
- `support_ticket_reads` table + RLS (`select/insert/update` only where `user_id = auth.uid()`).
- View `v_my_unread_support_replies` (security_invoker, leverages existing ticket RLS).

**Frontend (new)**
- `src/components/dashboard/SupportReplyBanner.tsx` — fetches the view, renders banner if rows > 0, links to `/account?tab=support` (multi) or `/account?tab=support&ticket=<id>` (single). Uses `useQuery` with 30s refetch + `notification_inbox`-style realtime subscription on `support_ticket_messages`.
- `src/hooks/use-unread-support-replies.ts` — shared hook returning `{ count, tickets }` so both the banner and the bell can consume it.

**Frontend (edited)**
- `src/pages/Dashboard.tsx` — render `<SupportReplyBanner />` directly under the existing `<GetStartedBanner />`.
- `src/components/support/SupportSection.tsx` — inside `TicketDetail`, on mount call the upsert to `support_ticket_reads` and invalidate `["unread_support_replies"]`.
- `src/components/NotificationBell.tsx` — combine existing `notification_inbox` unread count with `useUnreadSupportReplies` so the red dot also reflects unread support replies.

## Out of scope

- No email-style "mark as unread" toggle.
- Admin-side UI is unchanged (admins continue using `SupportInbox`).
- No banner on pages other than `/dashboard` (the bell already covers app-wide visibility).
