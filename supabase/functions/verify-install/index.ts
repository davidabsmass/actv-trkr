// Post-install smoke test. Called from /admin-setup or programmatically after
// a new site connects. Returns a structured pass/fail report so we (and the
// user) can see exactly what's healthy and what isn't.
//
// Checks:
//   1. Org name matches at least one of its sites' domains
//   2. At least one site exists for the org
//   3. Site has received a heartbeat in the last 24h
//   4. Forms have been discovered (count > 0)
//   5. Every active form has a matching form_integration
//   6. domain_health row exists
//   7. ssl_health row exists
//   8. Tracking pixel has reported a pageview in the last 24h

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Check {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: caller must be an org member.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { org_id?: string; site_id?: string } = {};
  try { body = await req.json(); } catch {}
  const orgId = body.org_id;
  if (!orgId) {
    return new Response(JSON.stringify({ error: "Missing org_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify membership
  const { data: membership } = await userClient
    .from("org_users").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (!membership) {
    return new Response(JSON.stringify({ error: "Not a member of this org" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role for the actual checks (bypass RLS for accurate counts).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const checks: Check[] = [];
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // 1 & 2: org name + sites
  const { data: org } = await admin.from("orgs").select("name").eq("id", orgId).maybeSingle();
  const { data: sites } = await admin.from("sites").select("id, domain, last_heartbeat_at").eq("org_id", orgId);
  const siteList = sites || [];
  const targetSite = body.site_id
    ? siteList.find((s: any) => s.id === body.site_id)
    : siteList[0];

  if (siteList.length === 0) {
    checks.push({ key: "site_exists", label: "Site is registered", status: "fail",
      detail: "No sites found for this org. Connect the WordPress plugin first." });
  } else {
    checks.push({ key: "site_exists", label: "Site is registered", status: "pass",
      detail: `${siteList.length} site(s)` });

    const orgName = (org?.name || "").toLowerCase();
    const domains = siteList.map((s: any) => (s.domain || "").toLowerCase());
    if (domains.includes(orgName)) {
      checks.push({ key: "org_name_match", label: "Org name matches site", status: "pass" });
    } else {
      checks.push({ key: "org_name_match", label: "Org name matches site", status: "warn",
        detail: `Org name "${org?.name}" does not match any site domain (${domains.join(", ")}). Will auto-correct on next heartbeat.` });
    }
  }

  if (targetSite) {
    // 3: heartbeat fresh
    const lastHb = targetSite.last_heartbeat_at;
    if (lastHb && lastHb > dayAgo) {
      checks.push({ key: "heartbeat_fresh", label: "Recent heartbeat received", status: "pass",
        detail: `Last: ${lastHb}` });
    } else {
      checks.push({ key: "heartbeat_fresh", label: "Recent heartbeat received", status: "fail",
        detail: lastHb ? `Stale (${lastHb})` : "Never received" });
    }

    // 4 & 5: forms + integrations parity
    const [{ count: formsCount }, { count: intCount }] = await Promise.all([
      admin.from("forms").select("id", { count: "exact", head: true })
        .eq("site_id", targetSite.id).eq("archived", false).eq("is_active", true),
      admin.from("form_integrations").select("id", { count: "exact", head: true })
        .eq("site_id", targetSite.id),
    ]);
    const fN = formsCount || 0;
    const iN = intCount || 0;

    if (fN === 0) {
      checks.push({ key: "forms_discovered", label: "Forms discovered", status: "warn",
        detail: "No forms yet. May be normal if site has no forms." });
    } else {
      checks.push({ key: "forms_discovered", label: "Forms discovered", status: "pass",
        detail: `${fN} form(s)` });
    }

    if (fN === 0) {
      checks.push({ key: "integration_parity", label: "Form integrations created", status: "pass",
        detail: "N/A (no forms)" });
    } else if (iN >= fN) {
      checks.push({ key: "integration_parity", label: "Form integrations created", status: "pass",
        detail: `${iN} integration(s) for ${fN} form(s)` });
    } else {
      checks.push({ key: "integration_parity", label: "Form integrations created", status: "fail",
        detail: `Only ${iN} integration(s) for ${fN} active form(s). Reconciler will fix within 15 min.` });
    }

    // 6 & 7: domain + ssl health
    const [{ count: dh }, { count: sh }] = await Promise.all([
      admin.from("domain_health").select("id", { count: "exact", head: true }).eq("site_id", targetSite.id),
      admin.from("ssl_health").select("id", { count: "exact", head: true }).eq("site_id", targetSite.id),
    ]);
    checks.push({ key: "domain_health", label: "Domain health recorded",
      status: (dh || 0) > 0 ? "pass" : "fail",
      detail: (dh || 0) > 0 ? "Recorded" : "Missing — auto-trigger pending" });
    checks.push({ key: "ssl_health", label: "SSL health recorded",
      status: (sh || 0) > 0 ? "pass" : "fail",
      detail: (sh || 0) > 0 ? "Recorded" : "Missing — auto-trigger pending" });

    // 8: tracking pixel
    const { count: pvCount } = await admin.from("pageviews")
      .select("id", { count: "exact", head: true })
      .eq("site_id", targetSite.id).gte("occurred_at", dayAgo);
    if ((pvCount || 0) > 0) {
      checks.push({ key: "tracking_active", label: "Tracking pixel reporting", status: "pass",
        detail: `${pvCount} pageview(s) in last 24h` });
    } else {
      checks.push({ key: "tracking_active", label: "Tracking pixel reporting", status: "warn",
        detail: "No pageviews in last 24h. Verify the tracking script is installed." });
    }
  }

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const overall = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  return new Response(JSON.stringify({
    overall,
    fail_count: failCount,
    warn_count: warnCount,
    pass_count: checks.length - failCount - warnCount,
    checks,
    org_id: orgId,
    site_id: targetSite?.id || null,
    checked_at: new Date().toISOString(),
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
