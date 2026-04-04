import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@18.5.0";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: appCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check caller is admin via user_roles
    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    // ── CREATE USER ──
    if (action === "create_user") {
      const { email, password, full_name, org_id, role } = body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPassword = String(password || "");
      const normalizedFullName = String(full_name || "").trim();

      if (!normalizedEmail || !normalizedPassword || !org_id) {
        return new Response(JSON.stringify({ error: "email, password, and org_id are required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (normalizedPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Enforce org-scoped admin permission
      const { data: callerOrgAccess } = await adminClient
        .from("org_users").select("role").eq("org_id", org_id).eq("user_id", caller.id).maybeSingle();
      if (!callerOrgAccess || callerOrgAccess.role !== "admin") {
        return new Response(JSON.stringify({ error: "Org admin access required" }), {
          status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      let userId: string;
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail, password: normalizedPassword, email_confirm: true,
        user_metadata: { full_name: normalizedFullName },
      });

      if (createError) {
        if (createError.message.includes("already been registered")) {
          const { data: { users } } = await adminClient.auth.admin.listUsers();
          const existing = users.find((u: any) => (u.email || "").toLowerCase() === normalizedEmail);
          if (!existing) {
            return new Response(JSON.stringify({ error: "User not found" }), {
              status: 404, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
            });
          }
          const { data: existingMembership } = await adminClient
            .from("org_users").select("id").eq("org_id", org_id).eq("user_id", existing.id).maybeSingle();
          if (!existingMembership) {
            return new Response(JSON.stringify({ error: "Email already exists in a different client account." }), {
              status: 409, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
            });
          }
          await adminClient.auth.admin.updateUserById(existing.id, {
            password: normalizedPassword, email_confirm: true, user_metadata: { full_name: normalizedFullName },
          });
          userId = existing.id;
        } else {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      } else {
        userId = newUser.user.id;
      }

      await adminClient.from("org_users")
        .upsert({ org_id, user_id: userId, role: role || "member" }, { onConflict: "org_id,user_id", ignoreDuplicates: true });

      // Welcome email (fire-and-forget)
      try {
        const { data: resetData } = await adminClient.auth.admin.generateLink({
          type: "recovery", email: normalizedEmail,
          options: { redirectTo: "https://actvtrkr.com/reset-password" },
        });
        const setPasswordUrl = resetData?.properties?.action_link || "https://actvtrkr.com/reset-password";
        await adminClient.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome", recipientEmail: normalizedEmail,
            idempotencyKey: `welcome-${userId}`,
            templateData: { name: normalizedFullName || undefined, setPasswordUrl },
          },
        });
      } catch { /* non-fatal */ }

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── RESET PASSWORD ──
    if (action === "reset_password") {
      const { email, new_password, org_id } = body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || !org_id) {
        return new Response(JSON.stringify({ error: "email and org_id are required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: callerOrgAccess } = await adminClient
        .from("org_users").select("role").eq("org_id", org_id).eq("user_id", caller.id).maybeSingle();
      if (!callerOrgAccess || callerOrgAccess.role !== "admin") {
        return new Response(JSON.stringify({ error: "Org admin access required" }), {
          status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: { users } } = await adminClient.auth.admin.listUsers();
      const targetUser = users.find((u: any) => (u.email || "").toLowerCase() === normalizedEmail);
      if (!targetUser) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: targetMembership } = await adminClient
        .from("org_users").select("id").eq("org_id", org_id).eq("user_id", targetUser.id).maybeSingle();
      if (!targetMembership) {
        return new Response(JSON.stringify({ error: "User does not belong to this client account" }), {
          status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (new_password) {
        const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.id, { password: new_password });
        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, method: "password_set" }), {
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery", email: normalizedEmail,
        options: { redirectTo: "https://actvtrkr.com/reset-password" },
      });
      if (linkError) {
        return new Response(JSON.stringify({ error: linkError.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true, method: "recovery_link",
        link: linkData?.properties?.action_link || null,
      }), { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // ── SEND PASSWORD RESET EMAIL ──
    if (action === "send_password_reset") {
      const { email } = body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery", email: normalizedEmail,
        options: { redirectTo: "https://actvtrkr.com/reset-password" },
      });
      if (linkError) {
        return new Response(JSON.stringify({ error: linkError.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Send the recovery email via transactional email system
      const recoveryUrl = linkData?.properties?.action_link || "https://actvtrkr.com/reset-password";
      try {
        await adminClient.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome",
            recipientEmail: normalizedEmail,
            idempotencyKey: `admin-reset-${Date.now()}`,
            templateData: { setPasswordUrl: recoveryUrl },
          },
        });
      } catch { /* non-fatal */ }

      return new Response(JSON.stringify({ success: true, sent: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── DELETE USER ──
    if (action === "delete_user") {
      const rawUserId = String(body.user_id || "").trim();
      const rawSubscriberId = String(body.subscriber_id || "").trim();
      const rawEmail = String(body.email || "").trim().toLowerCase();

      let targetUserId = rawUserId || null;
      const targetSubscriberId = rawSubscriberId || null;
      let targetEmail = rawEmail || null;

      if (!targetUserId && !targetSubscriberId && !targetEmail) {
        return new Response(JSON.stringify({ error: "user_id, subscriber_id, or email is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (targetSubscriberId && !targetEmail) {
        const { data: subscriberRow, error: subscriberLookupError } = await adminClient
          .from("subscribers")
          .select("id, email")
          .eq("id", targetSubscriberId)
          .maybeSingle();

        if (subscriberLookupError) {
          return new Response(JSON.stringify({ error: subscriberLookupError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        if (subscriberRow?.email) {
          targetEmail = subscriberRow.email.trim().toLowerCase();
        }
      }

      if (targetUserId && !targetEmail) {
        const { data: profileRow, error: profileLookupError } = await adminClient
          .from("profiles")
          .select("email")
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (profileLookupError) {
          return new Response(JSON.stringify({ error: profileLookupError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        if (profileRow?.email) {
          targetEmail = profileRow.email.trim().toLowerCase();
        }
      }

      if (!targetUserId && targetEmail) {
        const { data: profileRow, error: profileLookupError } = await adminClient
          .from("profiles")
          .select("user_id, email")
          .ilike("email", targetEmail)
          .maybeSingle();

        if (profileLookupError) {
          return new Response(JSON.stringify({ error: profileLookupError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        if (profileRow?.user_id) {
          targetUserId = profileRow.user_id;
        }

        if (profileRow?.email) {
          targetEmail = profileRow.email.trim().toLowerCase();
        }
      }

      if (targetUserId) {
        const { error: orgUsersDeleteError } = await adminClient
          .from("org_users")
          .delete()
          .eq("user_id", targetUserId);
        if (orgUsersDeleteError) {
          return new Response(JSON.stringify({ error: subscriberDeleteError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const { error: profileDeleteError } = await adminClient
          .from("profiles")
          .delete()
          .eq("user_id", targetUserId);
        if (profileDeleteError) {
          return new Response(JSON.stringify({ error: profileDeleteError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
        if (deleteError && !/not found/i.test(deleteError.message)) {
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      let deletedSubscriberCount = 0;

      if (targetSubscriberId) {
        const { count, error: subscriberDeleteError } = await adminClient
          .from("subscribers")
          .delete({ count: "exact" })
          .eq("id", targetSubscriberId);

        if (subscriberDeleteError) {
          return new Response(JSON.stringify({ error: subscriberDeleteError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        deletedSubscriberCount = count || 0;
      } else if (targetEmail) {
        const { count, error: subscriberDeleteError } = await adminClient
          .from("subscribers")
          .delete({ count: "exact" })
          .ilike("email", targetEmail);

        if (subscriberDeleteError) {
          return new Response(JSON.stringify({ error: subscriberDeleteError.message }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        deletedSubscriberCount = count || 0;
      }

      if (!targetUserId && deletedSubscriberCount === 0) {
        return new Response(JSON.stringify({ error: "No matching subscriber found" }), {
          status: 404, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        email: targetEmail,
        deleted_user: !!targetUserId,
        deleted_subscriber_count: deletedSubscriberCount,
      }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── STRIPE: GET SUBSCRIBER DETAILS ──
    if (action === "get_subscriber_billing") {
      const { email } = body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return new Response(JSON.stringify({ error: "Stripe not configured" }), {
          status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const customers = await stripe.customers.list({ email: normalizedEmail, limit: 1 });
      if (customers.data.length === 0) {
        return new Response(JSON.stringify({ customer: null, subscriptions: [], invoices: [], charges: [] }), {
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const customer = customers.data[0];
      const [activeSubscriptions, allSubscriptions, invoices, charges] = await Promise.all([
        stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 10 }),
        stripe.subscriptions.list({ customer: customer.id, limit: 10 }),
        stripe.invoices.list({ customer: customer.id, limit: 20 }),
        stripe.charges.list({ customer: customer.id, limit: 20 }),
      ]);

      const activeIds = new Set(activeSubscriptions.data.map((s) => s.id));
      const orderedSubs = [...activeSubscriptions.data, ...allSubscriptions.data.filter((s) => !activeIds.has(s.id))];

      const detailedSubscriptions = await Promise.all(
        orderedSubs.map(async (subscription) => {
          const fullSubscription = await stripe.subscriptions.retrieve(subscription.id, {
            expand: ["items.data.price.product", "latest_invoice"],
          });

          const firstItem = fullSubscription.items.data[0];
          const price = firstItem?.price;
          const product = price?.product && typeof price.product !== "string" ? price.product : null;
          const latestInvoice = fullSubscription.latest_invoice && typeof fullSubscription.latest_invoice !== "string"
            ? fullSubscription.latest_invoice
            : null;

          return {
            id: fullSubscription.id,
            status: fullSubscription.status,
            plan: price?.nickname || product?.name || price?.id || "unknown",
            product_name: product?.name || null,
            amount: (price?.unit_amount || 0) / 100,
            interval: price?.recurring?.interval || "month",
            created: fullSubscription.created ?? latestInvoice?.created ?? null,
            current_period_start: fullSubscription.current_period_start ?? null,
            current_period_end: fullSubscription.current_period_end ?? null,
            latest_invoice_created: latestInvoice?.created ?? null,
            cancel_at_period_end: fullSubscription.cancel_at_period_end,
            cancel_at: fullSubscription.cancel_at ?? null,
            canceled_at: fullSubscription.canceled_at ?? null,
          };
        })
      );

      detailedSubscriptions.sort((a, b) => {
        const activeDelta = Number(b.status === "active") - Number(a.status === "active");
        if (activeDelta !== 0) return activeDelta;
        return (b.created ?? 0) - (a.created ?? 0);
      });

      return new Response(JSON.stringify({
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          created: customer.created,
        },
        subscriptions: detailedSubscriptions,
        invoices: invoices.data.map((i) => ({
          id: i.id,
          number: i.number,
          status: i.status,
          amount_due: (i.amount_due || 0) / 100,
          amount_paid: (i.amount_paid || 0) / 100,
          currency: i.currency,
          created: i.created,
          hosted_invoice_url: i.hosted_invoice_url,
          pdf: i.invoice_pdf,
        })),
        charges: charges.data.map((c) => ({
          id: c.id,
          amount: (c.amount || 0) / 100,
          currency: c.currency,
          status: c.status,
          created: c.created,
          refunded: c.refunded,
          amount_refunded: (c.amount_refunded || 0) / 100,
          receipt_url: c.receipt_url,
        })),
      }), { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // ── STRIPE: REFUND CHARGE ──
    if (action === "refund_charge") {
      const { charge_id, amount } = body;
      if (!charge_id) {
        return new Response(JSON.stringify({ error: "charge_id is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return new Response(JSON.stringify({ error: "Stripe not configured" }), {
          status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const refundParams: any = { charge: charge_id };
      if (amount) refundParams.amount = Math.round(amount * 100); // partial refund in cents

      const refund = await stripe.refunds.create(refundParams);

      return new Response(JSON.stringify({
        success: true,
        refund: { id: refund.id, amount: refund.amount / 100, status: refund.status },
      }), { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // ── STRIPE: CANCEL SUBSCRIPTION ──
    if (action === "cancel_subscription") {
      const { subscription_id, immediate, cancel_at } = body;
      if (!subscription_id) {
        return new Response(JSON.stringify({ error: "subscription_id is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return new Response(JSON.stringify({ error: "Stripe not configured" }), {
          status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      let result;
      if (immediate) {
        result = await stripe.subscriptions.cancel(subscription_id);
      } else if (cancel_at) {
        // Cancel at a specific date (Unix timestamp)
        const cancelTimestamp = Math.floor(new Date(cancel_at).getTime() / 1000);
        result = await stripe.subscriptions.update(subscription_id, { cancel_at: cancelTimestamp });
      } else {
        result = await stripe.subscriptions.update(subscription_id, { cancel_at_period_end: true });
      }

      return new Response(JSON.stringify({
        success: true,
        status: result.status,
        cancel_at_period_end: result.cancel_at_period_end,
        cancel_at: result.cancel_at,
      }), { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
