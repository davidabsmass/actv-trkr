

## Cancellation Email and Runtime Error Fix

### Problem
1. Currently, when a subscriber cancels and the `customer.subscription.deleted` webhook fires, no email is sent — the system just updates the database status to "churned."
2. There is a runtime error in `FeatureUsageWidget` on AdminSetup — `.length` called on undefined data before the query resolves.

### Plan

**1. Fix runtime error in AdminSetup.tsx**
- In `FeatureUsageWidget`, the `featureUsage.features.length` check at line 91 can crash if the query returns data in an unexpected shape. Add a safe guard so `.features` defaults properly.

**2. Create a cancellation email template**
File: `supabase/functions/_shared/transactional-email-templates/subscription-cancelled.tsx`
- Uses the standard logo header (not the full-width astronaut banner, per branding rules).
- Subject: "Your ACTV TRKR subscription has been cancelled"
- Body content:
  - "Hi {name}," (falls back to "Hi there,")
  - Confirms the subscription has been cancelled
  - States clearly: **"We'll keep your data for 30 days. After that, your account and all associated data will be permanently removed."**
  - Offers a way to reactivate: "If you change your mind, simply log back in and resubscribe before the 30-day window closes."
  - Sign-off from The ACTV TRKR Team
- Matches existing welcome email styling (Indigo buttons, Navy headings, same font stack).

**3. Register the template in registry.ts**
- Import and add `'subscription-cancelled'` to the `TEMPLATES` map.

**4. Send the email from the webhook**
File: `supabase/functions/actv-webhook/index.ts`
- In the `customer.subscription.deleted` handler, after marking the subscriber as "churned," look up the subscriber's email from the `subscribers` table and invoke `send-transactional-email` with:
  - `templateName: 'subscription-cancelled'`
  - `recipientEmail`: the subscriber's email
  - `idempotencyKey`: `subscription-cancelled-{stripe_subscription_id}`
  - `templateData`: `{ name }` from the subscriber/profile record

**5. Deploy edge functions**
- Deploy `send-transactional-email` (picks up new template) and `actv-webhook` (picks up the send call).

### Files changed
- `supabase/functions/_shared/transactional-email-templates/subscription-cancelled.tsx` (new)
- `supabase/functions/_shared/transactional-email-templates/registry.ts`
- `supabase/functions/actv-webhook/index.ts`
- `src/pages/AdminSetup.tsx` (runtime error fix)

