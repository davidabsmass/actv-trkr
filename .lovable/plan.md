
The user is right to question this. Let me think about MRR semantics and what's actually happening.

**MRR semantics:**
- Churned subscribers should contribute $0 to MRR (they're not paying anymore).
- Subscribers with a 100% forever discount should contribute $0 (they're paying nothing).
- The MRR column on each row should reflect what THAT subscriber contributes monthly.

**Why all rows show $45:**
Looking at the recalc function — it pulls `stripe_subscription_id` and recomputes from Stripe. But:

1. **Churned subscribers**: Their `stripe_subscription_id` may still point to a (now-canceled) subscription. The recalc function doesn't check status — it just retrieves the sub and computes the price. A canceled sub still has `unit_amount: 4500`, so we write $45 back even though they're not paying.

2. **100% discount subscribers**: Looking at `computeMrrFromSubscription`, it does handle `percent_off` and `amount_off`. BUT — Stripe stores the active discount on `subscription.discount` only in older API versions. In API `2025-08-27.basil`, discounts moved to `subscription.discounts[]` (an array of discount IDs that need expanding). The code reads `sub.discount?.coupon` which is likely `undefined` in this API version → no discount applied → full $45.

3. The recalc only filters `not("stripe_subscription_id", "is", null)` — it processes churned rows too and overwrites their MRR with the list price.

**The fix:**

1. **Update `computeMrrFromSubscription`** in both `recalc-subscriber-mrr` and `actv-webhook` to:
   - Read discounts from the new `subscription.discounts[]` array (expand them to get coupon details).
   - Fall back to legacy `sub.discount` for safety.

2. **Respect subscription status in recalc**:
   - If `stripeSub.status` is `canceled` / `incomplete_expired` → set MRR to 0.
   - If subscriber row's `status` is `churned` → force MRR to 0 regardless of Stripe.

3. **Re-run Recalc MRR** after deploying — the four affected rows should then show:
   - 2 churned → $0
   - 2 with 100% lifetime discount → $0
   - Everyone else → correct discounted amount.

**Files to edit:**
- `supabase/functions/recalc-subscriber-mrr/index.ts` — fix discount parsing + zero out churned/canceled.
- `supabase/functions/actv-webhook/index.ts` — same discount-parsing fix so future events compute correctly.

**After deploy:** Click **Recalc MRR** again and verify the 4 rows drop to $0 and the dashboard MRR total decreases by $180.

**Answer to your question:** You're not misunderstanding — MRR should be $0 for both churned and 100%-discount subscribers. The current code is wrong on both counts. The bug is that (a) the Stripe API version we use returns discounts in `discounts[]` not `discount`, and (b) the recalc doesn't zero out canceled subs.
