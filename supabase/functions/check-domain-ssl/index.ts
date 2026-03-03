import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function checkDomainExpiry(domain: string): Promise<{ expiry: string | null; source: string }> {
  try {
    const resp = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return { expiry: null, source: "rdap" };
    const data = await resp.json();
    const expiryEvent = data.events?.find((e: any) => e.eventAction === "expiration");
    if (expiryEvent?.eventDate) {
      return { expiry: expiryEvent.eventDate.split("T")[0], source: "rdap" };
    }
    return { expiry: null, source: "rdap" };
  } catch {
    return { expiry: null, source: "unknown" };
  }
}

async function checkSSLExpiry(domain: string): Promise<{ expiry: string | null; issuer: string | null }> {
  // We can't do TLS handshake from Edge Functions directly.
  // Use a free API or parse from headers as a best-effort.
  try {
    const resp = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    // Edge functions can't inspect TLS cert directly, so we use the response headers
    // as a connectivity check. For actual SSL expiry, we'd need a dedicated service.
    // For now, mark as checked and rely on manual entry or future enhancement.
    return { expiry: null, issuer: null };
  } catch {
    return { expiry: null, issuer: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sites } = await supabase.from("sites").select("id, org_id, domain");
    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    let checked = 0;
    const alertThresholds = [60, 30, 14, 7];

    for (const site of sites) {
      if (!site.domain) continue;

      // Domain expiry
      const domainResult = await checkDomainExpiry(site.domain);
      const domainExpiry = domainResult.expiry ? new Date(domainResult.expiry) : null;
      const daysToDomain = domainExpiry ? Math.ceil((domainExpiry.getTime() - now.getTime()) / 86400000) : null;

      await supabase.from("domain_health").upsert({
        site_id: site.id,
        org_id: site.org_id,
        domain: site.domain,
        domain_expiry_date: domainResult.expiry,
        days_to_domain_expiry: daysToDomain,
        source: domainResult.source,
        last_checked_at: now.toISOString(),
      }, { onConflict: "site_id" });

      // Alert if domain expiring soon
      if (daysToDomain !== null && alertThresholds.includes(daysToDomain)) {
        await supabase.from("monitoring_alerts").insert({
          site_id: site.id,
          org_id: site.org_id,
          alert_type: "DOMAIN_EXPIRING",
          severity: daysToDomain <= 7 ? "critical" : "warning",
          subject: `Domain expiring: ${site.domain}`,
          message: `Domain expires in ${daysToDomain} days.`,
        });
      }

      // SSL check (basic connectivity)
      const sslResult = await checkSSLExpiry(site.domain);
      await supabase.from("ssl_health").upsert({
        site_id: site.id,
        org_id: site.org_id,
        ssl_expiry_date: sslResult.expiry,
        days_to_ssl_expiry: null,
        issuer: sslResult.issuer,
        last_checked_at: now.toISOString(),
      }, { onConflict: "site_id" });

      checked++;
    }

    return new Response(JSON.stringify({ status: "ok", checked }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Domain/SSL check error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
