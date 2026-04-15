

# Comprehensive App Hardening — Findings and Fix Plan

## Issues Found

### From Browser Testing

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | HIGH | "Forms" nav item is stuck as active on every page | `src/components/AppSidebar.tsx` |
| 2 | HIGH | React ref warning: `IconTooltip` in `NotificationBell` can't receive refs | `src/components/ui/icon-tooltip.tsx` |
| 3 | CRITICAL | `STRIPE_WEBHOOK_SECRET` is not in the configured secrets — webhook returns 500 for every Stripe event | Secrets config |

### From Code Review

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 4 | HIGH | `actv-checkout` origin fallback still uses `mshnctrl.lovable.app` | `supabase/functions/actv-checkout/index.ts:45` |
| 5 | HIGH | `increment_invite_use` DB function has no `WHERE use_count < max_uses` guard — race condition not fully fixed | Migration SQL |
| 6 | MEDIUM | Pricing mismatch: Checkout shows $30/mo, Index shows $30/mo, but pricing memory says $49/mo — needs confirmation | `src/pages/Checkout.tsx`, `src/pages/Index.tsx` |
| 7 | MEDIUM | Empty `<p>` tag after login form (line 260) — unused markup | `src/pages/Auth.tsx:260` |
| 8 | LOW | `Checkout.tsx` calls `actv-checkout` (unauthenticated) but `create-checkout` also exists (authenticated) — potential confusion | Two checkout functions |

---

## Implementation Plan

### 1. Fix Forms Nav Active State Bug
The `NavLink` for Forms (`/forms`) is matching `/forms` as active on unrelated routes. This is likely because `react-router-dom`'s NavLink considers `/forms` active when the sidebar renders at paths like `/monitoring` since the `entries` redirect exists. Need to add `end` prop to the NavLink for `/forms`.

### 2. Fix `IconTooltip` Ref Forwarding
`NotificationBell` passes a ref to `IconTooltip` which is a plain function component. Wrap it with `React.forwardRef`.

### 3. Add `STRIPE_WEBHOOK_SECRET` Secret
Use the `add_secret` tool to prompt the user to enter their Stripe webhook signing secret. Without this, the webhook is broken.

### 4. Fix `actv-checkout` Origin Fallback
Change line 45 from `"https://mshnctrl.lovable.app"` to `"https://actvtrkr.com"`.

### 5. Make `increment_invite_use` Atomic
Update the DB function to:
```sql
UPDATE public.invite_codes
SET use_count = use_count + 1
WHERE id = p_invite_id
  AND (max_uses = 0 OR use_count < max_uses);
```
Return a boolean indicating success. Update `redeem-invite` to check the return value.

### 6. Clean Up Auth.tsx Empty Markup
Remove the empty `<p>` tag on line 260.

### 7. Confirm Pricing
Ask the user whether the price is $30/mo or $49/mo to ensure consistency between Stripe prices and UI display.

---

## Technical Details

- **Nav bug root cause**: The `SidebarMenuButton` wrapping `NavLink` for Forms uses `to="/forms"`. React Router's `NavLink` with `isActive` checks if the current path starts with the link path. Since `/forms` is a substring issue — actually, looking at this more carefully, the NavLink should only match exactly. The real issue may be the `entries` redirect (`/entries` → `/forms`). But the screenshot shows Forms active on `/seo`, `/security`, `/monitoring`, `/settings`. Let me look more carefully — this could be a CSS issue rather than a routing one, since the sidebar uses `SidebarMenuButton asChild` which may be applying active styles incorrectly.

- **Webhook impact**: Without `STRIPE_WEBHOOK_SECRET`, every checkout completion, subscription update, and cancellation event from Stripe silently fails. New customers don't get provisioned after payment.

