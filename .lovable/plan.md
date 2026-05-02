## Problem

You already paid Stripe directly for an extra site, so you have a "paid but unconnected" slot. The Add Site modal currently always shows you the **"Confirm — we'll add a $30/mo line item"** screen, which is wrong because:

- If you click Confirm → the `add-additional-site` guardrail trips (HTTP 409 `slot_already_available`) and shows the Blocked screen. Annoying, extra clicks.
- The pitch text on that screen ("We'll add a new $30/month line item…") is also factually wrong for your case.

You want: **detect that a paid-and-unconnected slot already exists → skip straight to the download page**, no confirmation required.

## Fix

### 1. New step: precheck before showing "confirm-additional"

When you click **"I'm adding an additional site to my plan"**, instead of jumping to the confirmation screen, the modal will call a new lightweight read-only endpoint `check-additional-site-slot` that returns:

```ts
{ available_slots: number, purchased_slots: number, connected_sites: number, is_trialing: boolean }
```

Branching:

| Condition | What happens |
|---|---|
| `available_slots > 0` | **Skip confirm.** Close modal, toast "You already have a paid slot ready", navigate to `/settings?tab=add-site`. |
| `available_slots === 0` | Show the existing confirm screen (charge will actually happen). |
| Error | Fall back to current confirm screen so flow is never blocked. |

This means: **anyone who paid out-of-band (Stripe direct, manual quantity bump, prior trip through this modal) lands on the download page in one click**, with zero risk of double-charging.

### 2. New edge function: `check-additional-site-slot`

Read-only mirror of the slot accounting already in `add-additional-site`:
- Reads `purchased_additional_sites` from the org row.
- Counts connected sites for the org.
- Returns the same shape `add-additional-site` returns on its 409, but with HTTP 200.
- No Stripe writes. No subscription mutation.

### 3. Tighten the "confirm-additional" copy

Only shown now when a real charge will occur. Keep current language but add a small line:
> "We checked — you don't have an unused slot yet, so this will add a new line item."

### 4. (Out of scope but noted) Sites page banner

The persistent "You have 1 unconnected site slot — finish setup" banner I offered last turn is still a good idea but is a separate task. Say the word and I'll add it after this lands.

## Files

- **New** `supabase/functions/check-additional-site-slot/index.ts` — read-only slot check.
- **Edit** `src/components/sites/AddSiteModal.tsx` — add precheck step, route directly to `/settings?tab=add-site` when a slot exists, refine confirm copy.

## Verification for your current situation

After this ships, you click Add Site → "Adding additional site" → modal closes immediately → you land on `/settings?tab=add-site` with the pre-keyed plugin download for the slot you already paid for. No confirm screen. No second charge.

In the meantime (right now), you can reach the download directly at **`/settings?tab=add-site`** — the tab should already be visible since your Stripe quantity is bumped.