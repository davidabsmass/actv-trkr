

# Onboarding Process Audit — Findings and Fix Plan

## Flow Map

There are **3 separate entry paths** into the product:

```text
Path A: Checkout → Stripe → actv-webhook creates account → CheckoutSuccess → Auth (set password) → Dashboard
Path B: /auth (signup tab) → email OTP verify → Onboarding (create org) → Dashboard  
Path C: /signup → creates account + org + API key in one shot → Dashboard
```

---

## Issues Found

### 1. CRITICAL — Signup page bypasses email verification
**File:** `src/pages/Signup.tsx` (lines 39-49)
**Issue:** After `signUp()`, the code immediately calls `signInWithPassword()`. If email confirmation is **not** auto-confirmed, this will fail because the user hasn't verified their email yet. If it **is** auto-confirmed, this bypasses the OTP flow that `/auth` enforces — inconsistent security posture.
**Impact:** Either the signup page is broken (if confirmations are required) or it's a security hole (if they're not).
**Fix:** Remove the immediate `signInWithPassword` call. After signup, redirect to the OTP panel or show a "check your email" message, consistent with the `/auth` flow.

### 2. HIGH — Signup page creates org without subscription check
**File:** `src/pages/Signup.tsx` (lines 51-78)
**Issue:** The Signup flow creates an org, generates an API key, and registers a site — all before the user has paid. The user then navigates to Dashboard (`/`) which, via `ProtectedRoute`, checks subscription status. But the org and API key already exist. If the user never pays, they have a dangling org and working API key.
**Impact:** Free-tier abuse — users can generate valid API keys without subscribing.
**Fix:** Either remove `/signup` entirely (the primary flow is Checkout → webhook provisioning) or add a subscription check before org creation.

### 3. HIGH — Duplicate signup paths cause inconsistent state
**Files:** `src/pages/Signup.tsx`, `src/pages/Auth.tsx`, `supabase/functions/actv-webhook/index.ts`
**Issue:** Three independent code paths each create users, orgs, and API keys with different logic:
- `/signup` creates org + API key client-side
- `/auth` (signup tab) creates user, expects org creation at `/onboarding`
- `actv-webhook` creates user + org + API key server-side after Stripe payment
**Impact:** Missing site_settings, missing compliance mode, inconsistent org naming, some users get welcome emails and some don't.
**Fix:** Consolidate. The canonical path should be Checkout → webhook. Remove or redirect `/signup` to `/checkout`. Keep `/auth` for login + invite-only signups.

### 4. MEDIUM — Onboarding page doesn't save compliance mode
**File:** `src/pages/Onboarding.tsx` (lines 191-234)
**Issue:** The user selects a compliance mode (EU/US or Global Strict) but the value is never persisted. `complianceMode` is local state only — it's never written to `site_settings` or any database table.
**Impact:** User thinks they configured compliance but it has no effect.
**Fix:** Save `complianceMode` to `site_settings` alongside `onboarding_completed`.

### 5. MEDIUM — Onboarding org name input has white text on white background
**File:** `src/pages/Onboarding.tsx` (line 260)
**Issue:** The input uses `bg-white` (white background) with `text-foreground` which in the dark theme is white/light text. The form sits on a `bg-background` page.
**Impact:** In the dark theme, the input text is invisible or barely readable.
**Fix:** Use the standard themed input styling (`bg-secondary text-foreground` or similar).

### 6. MEDIUM — "Continue to Checkout" after onboarding may create double-billing
**File:** `src/pages/Onboarding.tsx` (line 235)
**Issue:** After creating an org, the user is directed to `/checkout`. But if they arrived via the `actv-webhook` flow (Stripe → account creation → set password → login → lands at onboarding because org already exists), they've already paid. The redirect to checkout would try to charge them again.
**Impact:** Users who paid via Stripe and then hit onboarding see a second checkout prompt.
**Fix:** Check subscription status before showing the checkout CTA. If already subscribed, show "Go to Dashboard" instead.

### 7. LOW — Signup page `AuthRoute` allows authenticated users to reach it
**File:** `src/App.tsx` (line 152)
**Issue:** `AuthRoute` wrapping `/signup` redirects authenticated+subscribed users to dashboard, but authenticated+unsubscribed users can still access it. They could create a second org.
**Impact:** Edge case for multi-org abuse.

### 8. LOW — CheckoutSuccess page is fully static with no session validation
**File:** `src/pages/CheckoutSuccess.tsx`
**Issue:** Anyone can visit `/checkout-success` directly — it shows the "You're in!" message without validating that a checkout actually completed.
**Impact:** Cosmetic only, but confusing if bookmarked or shared.

---

## Implementation Plan

1. **Remove `/signup` route** — redirect to `/checkout` (the canonical entry point). This eliminates issues #1, #2, #3, and #7 in one change.

2. **Save compliance mode in Onboarding** — write `complianceMode` to `site_settings` when the org is created (fix #4).

3. **Fix Onboarding input styling** — change from `bg-white` to `bg-secondary` for dark theme compatibility (fix #5).

4. **Add subscription-aware CTA in Onboarding** — check if already subscribed; if yes, show "Go to Dashboard" instead of "Continue to Checkout" (fix #6).

5. **Validate session on CheckoutSuccess** — check `session_id` query param against Stripe or at minimum check auth state (fix #8).

---

## Summary

| # | Severity | Issue |
|---|----------|-------|
| 1 | CRITICAL | Signup bypasses email verification |
| 2 | HIGH | Signup creates org without payment |
| 3 | HIGH | 3 duplicate signup paths with inconsistent logic |
| 4 | MEDIUM | Compliance mode selection not persisted |
| 5 | MEDIUM | White-on-white input text in dark theme |
| 6 | MEDIUM | Double-checkout risk for webhook-provisioned users |
| 7 | LOW | Authenticated unsubscribed users can reach /signup |
| 8 | LOW | CheckoutSuccess has no validation |

