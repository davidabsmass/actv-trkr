

## Problem: MRR and Paid Customers Show $0

### Root Cause

When you refunded 2 of the 3 subscriptions, Stripe fired `customer.subscription.deleted` events. The webhook handler sets `mrr: 0` on deletion (line 285 of `actv-webhook`). Since all 3 checkouts were for the same email, the subscriber record was being updated by whichever event arrived last — and the deletion events zeroed out MRR even though one subscription is still active.

The core issue: **the webhook tracks subscriber state by `stripe_customer_id`, but the MRR value is a simple column that gets overwritten by whichever event fires last**, rather than being derived from the actual active subscription.

### Fix (2 changes)

#### 1. Webhook: Re-derive MRR on deletion events
In `actv-webhook/index.ts`, when handling `customer.subscription.deleted`:
- After marking that specific subscription as churned, query Stripe for any **remaining active subscriptions** for that customer
- If an active subscription still exists, keep the subscriber status as "active" and recalculate MRR from the active subscription's price
- Only set `mrr: 0` and `status: "churned"` if there are truly zero active subscriptions remaining

#### 2. Webhook: Re-derive MRR on checkout completion  
In the `checkout.session.completed` handler, ensure the upsert always writes the current MRR based on the new subscription's plan, overriding any previously zeroed value. This is already done (line 51/69), but the timing issue means a subsequent deletion event can overwrite it.

The real fix is #1 — making the deletion handler smarter about checking for remaining active subs before zeroing MRR.

### Technical Detail

```text
Current flow (broken):
  checkout A → mrr = 30, status = active
  checkout B → mrr = 30 (upsert, same customer)
  checkout C → mrr = 30 (upsert, same customer)
  refund B → subscription.deleted → mrr = 0, status = churned  ← WRONG
  refund C → subscription.deleted → mrr = 0, status = churned  ← overwrites

Fixed flow:
  refund B → subscription.deleted → check Stripe for active subs
           → sub A still active → keep mrr = 30, status = active
  refund C → subscription.deleted → check Stripe for active subs
           → sub A still active → keep mrr = 30, status = active
```

### Files to Edit
- `supabase/functions/actv-webhook/index.ts` — Update `customer.subscription.deleted` handler to check for remaining active subscriptions before zeroing MRR

