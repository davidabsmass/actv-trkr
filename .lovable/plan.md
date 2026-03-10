

## Why You Didn't Get Notified — and How to Fix It

### Root Causes

There are **three gaps** preventing downtime notifications from reaching users:

1. **The alert processor is never triggered.** The `process-monitoring-alerts` function exists but has no cron schedule. When `check-uptime` detects a site is down, it inserts a row into `monitoring_alerts` with status `queued` — but nothing ever picks it up.

2. **No email provider is configured.** Even if alerts were processed, the email path requires a `RESEND_API_KEY` secret, which isn't set. So only in-app notifications could work (and they don't, because of #1).

3. **Default preferences block email delivery.** The alert processor defaults `prefEnabled` to `true` only for `in_app`. For email, it defaults to `false` — so unless a user has explicitly gone to Notifications → Preferences and toggled email on, they won't receive email alerts even once the plumbing works.

### Plan

#### 1. Schedule the alert processor (cron job)
Add a `pg_cron` job to call `process-monitoring-alerts` every **1 minute**, matching the existing architecture intent. This is the same pattern used for `check-uptime`.

#### 2. Set up email delivery via Resend
- Request the `RESEND_API_KEY` and `RESEND_FROM_EMAIL` secrets from you.
- The existing code in `process-monitoring-alerts` already handles Resend — it just needs the key.

#### 3. Default new users to receive email alerts
- Create a database trigger on `org_users` INSERT that auto-creates `user_notification_preferences` rows for `in_app` (enabled) and `email` (enabled) so every new org member is opted in by default.
- Backfill existing org members who have no preferences set.

#### 4. Improve the Notifications Preferences UI
- On the **Notifications page** Preferences tab, add a clear section for **monitoring alert types** (Downtime, SSL Expiry, Domain Expiry, Broken Links) so users can toggle each type on/off per channel.
- Currently it only shows generic channel toggles — users have no visibility into what they're subscribing to.

#### 5. Surface notification opt-in during onboarding
- Add a "Monitoring alerts" toggle to the onboarding flow (Step 2, where notification prefs are already collected) so users opt in from day one.

### How It Will Work End-to-End

```text
check-uptime (every 10 min)
  └─ site missed heartbeat → marks site DOWN
     └─ inserts monitoring_alerts row (status: queued)

process-monitoring-alerts (every 1 min)  ← NEW CRON
  └─ picks up queued alerts
     └─ for each org member:
        ├─ in_app → inserts notification_inbox row
        └─ email  → sends via Resend (if user pref enabled)
```

### Files Changed
- **SQL (via insert tool):** Schedule `process-monitoring-alerts` cron job; backfill default preferences for existing users
- **SQL (migration):** Trigger on `org_users` to auto-create default notification preferences
- **`src/pages/Notifications.tsx`:** Add per-alert-type toggles in Preferences tab
- **`src/components/onboarding/OnboardingModal.tsx`:** Add monitoring alert opt-in toggle
- **`supabase/functions/process-monitoring-alerts/index.ts`:** Minor fix — default email `prefEnabled` to `true` instead of `false`
- **Secrets:** Will need `RESEND_API_KEY` and optionally `RESEND_FROM_EMAIL`

