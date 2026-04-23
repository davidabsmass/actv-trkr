// Self-healing reconciler. Runs every 15 minutes via pg_cron.
// Catches anything the heartbeat path missed:
//   1. Sites with active forms but missing form_integrations  → trigger sync
//   2. Sites with no domain_health/ssl_health rows             → trigger check
//   3. Orgs whose name doesn't match any of their sites        → rename
//
// Read-only on success (idempotent triggers). Always returns a JSON report so
// it's auditable from edge function logs.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface ReconcileReport {
  scanned_sites: number;
  scanned_orgs: number;
  integration_drift_fixed: number;
  domain_health_triggered: number;
  org_renames_applied: number;
  errors: Array<{ where: string; site_id?: string; org_id?: string; error: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Cron-only endpoint: require shared secret.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const report: ReconcileReport = {
    scanned_sites: 0,
    scanned_orgs: 0,
    integration_drift_fixed: 0,
    domain_health_triggered: 0,
    org_renames_applied: 0,
    errors: [],
  };

  // ── 1. Forms ↔ form_integrations drift ─────────────────────────────────
  // For each site, count active forms vs distinct form_integrations.
  // If forms > 0 and integrations < forms, trigger sync.
  try {
    const { data: sites } = await supabase
      .from("sites")
      .select("id, org_id, domain, status")
      .eq("status", "UP");
    report.scanned_sites = sites?.length || 0;

    for (const site of sites || []) {
      const [{ count: formsCount }, { count: integrationCount }] = await Promise.all([
        supabase.from("forms").select("id", { count: "exact", head: true })
          .eq("site_id", site.id).eq("archived", false).eq("is_active", true),
        supabase.from("form_integrations").select("id", { count: "exact", head: true })
          .eq("site_id", site.id),
      ]);

      const formsN = formsCount || 0;
      const intN = integrationCount || 0;
      if (formsN > 0 && intN < formsN) {
        report.integration_drift_fixed++;
        console.log(JSON.stringify({
          level: "warn",
          event: "integration_drift_detected",
          site_id: site.id,
          org_id: site.org_id,
          domain: site.domain,
          forms: formsN,
          integrations: intN,
        }));
        // Fire-and-forget sync trigger (refreshes the `forms` table).
        fetch(`${supabaseUrl}/functions/v1/trigger-site-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ site_id: site.id, force_form_probe: true }),
        }).catch((e) => console.error(`reconciler: sync trigger failed for ${site.id}:`, e));

        // ── Bootstrap missing form_integrations directly ──
        // trigger-site-sync only refreshes the `forms` table; it does NOT
        // create `form_integrations`. Without integrations, no import jobs run
        // and Overview/leads stay empty even though raw events arrive.
        // We backfill integrations here using the same logic as the Settings
        // "Re-scan" button, but server-side and idempotent.
        try {
          const { data: existingForms } = await supabase
            .from("forms")
            .select("provider, external_form_id, name")
            .eq("site_id", site.id)
            .eq("archived", false)
            .eq("is_active", true);

          for (const f of existingForms || []) {
            await supabase
              .from("form_integrations")
              .upsert({
                site_id: site.id,
                org_id: site.org_id,
                builder_type: f.provider || "gravity_forms",
                external_form_id: String(f.external_form_id),
                form_name: f.name || `Form ${f.external_form_id}`,
                is_active: true,
                status: "detected",
              }, { onConflict: "site_id,builder_type,external_form_id" });
          }
          console.log(JSON.stringify({
            level: "info",
            event: "reconciler_bootstrapped_integrations",
            site_id: site.id,
            count: existingForms?.length || 0,
          }));
        } catch (e) {
          report.errors.push({
            where: "integration_bootstrap",
            site_id: site.id,
            error: String(e),
          });
        }
      }

      // Domain/SSL health presence
      const [{ count: dhCount }, { count: sslCount }] = await Promise.all([
        supabase.from("domain_health").select("id", { count: "exact", head: true }).eq("site_id", site.id),
        supabase.from("ssl_health").select("id", { count: "exact", head: true }).eq("site_id", site.id),
      ]);
      if ((dhCount || 0) === 0 || (sslCount || 0) === 0) {
        report.domain_health_triggered++;
        fetch(`${supabaseUrl}/functions/v1/check-domain-ssl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ site_id: site.id }),
        }).catch((e) => console.error(`reconciler: domain check failed for ${site.id}:`, e));
      }
    }
  } catch (err) {
    report.errors.push({ where: "forms_drift_scan", error: String(err) });
  }

  // ── 2. Org name mismatch ───────────────────────────────────────────────
  try {
    const { data: orgs } = await supabase.from("orgs").select("id, name");
    report.scanned_orgs = orgs?.length || 0;

    for (const org of orgs || []) {
      const { data: sitesForOrg } = await supabase
        .from("sites").select("domain, created_at").eq("org_id", org.id);
      if (!sitesForOrg || sitesForOrg.length === 0) continue;

      const currentName = (org.name || "").trim().toLowerCase();
      const domains = sitesForOrg.map((s: any) => (s.domain || "").toLowerCase()).filter(Boolean);
      if (domains.length === 0) continue;
      if (domains.includes(currentName)) continue;

      // Mismatch → rename to oldest site's domain.
      const oldest = sitesForOrg.slice().sort((a: any, b: any) => {
        const at = a.created_at ? Date.parse(a.created_at) : 0;
        const bt = b.created_at ? Date.parse(b.created_at) : 0;
        return at - bt;
      })[0];
      const newName = (oldest?.domain || domains[0]).toLowerCase();
      if (!newName || newName === currentName) continue;

      const { error: upErr } = await supabase.from("orgs").update({ name: newName }).eq("id", org.id);
      if (upErr) {
        report.errors.push({ where: "org_rename", org_id: org.id, error: upErr.message });
        continue;
      }
      report.org_renames_applied++;
      console.log(JSON.stringify({
        level: "info",
        event: "reconciler_renamed_org",
        org_id: org.id,
        from: org.name,
        to: newName,
      }));
    }
  } catch (err) {
    report.errors.push({ where: "org_rename_scan", error: String(err) });
  }

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
