import { appCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  logSecurityEvent,
  hashIp,
  extractClientIp,
  newRequestId,
} from "../_shared/security-audit.ts";

// Aggregates everything support needs about a customer in ONE response.
// Stripe data here is READ-ONLY context. All billing edits remain in the
// existing admin-manage-user function and ultimately in Stripe itself.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: appCorsHeaders(req) });
  }

  const requestId = newRequestId();
  const userAgent = req.headers.get("user-agent");
  const clientIp = extractClientIp(req);
  const ipHash = clientIp ? await hashIp(clientIp) : null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401, req);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } =
      await anonClient.auth.getUser();
    if (authError || !caller) return json({ error: "Not authenticated" }, 401, req);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      await logSecurityEvent({
        event_type: "admin_customer_detail_denied",
        severity: "warn",
        actor_type: "user",
        user_id: caller.id,
        ip_hash: ipHash,
        user_agent: userAgent,
        request_id: requestId,
        message: "Non-admin attempted admin-customer-detail",
      });
      return json({ error: "Admin access required" }, 403, req);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const subscriberId = String(body.subscriber_id || "").trim() || null;
    if (!email && !subscriberId) {
      return json({ error: "email or subscriber_id required" }, 400, req);
    }

    // ── Subscriber row ──────────────────────────────────────────────────
    let subscriberQuery = adminClient.from("subscribers").select("*").limit(1);
    if (subscriberId) subscriberQuery = subscriberQuery.eq("id", subscriberId);
    else subscriberQuery = subscriberQuery.ilike("email", email);
    const { data: subscriberRows } = await subscriberQuery;
    const subscriber = subscriberRows?.[0] || null;
    const resolvedEmail = (subscriber?.email || email || "").toLowerCase();

    // ── Profile + auth user ─────────────────────────────────────────────
    const { data: profile } = await adminClient
      .from("profiles")
      .select("*")
      .ilike("email", resolvedEmail)
      .maybeSingle();

    let authUser: any = null;
    let lastSignInAt: string | null = null;
    if (profile?.user_id) {
      const { data: authData } = await adminClient.auth.admin.getUserById(profile.user_id);
      authUser = authData?.user || null;
      lastSignInAt = authUser?.last_sign_in_at || null;
    }

    // ── Org membership(s) ───────────────────────────────────────────────
    let orgs: any[] = [];
    if (profile?.user_id) {
      const { data: memberships } = await adminClient
        .from("org_users")
        .select("role, org_id, orgs(id, name, timezone, billing_exempt, created_at)")
        .eq("user_id", profile.user_id);
      orgs = (memberships || []).map((m: any) => ({
        org_id: m.org_id,
        role: m.role,
        ...(m.orgs || {}),
      }));
    }

    const orgIds = orgs.map((o) => o.org_id).filter(Boolean);

    // ── Sites + plugin + tracking + import jobs (org-scoped) ────────────
    let sites: any[] = [];
    let siteSettings: any[] = [];
    let importJobs: any[] = [];
    let recentAlerts: any[] = [];
    let consentConfigs: any[] = [];
    let teamMembers: any[] = [];

    if (orgIds.length) {
      const [sitesRes, settingsRes, jobsRes, alertsRes, consentRes, membersRes] =
        await Promise.all([
          adminClient
            .from("sites")
            .select("id, org_id, domain, plugin_version, status, last_heartbeat_at, plan_tier, created_at")
            .in("org_id", orgIds),
          adminClient.from("site_settings").select("*").in("org_id", orgIds),
          adminClient
            .from("form_import_jobs")
            .select("id, org_id, status, total_expected, total_processed, last_error, updated_at")
            .in("org_id", orgIds)
            .order("updated_at", { ascending: false })
            .limit(20),
          adminClient
            .from("alerts")
            .select("id, org_id, severity, title, date, created_at")
            .in("org_id", orgIds)
            .order("created_at", { ascending: false })
            .limit(10),
          adminClient
            .from("consent_config")
            .select("org_id, consent_mode, require_consent_before_tracking, retention_months, updated_at")
            .in("org_id", orgIds),
          adminClient
            .from("org_users")
            .select("org_id, role, user_id, profiles:profiles!inner(email, full_name)")
            .in("org_id", orgIds),
        ]);
      sites = sitesRes.data || [];
      siteSettings = settingsRes.data || [];
      importJobs = jobsRes.data || [];
      recentAlerts = alertsRes.data || [];
      consentConfigs = consentRes.data || [];
      teamMembers = (membersRes.data || []).map((m: any) => ({
        org_id: m.org_id,
        user_id: m.user_id,
        role: m.role,
        email: m.profiles?.email,
        full_name: m.profiles?.full_name,
      }));
    }

    // ── Notes (timestamped log) ─────────────────────────────────────────
    let notesQuery = adminClient
      .from("admin_notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (orgIds.length) {
      // Pull notes attached to any of this user's orgs OR matching their email/subscriber
      const filters: string[] = [];
      filters.push(`org_id.in.(${orgIds.join(",")})`);
      if (subscriber?.id) filters.push(`subscriber_id.eq.${subscriber.id}`);
      if (resolvedEmail) filters.push(`subscriber_email.eq.${resolvedEmail}`);
      notesQuery = notesQuery.or(filters.join(","));
    } else if (subscriber?.id) {
      notesQuery = notesQuery.eq("subscriber_id", subscriber.id);
    } else {
      notesQuery = notesQuery.eq("subscriber_email", resolvedEmail);
    }
    const { data: notesRaw } = await notesQuery;
    // Decrypt body_encrypted (when present) so the admin UI sees plaintext.
    const notes = await Promise.all(
      (notesRaw || []).map(async (n: any) => {
        if (n.body_encrypted) {
          const { data: dec } = await adminClient.rpc("decrypt_admin_note", {
            p_ciphertext: n.body_encrypted,
          });
          return { ...n, body: dec || n.body, body_encrypted: undefined };
        }
        return n;
      }),
    );

    // ── Stripe (read-only summary + deep links) ─────────────────────────
    let stripeSummary: any = null;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && resolvedEmail) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const customers = await stripe.customers.list({ email: resolvedEmail, limit: 1 });
        const customer = customers.data[0];
        if (customer) {
          const [subs, invoices] = await Promise.all([
            stripe.subscriptions.list({
              customer: customer.id,
              limit: 5,
              expand: ["data.items.data.price.product", "data.discount.coupon"],
            }),
            stripe.invoices.list({ customer: customer.id, limit: 1 }),
          ]);
          const active = subs.data.find((s) => s.status === "active") || subs.data[0] || null;
          const item = active?.items?.data?.[0];
          const price = item?.price;
          const product = price && typeof price.product !== "string" ? price.product : null;
          const coupon = (active as any)?.discount?.coupon || null;
          const lastInvoice = invoices.data[0] || null;
          stripeSummary = {
            customer_id: customer.id,
            customer_url: `https://dashboard.stripe.com/customers/${customer.id}`,
            invoices_url: `https://dashboard.stripe.com/customers/${customer.id}#invoices`,
            coupon: coupon
              ? { id: coupon.id, name: coupon.name, percent_off: coupon.percent_off, amount_off: coupon.amount_off }
              : null,
            last_payment: lastInvoice
              ? {
                  amount_paid: (lastInvoice.amount_paid || 0) / 100,
                  status: lastInvoice.status,
                  paid_at: lastInvoice.status_transitions?.paid_at || null,
                  hosted_invoice_url: lastInvoice.hosted_invoice_url || null,
                }
              : null,
            subscription: active
              ? {
                  id: active.id,
                  url: `https://dashboard.stripe.com/subscriptions/${active.id}`,
                  status: active.status,
                  plan_name: (product as any)?.name || price?.nickname || price?.id,
                  amount: (price?.unit_amount || 0) / 100,
                  currency: price?.currency || "usd",
                  interval: price?.recurring?.interval || "month",
                  current_period_end: active.current_period_end || null,
                  cancel_at_period_end: active.cancel_at_period_end,
                  cancel_at: active.cancel_at,
                }
              : null,
          };
        }
      } catch (e) {
        stripeSummary = { error: (e as Error).message };
      }
    }

    // Audit: every successful read of a customer record is logged.
    await logSecurityEvent({
      event_type: "admin_customer_detail_read",
      severity: "info",
      actor_type: "admin",
      user_id: caller.id,
      org_id: orgIds[0] ?? null,
      ip_hash: ipHash,
      user_agent: userAgent,
      request_id: requestId,
      message: `Admin read customer detail for ${resolvedEmail}`,
      metadata: { email: resolvedEmail, subscriber_id: subscriber?.id ?? null },
    });

    return json(
      {
        subscriber,
        profile,
        auth: authUser
          ? {
              id: authUser.id,
              email: authUser.email,
              banned_until: authUser.banned_until || null,
              last_sign_in_at: lastSignInAt,
              email_confirmed_at: authUser.email_confirmed_at || null,
              created_at: authUser.created_at || null,
            }
          : null,
        orgs,
        sites,
        site_settings: siteSettings,
        import_jobs: importJobs,
        recent_alerts: recentAlerts,
        consent_configs: consentConfigs,
        team_members: teamMembers,
        notes: notes || [],
        stripe: stripeSummary,
      },
      200,
      req,
    );
  } catch (err) {
    return json({ error: (err as Error).message }, 500, req);
  }
});

function json(payload: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
  });
}
