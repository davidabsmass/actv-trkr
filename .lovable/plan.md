

## FOUNDING30 Promotion Setup

We need to create three Stripe resources and then wire the promo into your checkout flow. Here's what I'll do once approved:

### Step 1: Create Stripe Resources
1. **Create a $45/mo recurring price** on your existing product (`prod_UAfb7YLhPeLL65`)
2. **Create a $15-off forever coupon** (fixed amount, recurring)
3. **Create a `FOUNDING30` promotion code** linked to that coupon

### Step 2: Update Checkout Code
- Update `actv-checkout/index.ts` to add the new $45/mo price ID
- Wire the `FOUNDING30` promo code so it auto-applies or is accepted at checkout
- Update `actv-webhook/index.ts` if needed to handle the new price

### Step 3: Update Landing Page Pricing
- Update `Index.tsx` pricing section to reflect the new $45/mo price (was $49/mo)
- Show the FOUNDING30 discount messaging

No database changes needed. All work is in Stripe API calls + edge function updates.

