import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as React from "npm:react@^18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { TEMPLATES } from "../_shared/transactional-email-templates/registry.ts";
import { createPasswordResetUrl } from "../_shared/password-reset-links.ts";

const logStep = (step: string, details?: any) => {
  console.log(`[ACTV-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

/**
 * Extract the active recurring coupon from a Stripe subscription.
 * Stripe API 2025+ moved discounts from `subscription.discount` to
 * `subscription.discounts[]` (array of discount IDs or expanded objects).
 * We support both for forward/back compatibility.
 *
 * Caller must expand `discounts.coupon` (or legacy `discount.coupon`) before calling.
 */
function extractRecurringCoupon(sub: Stripe.Subscription): Stripe.Coupon | null {
  // New API: discounts[] array
  const discounts = (sub as any).discounts as Array<Stripe.Discount | string> | undefined;
  if (Array.isArray(discounts)) {
    for (const d of discounts) {
      if (typeof d === "string") continue; // not expanded — skip
      const c = d.coupon;
      if (c && (c.duration === "forever" || c.duration === "repeating")) return c;
    }
  }
  // Legacy API: single discount object
  const legacy = (sub as any).discount as Stripe.Discount | null | undefined;
  if (legacy?.coupon) {
    const c = legacy.coupon;
    if (c.duration === "forever" || c.duration === "repeating") return c;
  }
  return null;
}

/**
 * Compute the *effective* MRR for a Stripe subscription, taking into account
 * any active discount (percent_off or amount_off, recurring or forever).
 *
 * Returns dollars/month. A 100% off coupon → 0. A $10/mo off on a $49/mo plan → 39.
 * One-off (`once`) discounts are NOT applied to MRR — they're a temporary credit,
 * not a recurring rate change.
 *
 * Canceled / incomplete_expired subscriptions return 0 (no recurring revenue).
 */
function computeMrrFromSubscription(sub: Stripe.Subscription): number {
  // Dead subscriptions contribute zero MRR
  if (sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "unpaid") {
    return 0;
  }

  const item = sub.items?.data?.[0];
  const price = item?.price;
  const unitAmount = price?.unit_amount || 0;
  const interval = price?.recurring?.interval;
  const intervalCount = price?.recurring?.interval_count || 1;

  // Base monthly amount in cents
  let monthlyCents = unitAmount;
  if (interval === "year") monthlyCents = unitAmount / (12 * intervalCount);
  else if (interval === "week") monthlyCents = (unitAmount * 52) / (12 * intervalCount);
  else if (interval === "day") monthlyCents = (unitAmount * 365) / (12 * intervalCount);
  else if (interval === "month") monthlyCents = unitAmount / intervalCount;

  // Apply discount if it persists beyond the current invoice
  const coupon = extractRecurringCoupon(sub);
  if (coupon) {
    if (typeof coupon.percent_off === "number" && coupon.percent_off > 0) {
      monthlyCents = monthlyCents * (1 - coupon.percent_off / 100);
    } else if (typeof coupon.amount_off === "number" && coupon.amount_off > 0) {
      monthlyCents = Math.max(0, monthlyCents - coupon.amount_off);
    }
  }

  return Math.max(0, monthlyCents / 100);
}

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      logStep("FATAL: STRIPE_WEBHOOK_SECRET is not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 500 });
    }
    if (!sig) {
      logStep("Rejected: missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400 });
    }
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    logStep("Signature verification failed", { error: String(err) });
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  // ── H-7 FIX: Idempotency guard ──────────────────────────────────
  // Stripe retries webhook deliveries on failure. Without this guard,
  // a single checkout.session.completed could create the org/user
  // twice or send the welcome email twice. We claim the event id
  // before doing any side-effects; the unique PK on event_id makes
  // this atomic across concurrent webhook deliveries.
  try {
    const { error: dedupeErr } = await supabase
      .from("processed_stripe_events")
      .insert({
        event_id: event.id,
        event_type: event.type,
        summary: {
          object: (event.data?.object as any)?.object || null,
          customer: (event.data?.object as any)?.customer || null,
          subscription: (event.data?.object as any)?.subscription || null,
        },
      });
    if (dedupeErr) {
      // Duplicate PK = already processed. Return 200 so Stripe stops retrying.
      if (dedupeErr.code === "23505" || /duplicate key/i.test(dedupeErr.message || "")) {
        logStep("Duplicate event ignored", { id: event.id, type: event.type });
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Any other DB error: log and continue (we'd rather over-process than drop a real event).
      logStep("Dedupe insert failed (non-fatal)", { error: dedupeErr.message });
    }
  } catch (dedupeErr) {
    logStep("Dedupe check threw (non-fatal)", { error: String(dedupeErr) });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_email || session.customer_details?.email || "";
        const customerId = typeof session.customer === "string" ? session.customer : "";
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : "";
        const metadata = session.metadata || {};
        const plan = metadata.plan || metadata.pending_plan || "monthly";
        const siteUrl = metadata.site_url || null;

        // ── Setup-mode checkout (7-day "trial-on-connect" flow) ──────────────
        // No subscription exists yet — we only collected a payment method.
        // The org is provisioned in `pending_connection` state and the real
        // Stripe subscription (with a 7-day trial) is created later when the
        // WordPress plugin sends its first signal.
        const isSetupMode = session.mode === "setup" || (!subscriptionId && session.mode !== "subscription");

        // MRR is 0 until the trial actually starts (which happens on first signal).
        let mrr = 0;
        if (!isSetupMode && subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId, {
              expand: ["discounts.coupon", "discount.coupon"],
            });
            mrr = computeMrrFromSubscription(sub);
            logStep("MRR derived from subscription", {
              subscriptionId, mrr, hasDiscount: !!sub.discount, couponId: sub.discount?.coupon?.id,
            });
          } catch (priceErr) {
            logStep("Failed to derive MRR from subscription", { error: String(priceErr) });
          }
        }

        const customerDetails = session.customer_details;
        const billingName = customerDetails?.name || "";
        const billingPhone = customerDetails?.phone || "";
        const billingAddress = (customerDetails as any)?.address;

        // 1. Upsert subscriber. In setup mode, status='pending' until the
        //    trial starts on first signal.
        const { error } = await supabase.from("subscribers").upsert({
          email,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId || null,
          plan,
          status: isSetupMode ? "pending" : "active",
          site_url: siteUrl,
          referral_source: metadata.referral_source || null,
          mrr,
          last_active_date: new Date().toISOString(),
        }, { onConflict: "stripe_customer_id" });

        if (error) logStep("Subscriber upsert error", { error });
        else logStep("Subscriber upserted", { email, plan, isSetupMode });

        // 2. Create auth user (skip if already exists)
        const tempPassword = crypto.randomUUID();
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: billingName },
        });

        let userId: string | null = null;

        if (createErr) {
          if (createErr.message?.includes("already been registered")) {
            logStep("User already exists, skipping account creation", { email });
            // Look up existing user
            // Look up by email via profiles table (avoids fetching all users)
            const { data: profileRow } = await supabase
              .from("profiles")
              .select("user_id")
              .ilike("email", email)
              .maybeSingle();
            userId = profileRow?.user_id || null;
          } else {
            logStep("Auth user creation error", { error: createErr.message });
          }
        } else {
          userId = newUser?.user?.id || null;
          logStep("Auth user created", { userId });
        }

        // 2b. Update profile with billing details from Stripe
        if (userId) {
          const profileUpdate: Record<string, any> = {};
          if (billingName) profileUpdate.full_name = billingName;
          if (billingPhone) profileUpdate.phone = billingPhone;
          if (billingAddress) {
            if (billingAddress.line1) profileUpdate.address_line1 = billingAddress.line1;
            if (billingAddress.line2) profileUpdate.address_line2 = billingAddress.line2;
            if (billingAddress.city) profileUpdate.city = billingAddress.city;
            if (billingAddress.state) profileUpdate.state = billingAddress.state;
            if (billingAddress.postal_code) profileUpdate.postal_code = billingAddress.postal_code;
            if (billingAddress.country) profileUpdate.country = billingAddress.country;
          }
          if (Object.keys(profileUpdate).length > 0) {
            const { error: profErr } = await supabase
              .from("profiles")
              .update(profileUpdate)
              .eq("user_id", userId);
            if (profErr) logStep("Profile update error", { error: profErr.message });
            else logStep("Profile updated with billing details", { userId });
          }
        }

        // 3. Create org + link user (only for new users with no org yet)
        if (userId) {
          const { data: existingOrg } = await supabase
            .from("org_users")
            .select("org_id")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();

          if (!existingOrg) {
            // Derive org name from site URL or email domain (skip personal email providers)
            const personalDomains = ["gmail.com","yahoo.com","hotmail.com","outlook.com","aol.com","icloud.com","mail.com","protonmail.com","zoho.com","yandex.com","live.com","msn.com","me.com","mac.com"];
            const emailDomain = (email.split("@")[1] || "").toLowerCase();
            let orgName = personalDomains.includes(emailDomain) ? "My Organization" : emailDomain;
            if (siteUrl) {
              try {
                orgName = new URL(siteUrl).hostname.replace(/^www\./, "");
              } catch { /* keep fallback */ }
            }

            const { data: org, error: orgErr } = await supabase
              .from("orgs")
              .insert({ name: orgName, seo_visibility_level: "summary" })
              .select("id")
              .single();

            if (orgErr) {
              logStep("Org creation error", { error: orgErr.message });
            } else {
              await supabase.from("org_users").insert({
                org_id: org.id,
                user_id: userId,
                role: "admin",
              });

              // If site_url provided, create site record
              if (siteUrl) {
                await supabase.from("sites").insert({
                  org_id: org.id,
                  name: orgName,
                  url: siteUrl,
                }).then(({ error: siteErr }) => {
                  if (siteErr) logStep("Site creation error", { error: siteErr.message });
                });
              }

              logStep("Org + membership created", { orgId: org.id });
            }
          } else {
            logStep("User already has org, skipping", { orgId: existingOrg.org_id });
          }

          // 4. Generate password-set link & send welcome email directly via queue
          try {
            const setPasswordUrl = await createPasswordResetUrl(supabase, email, "https://actvtrkr.com/reset-password", userId) || "https://actvtrkr.com/auth";

            // Render the welcome template directly instead of invoking another edge function
            const welcomeTemplate = TEMPLATES["welcome"];
            if (welcomeTemplate) {
              const templateData = { name: undefined, setPasswordUrl };
              const html = await renderAsync(
                React.createElement(welcomeTemplate.component, templateData)
              );
              const plainText = await renderAsync(
                React.createElement(welcomeTemplate.component, templateData),
                { plainText: true }
              );
              const resolvedSubject = typeof welcomeTemplate.subject === "function"
                ? welcomeTemplate.subject(templateData)
                : welcomeTemplate.subject;

              const messageId = crypto.randomUUID();
              const idempotencyKey = `welcome-checkout-${session.id}`;

              // Get or create unsubscribe token
              const normalizedEmail = email.toLowerCase();
              let unsubscribeToken: string;
              const { data: existingToken } = await supabase
                .from("email_unsubscribe_tokens")
                .select("token")
                .eq("email", normalizedEmail)
                .maybeSingle();

              if (existingToken) {
                unsubscribeToken = existingToken.token;
              } else {
                const bytes = new Uint8Array(32);
                crypto.getRandomValues(bytes);
                unsubscribeToken = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
                await supabase.from("email_unsubscribe_tokens").upsert(
                  { token: unsubscribeToken, email: normalizedEmail },
                  { onConflict: "email", ignoreDuplicates: true }
                );
                // Re-read in case of race
                const { data: stored } = await supabase
                  .from("email_unsubscribe_tokens")
                  .select("token")
                  .eq("email", normalizedEmail)
                  .maybeSingle();
                if (stored) unsubscribeToken = stored.token;
              }

              // Log pending
              await supabase.from("email_send_log").insert({
                message_id: messageId,
                template_name: "welcome",
                recipient_email: email,
                status: "pending",
              });

              // Enqueue directly to pgmq
              const { error: enqueueErr } = await supabase.rpc("enqueue_email", {
                queue_name: "transactional_emails",
                payload: {
                  message_id: messageId,
                  to: email,
                  from: "ACTV TRKR <noreply@actvtrkr.com>",
                  sender_domain: "notify.actvtrkr.com",
                  subject: resolvedSubject,
                  html,
                  text: plainText,
                  purpose: "transactional",
                  label: "welcome",
                  idempotency_key: idempotencyKey,
                  unsubscribe_token: unsubscribeToken,
                  queued_at: new Date().toISOString(),
                },
              });

              if (enqueueErr) {
                logStep("Welcome email enqueue failed", { error: enqueueErr });
              } else {
                logStep("Welcome email enqueued", { email, messageId });
              }
            } else {
              logStep("Welcome template not found in registry");
            }
          } catch (emailErr) {
            logStep("Welcome email failed (non-fatal)", { error: String(emailErr) });
          }
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // Recalculate MRR whenever the subscription changes — including when a
        // discount/coupon is applied, removed, or expires. This ensures the MRR
        // column always reflects the *effective* recurring revenue.
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : "";
        if (!customerId) break;

        // Re-fetch with the discount expanded (webhook payload may not include the full coupon)
        let fullSub: Stripe.Subscription = sub;
        try {
          fullSub = await stripe.subscriptions.retrieve(sub.id, { expand: ["discounts.coupon", "discount.coupon"] });
        } catch (e) {
          logStep("Failed to expand subscription for MRR recompute", { error: String(e) });
        }

        const newMrr = computeMrrFromSubscription(fullSub);
        const isActive = ["active", "trialing", "past_due"].includes(fullSub.status);

        const { error } = await supabase
          .from("subscribers")
          .update({
            mrr: newMrr,
            stripe_subscription_id: fullSub.id,
            ...(isActive ? { status: "active" } : {}),
          })
          .eq("stripe_customer_id", customerId);

        if (error) logStep("MRR recompute update error", { error });
        else logStep("MRR recomputed for subscription change", { customerId, mrr: newMrr });

        // ── Lifecycle reactivation: if subscription is active, restore org to active ──
        if (fullSub.status === "active") {
          try {
            const { data: subRow } = await supabase.from("subscribers").select("email").eq("stripe_customer_id", customerId).maybeSingle();
            if (subRow?.email) {
              const { data: profile } = await supabase.from("profiles").select("user_id").ilike("email", subRow.email).maybeSingle();
              if (profile?.user_id) {
                const { data: ous } = await supabase.from("org_users").select("org_id").eq("user_id", profile.user_id);
                for (const ou of ous || []) {
                  await supabase.rpc("set_org_lifecycle_status", { p_org_id: ou.org_id, p_status: "active", p_reason: "stripe_subscription_active" });
                }
                logStep("Org(s) restored to active via subscription reactivation", { customerId, count: ous?.length || 0 });
              }
            }
          } catch (lifeErr) { logStep("Lifecycle reactivation failed (non-fatal)", { error: String(lifeErr) }); }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : "";

        // Check Stripe for any remaining active subscriptions before zeroing MRR
        const remainingSubs = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
          expand: ["data.discounts.coupon", "data.discount.coupon"],
        });

        if (remainingSubs.data.length > 0) {
          // Still has an active subscription — recalculate effective MRR (with discounts)
          const activeSub = remainingSubs.data[0];
          const recalculatedMrr = computeMrrFromSubscription(activeSub);

          const { error } = await supabase
            .from("subscribers")
            .update({
              status: "active",
              mrr: recalculatedMrr,
              stripe_subscription_id: activeSub.id,
            })
            .eq("stripe_customer_id", customerId);

          if (error) logStep("Re-derive MRR error", { error });
          else logStep("Subscription deleted but active sub remains", { customerId, mrr: recalculatedMrr });
        } else {
          // No active subs remain — mark as churned
          const { error } = await supabase
            .from("subscribers")
            .update({
              status: "churned",
              churn_date: new Date().toISOString(),
              churn_reason: sub.cancellation_details?.reason || "unknown",
              mrr: 0,
            })
            .eq("stripe_customer_id", customerId);

          if (error) logStep("Churn update error", { error });
          else logStep("Subscriber churned", { customerId });

          // ── Lifecycle: flip orgs to grace_period (30-day countdown) ──
          try {
            const { data: subRow } = await supabase.from("subscribers").select("email").eq("stripe_customer_id", customerId).maybeSingle();
            if (subRow?.email) {
              const { data: profile } = await supabase.from("profiles").select("user_id").ilike("email", subRow.email).maybeSingle();
              if (profile?.user_id) {
                const { data: ous } = await supabase.from("org_users").select("org_id").eq("user_id", profile.user_id);
                for (const ou of ous || []) {
                  // Skip billing-exempt orgs
                  const { data: o } = await supabase.from("orgs").select("billing_exempt").eq("id", ou.org_id).maybeSingle();
                  if (o?.billing_exempt) continue;
                  await supabase.rpc("set_org_lifecycle_status", { p_org_id: ou.org_id, p_status: "grace_period", p_reason: "stripe_subscription_deleted" });
                }
                logStep("Org(s) moved to grace_period", { customerId, count: ous?.length || 0 });
              }
            }
          } catch (lifeErr) { logStep("Lifecycle grace transition failed (non-fatal)", { error: String(lifeErr) }); }

          // Send cancellation email
          try {
            const { data: subscriber } = await supabase
              .from("subscribers")
              .select("email")
              .eq("stripe_customer_id", customerId)
              .maybeSingle();

            if (subscriber?.email) {
              // Look up name from profiles
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("email", subscriber.email)
                .maybeSingle();

              const cancelTemplate = TEMPLATES["subscription-cancelled"];
              if (cancelTemplate) {
                const templateData = { name: profile?.full_name || undefined };
                const html = await renderAsync(
                  React.createElement(cancelTemplate.component, templateData)
                );
                const plainText = await renderAsync(
                  React.createElement(cancelTemplate.component, templateData),
                  { plainText: true }
                );
                const resolvedSubject = typeof cancelTemplate.subject === "function"
                  ? cancelTemplate.subject(templateData)
                  : cancelTemplate.subject;

                const messageId = crypto.randomUUID();
                const normalizedEmail = subscriber.email.toLowerCase();

                // Get or create unsubscribe token
                let unsubscribeToken: string;
                const { data: existingToken } = await supabase
                  .from("email_unsubscribe_tokens")
                  .select("token")
                  .eq("email", normalizedEmail)
                  .maybeSingle();

                if (existingToken) {
                  unsubscribeToken = existingToken.token;
                } else {
                  const bytes = new Uint8Array(32);
                  crypto.getRandomValues(bytes);
                  unsubscribeToken = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
                  await supabase.from("email_unsubscribe_tokens").upsert(
                    { token: unsubscribeToken, email: normalizedEmail },
                    { onConflict: "email", ignoreDuplicates: true }
                  );
                  const { data: stored } = await supabase
                    .from("email_unsubscribe_tokens")
                    .select("token")
                    .eq("email", normalizedEmail)
                    .maybeSingle();
                  if (stored) unsubscribeToken = stored.token;
                }

                await supabase.from("email_send_log").insert({
                  message_id: messageId,
                  template_name: "subscription-cancelled",
                  recipient_email: subscriber.email,
                  status: "pending",
                });

                const { error: enqueueErr } = await supabase.rpc("enqueue_email", {
                  queue_name: "transactional_emails",
                  payload: {
                    message_id: messageId,
                    to: subscriber.email,
                    from: "ACTV TRKR <noreply@actvtrkr.com>",
                    sender_domain: "notify.actvtrkr.com",
                    subject: resolvedSubject,
                    html,
                    text: plainText,
                    purpose: "transactional",
                    label: "subscription-cancelled",
                    idempotency_key: `subscription-cancelled-${sub.id}`,
                    unsubscribe_token: unsubscribeToken,
                    queued_at: new Date().toISOString(),
                  },
                });

                if (enqueueErr) logStep("Cancellation email enqueue failed", { error: enqueueErr });
                else logStep("Cancellation email enqueued", { email: subscriber.email });
              }
            }
          } catch (emailErr) {
            logStep("Cancellation email failed (non-fatal)", { error: String(emailErr) });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : "";
        const subscriptionId = typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null;

        await supabase
          .from("subscribers")
          .update({ status: "past_due" })
          .eq("stripe_customer_id", customerId);

        await supabase.from("error_logs").insert({
          action: "payment_failed",
          error_message: `Invoice ${invoice.id} failed for customer ${customerId}`,
        });

        // Log to retention billing recovery (resolves org via subscriber → profile → org_users)
        try {
          const { data: sub } = await supabase
            .from("subscribers")
            .select("id, email")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          let orgId: string | null = null;
          if (sub?.email) {
            const { data: profile } = await supabase.from("profiles").select("user_id").ilike("email", sub.email).maybeSingle();
            if (profile?.user_id) {
              const { data: ou } = await supabase.from("org_users").select("org_id").eq("user_id", profile.user_id).maybeSingle();
              orgId = ou?.org_id ?? null;
            }
          }
          await supabase.from("billing_recovery_events").insert({
            org_id: orgId,
            customer_id: sub?.id ?? null,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_invoice_id: invoice.id,
            event_type: "invoice_payment_failed",
            status: "past_due",
            amount: typeof invoice.amount_due === "number" ? invoice.amount_due / 100 : null,
            currency: invoice.currency ?? null,
            details: { hosted_invoice_url: (invoice as any).hosted_invoice_url ?? null, attempt_count: (invoice as any).attempt_count ?? null },
            occurred_at: new Date().toISOString(),
          });
        } catch (recErr) {
          logStep("billing_recovery_events insert failed", { error: String(recErr) });
        }

        logStep("Payment failed recorded", { customerId });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : "";
        const subscriptionId = typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null;

        // Only log "recovered" if it follows a recent failure (otherwise it's just a normal renewal)
        try {
          const { data: sub } = await supabase
            .from("subscribers")
            .select("id, email, status")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          const wasPastDue = sub?.status === "past_due";

          // Reset status to active
          await supabase.from("subscribers").update({ status: "active" }).eq("stripe_customer_id", customerId);

          if (wasPastDue) {
            let orgId: string | null = null;
            if (sub?.email) {
              const { data: profile } = await supabase.from("profiles").select("user_id").ilike("email", sub.email).maybeSingle();
              if (profile?.user_id) {
                const { data: ou } = await supabase.from("org_users").select("org_id").eq("user_id", profile.user_id).maybeSingle();
                orgId = ou?.org_id ?? null;
              }
            }
            await supabase.from("billing_recovery_events").insert({
              org_id: orgId,
              customer_id: sub?.id ?? null,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_invoice_id: invoice.id,
              event_type: "payment_recovered",
              status: "active",
              amount: typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : null,
              currency: invoice.currency ?? null,
              details: {},
              occurred_at: new Date().toISOString(),
            });
            logStep("Payment recovered", { customerId });
          }
        } catch (recErr) {
          logStep("payment_succeeded handling failed", { error: String(recErr) });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }
  } catch (err) {
    logStep("Processing error", { error: String(err) });
    return new Response(JSON.stringify({ error: "Processing failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
