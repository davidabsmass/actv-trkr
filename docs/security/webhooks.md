# Webhook Handling

## Stripe (`actv-webhook`)

### Signature verification

The function reads `STRIPE_WEBHOOK_SECRET` from env, requires the `stripe-signature` header, and calls `stripe.webhooks.constructEventAsync(body, sig, secret)`. Missing secret → 500. Missing or invalid signature → 400.

### Idempotency (H-7)

Stripe retries delivery on any non-2xx, network failure, or timeout. Without dedup, this would double-create orgs, double-send welcome emails, and double-count MRR. Guarantee: **each `event.id` is processed exactly once across all retries.**

Implementation:

```ts
const { error: dedupeErr } = await supabase
  .from("processed_stripe_events")
  .insert({
    event_id: event.id,
    event_type: event.type,
    summary: { object, customer, subscription },
  });

if (dedupeErr?.code === "23505") {
  // PK collision — already processed. Tell Stripe we're done.
  return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
}
```

The `processed_stripe_events.event_id` PK constraint makes the claim atomic across concurrent webhook deliveries.

### Failure handling

- Any non-PK DB error during the dedup insert is **logged and ignored**. We'd rather over-process an event than drop a real one — downstream handlers are themselves idempotent (`upsert` on `subscribers`, etc.).
- Side-effect handlers that are *not* fully idempotent (e.g., welcome email send) rely on the dedup row existing before they run.

### What we never do

- Never accept `event.id` from the request body — only from the Stripe-verified `event` object.
- Never mark the event as processed *before* signature verification.
- Never short-circuit a duplicate with a non-200 — Stripe would keep retrying.

## Backend → WordPress (`provision-signing-secret`, `generate-wp-login`, etc.)

These are not webhooks but use the same defensive posture. Every call is HMAC-signed (see `docs/security/auth.md` § C-2). The plugin enforces:

- timestamp window (±300 s)
- nonce uniqueness (transient, TTL 600 s)
- constant-time signature comparison

A failure produces a clear `WP_Error` code (`mm_signed_skew`, `mm_signed_replay`, `mm_signed_mismatch`, `mm_signed_bad_nonce`, `mm_signed_incomplete`, `mm_signed_bad_ts`) but never echoes the secret or the expected signature back to the caller.
