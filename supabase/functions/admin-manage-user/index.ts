import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "npm:@supabase/supabase-js@2";
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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice("Bearer ".length);

    // Decode JWT payload to get user id (works regardless of supabase-js version)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    let callerId: string | null = null;
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadJson);
        if (payload?.sub && typeof payload.sub === "string") callerId = payload.sub;
      }
    } catch (_) { /* fall through */ }
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const caller = { id: callerId };
    const { data: roleData } = await adminClient
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

    // adminClient already created above for role check
    const body = await req.json();
    const { action } = body;

    // System-admin bypass (caller already verified as having user_roles.admin above)
    const isSystemAdmin = true;

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

      // System admins bypass org-membership check; otherwise require org admin
      if (!isSystemAdmin) {
        const { data: callerOrgAccess } = await adminClient
          .from("org_users").select("role").eq("org_id", org_id).eq("user_id", caller.id).maybeSingle();
        if (!callerOrgAccess || callerOrgAccess.role !== "admin") {
          return new Response(JSON.stringify({ error: "Org admin access required" }), {
            status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      let userId: string;
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail, password: normalizedPassword, email_confirm: true,
        user_metadata: { full_name: normalizedFullName },
      });

      if (createError) {
        if (createError.message.includes("already been registered")) {
          const { data: profileRow } = await adminClient
            .from("profiles").select("user_id").ilike("email", normalizedEmail).maybeSingle();
          const existing = profileRow ? { id: profileRow.user_id } : null;
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

    // ── RESET PASSWORD (email link only — caller-supplied passwords removed for security) ──
    if (action === "reset_password") {
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

      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: "https://actvtrkr.com/reset-password",
      });
      if (resetError) {
        return new Response(JSON.stringify({ error: resetError.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

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
          return new Response(JSON.stringify({ error: orgUsersDeleteError.message }), {
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

      const activeIds = new Set(activeSubscriptions.data.map((s: any) => s.id));
      const orderedSubs = [...activeSubscriptions.data, ...allSubscriptions.data.filter((s: any) => !activeIds.has(s.id))];

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
        invoices: invoices.data.map((i: any) => ({
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
        charges: charges.data.map((c: any) => ({
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

    // ── FORCE LOGOUT (revoke all auth sessions) ──
    if (action === "force_logout") {
      const targetEmail = String(body.email || "").trim().toLowerCase();
      if (!targetEmail) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { data: profileRow } = await adminClient
        .from("profiles").select("user_id").ilike("email", targetEmail).maybeSingle();
      if (!profileRow?.user_id) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { error: signOutError } = await adminClient.auth.admin.signOut(profileRow.user_id, "global");
      if (signOutError) {
        return new Response(JSON.stringify({ error: signOutError.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── ADD ADMIN NOTE (timestamped log) ──
    if (action === "add_note") {
      const noteBody = String(body.body || "").trim();
      const category = String(body.category || "note").trim().slice(0, 32);
      const orgId = body.org_id || null;
      const subscriberId = body.subscriber_id || null;
      const subscriberEmail = body.subscriber_email
        ? String(body.subscriber_email).trim().toLowerCase()
        : null;
      if (!noteBody) {
        return new Response(JSON.stringify({ error: "body is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      // Encrypt the note body at rest. We attempt encryption first; if the
      // key is not configured (encrypt_admin_note raises), fall back to
      // plaintext storage so existing flows do not break.
      const trimmedBody = noteBody.slice(0, 4000);
      let bodyEncrypted: string | null = null;
      try {
        const { data: enc, error: encErr } = await adminClient.rpc("encrypt_admin_note", {
          p_plaintext: trimmedBody,
        });
        if (!encErr && enc) bodyEncrypted = enc as unknown as string;
      } catch { /* key not configured — fall through to plaintext */ }

      const { data: inserted, error: insertErr } = await adminClient
        .from("admin_notes")
        .insert({
          org_id: orgId,
          subscriber_id: subscriberId,
          subscriber_email: subscriberEmail,
          author_id: caller.id,
          author_email: null,
          category,
          // Keep `body` only if encryption is unavailable; otherwise store empty
          // string so plaintext is not duplicated alongside the ciphertext.
          body: bodyEncrypted ? "" : trimmedBody,
          body_encrypted: bodyEncrypted,
        })
        .select()
        .single();
      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, note: inserted }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── DELETE ADMIN NOTE ──
    if (action === "delete_note") {
      const noteId = String(body.note_id || "").trim();
      if (!noteId) {
        return new Response(JSON.stringify({ error: "note_id is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { error: delErr } = await adminClient.from("admin_notes").delete().eq("id", noteId);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── UPDATE SUBSCRIBER METADATA (pricing_type, referral_source) ──
    if (action === "update_subscriber_meta") {
      const subscriberId = String(body.subscriber_id || "").trim();
      if (!subscriberId) {
        return new Response(JSON.stringify({ error: "subscriber_id is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const patch: Record<string, unknown> = {};
      if (typeof body.pricing_type === "string") patch.pricing_type = body.pricing_type;
      if (typeof body.referral_source === "string") patch.referral_source = body.referral_source;
      if (!Object.keys(patch).length) {
        return new Response(JSON.stringify({ error: "Nothing to update" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { error: upErr } = await adminClient
        .from("subscribers").update(patch).eq("id", subscriberId);
      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── LIST SUBSCRIBER SITES (admin: see all orgs/sites/api keys) ──
    if (action === "list_subscriber_sites") {
      const [orgsRes, sitesRes, keysRes] = await Promise.all([
        adminClient
          .from("orgs")
          .select(
            "id, name, created_at, status, billing_exempt, grace_period_ends_at, archived_at"
          )
          .order("created_at", { ascending: false }),
        adminClient.from("sites").select("id, domain, org_id, last_heartbeat_at"),
        adminClient.from("api_keys").select("id, org_id, created_at, revoked_at, label").order("created_at", { ascending: false }),
      ]);
      if (orgsRes.error || sitesRes.error || keysRes.error) {
        return new Response(
          JSON.stringify({ error: orgsRes.error?.message || sitesRes.error?.message || keysRes.error?.message }),
          { status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ orgs: orgsRes.data || [], sites: sitesRes.data || [], api_keys: keysRes.data || [] }),
        { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // ── ADMIN OVERRIDE: manually set org lifecycle status ──
    if (action === "set_org_lifecycle_status") {
      const orgId = String(body.org_id || "").trim();
      const status = String(body.status || "").trim();
      if (!orgId || !["active", "grace_period", "archived"].includes(status)) {
        return new Response(
          JSON.stringify({ error: "org_id and valid status (active/grace_period/archived) required" }),
          { status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      const { error: rpcErr } = await adminClient.rpc("set_org_lifecycle_status", {
        p_org_id: orgId,
        p_status: status,
        p_reason: `admin_manual_override:${caller.id}`,
      });
      if (rpcErr) {
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      // If reactivating, also clear lifecycle email-sent timestamps so future cancellations re-send fresh notifications.
      if (status === "active") {
        await adminClient.from("orgs").update({
          cancellation_email_sent_at: null,
          day25_email_sent_at: null,
          day80_email_sent_at: null,
        }).eq("id", orgId);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── LIST ORG MEMBERS ──
    if (action === "list_org_members") {
      const orgId = String(body.org_id || "").trim();
      if (!orgId) {
        return new Response(JSON.stringify({ error: "org_id is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { data: members, error: mErr } = await adminClient
        .from("org_users")
        .select("user_id, role, created_at")
        .eq("org_id", orgId);
      if (mErr) {
        return new Response(JSON.stringify({ error: mErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const userIds = (members || []).map((m: any) => m.user_id);
      const { data: profiles } = userIds.length
        ? await adminClient.from("profiles").select("user_id, email, full_name").in("user_id", userIds)
        : { data: [] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const enriched = (members || []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.created_at,
        email: profileMap.get(m.user_id)?.email || null,
        full_name: profileMap.get(m.user_id)?.full_name || null,
      }));
      return new Response(JSON.stringify({ members: enriched }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── ADD EXISTING USER TO ORG (by email; creates auth user if missing, optional temp password) ──
    if (action === "add_existing_user_to_org") {
      const orgId = String(body.org_id || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const role = String(body.role || "member").trim();
      const fullName = String(body.full_name || "").trim();
      const tempPassword = String(body.temp_password || "").trim();
      const sendInviteEmail = body.send_invite_email !== false;
      if (!orgId || !email) {
        return new Response(JSON.stringify({ error: "org_id and email are required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (tempPassword && tempPassword.length < 8) {
        return new Response(JSON.stringify({ error: "Temporary password must be at least 8 characters" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const validRoles = ["member", "admin"];
      const assignRole = validRoles.includes(role) ? role : "member";

      // Find or create the user
      const { data: profileRow } = await adminClient
        .from("profiles").select("user_id").ilike("email", email).maybeSingle();
      let targetUserId = profileRow?.user_id || null;
      let wasCreated = false;

      if (!targetUserId) {
        const passwordToUse = tempPassword || (crypto.randomUUID() + "Aa1!");
        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email, password: passwordToUse, email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createErr || !newUser?.user) {
          return new Response(JSON.stringify({ error: createErr?.message || "Failed to create user" }), {
            status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
        targetUserId = newUser.user.id;
        wasCreated = true;
      } else {
        // Existing user — update name and/or password if admin provided them
        const updates: Record<string, unknown> = {};
        if (tempPassword) updates.password = tempPassword;
        if (fullName) updates.user_metadata = { full_name: fullName };
        if (Object.keys(updates).length > 0) {
          await adminClient.auth.admin.updateUserById(targetUserId, updates);
        }
      }

      // Always sync the profiles table so the name shows up in the UI
      if (fullName) {
        await adminClient
          .from("profiles")
          .update({ full_name: fullName })
          .eq("user_id", targetUserId);
      }

      // Check if already a member
      const { data: existing } = await adminClient
        .from("org_users").select("id, role").eq("org_id", orgId).eq("user_id", targetUserId).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: "User is already a member of this organization" }), {
          status: 409, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error: insErr } = await adminClient.from("org_users")
        .insert({ org_id: orgId, user_id: targetUserId, role: assignRole });
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Email handling:
      // - If a temp password was set, DON'T email a recovery link (admin will share the temp password directly)
      // - Otherwise, send the password-setup email so they can choose their own password
      if (sendInviteEmail && !tempPassword) {
        try {
          const { data: linkData } = await adminClient.auth.admin.generateLink({
            type: "recovery", email,
            options: { redirectTo: "https://actvtrkr.com/reset-password" },
          });
          const setPasswordUrl = linkData?.properties?.action_link || "https://actvtrkr.com/reset-password";
          await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
              "apikey": serviceRoleKey,
            },
            body: JSON.stringify({
              templateName: "welcome",
              recipientEmail: email,
              idempotencyKey: `add-org-${targetUserId}-${orgId}-${Date.now()}`,
              templateData: { name: fullName || undefined, setPasswordUrl },
            }),
          });
        } catch { /* non-fatal */ }
      }

      return new Response(JSON.stringify({
        success: true,
        user_id: targetUserId,
        was_created: wasCreated,
        role: assignRole,
        temp_password_set: Boolean(tempPassword),
      }), { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // ── REVOKE API KEY ──
    if (action === "revoke_api_key") {
      const apiKeyId = String(body.api_key_id || "").trim();
      if (!apiKeyId) {
        return new Response(JSON.stringify({ error: "api_key_id is required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { data: existing, error: lookupErr } = await adminClient
        .from("api_keys")
        .select("id, revoked_at, org_id, label")
        .eq("id", apiKeyId)
        .maybeSingle();
      if (lookupErr || !existing) {
        return new Response(JSON.stringify({ error: lookupErr?.message || "API key not found" }), {
          status: 404, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (existing.revoked_at) {
        return new Response(JSON.stringify({ success: true, already_revoked: true }), {
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { error: updErr } = await adminClient
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", apiKeyId);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── EXPORT USERS (CSV) ──
    if (action === "export_users") {
      const [profilesRes, orgUsersRes, orgsRes, rolesRes, loginsRes] = await Promise.all([
        adminClient.from("profiles").select("user_id, email, full_name, created_at"),
        adminClient.from("org_users").select("user_id, org_id, role, created_at"),
        adminClient.from("orgs").select("id, name"),
        adminClient.from("user_roles").select("user_id, role"),
        adminClient.from("login_events").select("email, logged_in_at"),
      ]);

      const profiles = profilesRes.data || [];
      const orgUsers = orgUsersRes.data || [];
      const orgs = orgsRes.data || [];
      const roles = rolesRes.data || [];
      const logins = loginsRes.data || [];

      const orgMap = new Map(orgs.map((o: any) => [o.id, o.name]));
      const orgsByUser = new Map<string, string[]>();
      orgUsers.forEach((ou: any) => {
        const orgName = orgMap.get(ou.org_id) || ou.org_id;
        const label = `${orgName} (${ou.role})`;
        if (!orgsByUser.has(ou.user_id)) orgsByUser.set(ou.user_id, []);
        orgsByUser.get(ou.user_id)!.push(label);
      });
      const sysRoleByUser = new Map<string, string[]>();
      roles.forEach((r: any) => {
        if (!sysRoleByUser.has(r.user_id)) sysRoleByUser.set(r.user_id, []);
        sysRoleByUser.get(r.user_id)!.push(r.role);
      });
      const lastLoginByEmail = new Map<string, string>();
      logins.forEach((l: any) => {
        const e = (l.email || "").toLowerCase();
        if (!e) return;
        const prev = lastLoginByEmail.get(e);
        if (!prev || l.logged_in_at > prev) lastLoginByEmail.set(e, l.logged_in_at);
      });

      const escape = (v: any) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };

      const header = ["email", "full_name", "user_id", "system_roles", "organizations", "created_at", "last_login_at"];
      const rows = profiles.map((p: any) => {
        const email = (p.email || "").toLowerCase();
        return [
          p.email || "",
          p.full_name || "",
          p.user_id,
          (sysRoleByUser.get(p.user_id) || []).join("; "),
          (orgsByUser.get(p.user_id) || []).join("; "),
          p.created_at || "",
          lastLoginByEmail.get(email) || "",
        ].map(escape).join(",");
      });
      const csv = [header.join(","), ...rows].join("\n");

      return new Response(JSON.stringify({
        success: true,
        csv,
        row_count: profiles.length,
        generated_at: new Date().toISOString(),
      }), { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // ── REMOVE USER FROM ORG (detach only; does not delete auth account) ──
    if (action === "remove_user_from_org") {
      const orgId = String(body.org_id || "").trim();
      const userId = String(body.user_id || "").trim();
      if (!orgId || !userId) {
        return new Response(JSON.stringify({ error: "org_id and user_id are required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { error: delErr } = await adminClient
        .from("org_users").delete().eq("org_id", orgId).eq("user_id", userId);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── UPDATE ORG MEMBER (name + role) ──
    if (action === "update_org_member") {
      const orgId = String(body.org_id || "").trim();
      const userId = String(body.user_id || "").trim();
      const fullName = body.full_name !== undefined ? String(body.full_name).trim() : undefined;
      const role = body.role !== undefined ? String(body.role).trim() : undefined;

      if (!orgId || !userId) {
        return new Response(JSON.stringify({ error: "org_id and user_id are required" }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (role !== undefined && !["member", "admin"].includes(role)) {
        return new Response(JSON.stringify({ error: "Invalid role. Must be 'member' or 'admin'." }), {
          status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Update role on org_users
      if (role !== undefined) {
        const { error: roleErr } = await adminClient
          .from("org_users")
          .update({ role })
          .eq("org_id", orgId)
          .eq("user_id", userId);
        if (roleErr) {
          return new Response(JSON.stringify({ error: `Failed to update role: ${roleErr.message}` }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      // Update full_name on profiles + auth user metadata
      if (fullName !== undefined) {
        const { error: profErr } = await adminClient
          .from("profiles")
          .update({ full_name: fullName })
          .eq("user_id", userId);
        if (profErr) {
          return new Response(JSON.stringify({ error: `Failed to update profile: ${profErr.message}` }), {
            status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
        try {
          await adminClient.auth.admin.updateUserById(userId, {
            user_metadata: { full_name: fullName },
          });
        } catch (_e) {
          // non-fatal — profile is the source of truth in the UI
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
