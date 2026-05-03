---
name: Trial on Connect
description: 7-day trial does NOT start at checkout — Stripe sub is created when first signal arrives. Setup-mode checkout, pending_connection org status.
type: feature
---
# 7-Day Trial-on-Connect Flow

**Why:** Customers shouldn't burn trial days while they're still installing the WP plugin. Trial only starts when they're getting value.

## Flow
1. **Checkout** (`actv-checkout`): `mode: "setup"` — collects + saves a payment method via SetupIntent. NO subscription, NO charge. Metadata carries `pending_price` + `pending_plan`.
2. **Webhook** (`actv-webhook` → `checkout.session.completed`): detects `mode === "setup"`, creates user + org with:
   - `status = 'pending_connection'`
   - `stripe_customer_id` stored on org
   - `pending_plan` stored on org
   - subscriber status = `pending`, mrr = 0
3. **First signal** (`ingest-heartbeat`): when a brand-new site is auto-created, fire-and-forget calls `start-trial-on-connect`.
4. **`start-trial-on-connect`** (idempotent, service-role only): creates Stripe sub with `trial_period_days: 7` + `trial_settings.end_behavior.missing_payment_method = 'cancel'` using the saved default PM. Flips org → `active`, stamps `orgs.first_connected_at`.
5. **Safety net** (`archive-stale-pending-orgs`, daily cron): orgs in `pending_connection` for >30 days get archived. No Stripe action needed (no sub exists).

## Critical Invariants
- **`gateOrgLifecycle` MUST allow `pending_connection`** — otherwise the very first signal that triggers the trial would be 402'd. See `_shared/org-lifecycle-gate.ts`.
- **`useSubscription` MUST treat `pending_connection` as subscribed** — users must be able to access the setup checklist.
- **`start-trial-on-connect` is idempotent** — safe to call repeatedly; no-ops when org status ≠ `pending_connection` or billing_exempt.

## Schema
- `orgs.status` enum value `pending_connection` (added 2026-05-03)
- `orgs.stripe_customer_id text` (parked customer awaiting trial creation)
- `orgs.pending_plan text` (`monthly` | `annual`)
- `orgs.first_connected_at timestamptz` (trial start moment)

## Files
- `supabase/functions/actv-checkout/index.ts`
- `supabase/functions/actv-webhook/index.ts` (checkout.session.completed branch)
- `supabase/functions/ingest-heartbeat/index.ts` (new-site fire-and-forget)
- `supabase/functions/start-trial-on-connect/index.ts`
- `supabase/functions/archive-stale-pending-orgs/index.ts`
- `supabase/functions/_shared/org-lifecycle-gate.ts`
- `src/hooks/use-subscription.ts`
