import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function checkDomainExpiry(domain: string): Promise<{ expiry: string | null; source: string }> {
  // Strip www. for RDAP lookup
  const baseDomain = domain.replace(/^www\./, "");
  try {
    const resp = await fetch(`https://rdap.org/domain/${baseDomain}`, {
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

async function checkSSLExpiry(domain: string): Promise<{ expiry: string | null; issuer: string | null; daysLeft: number | null }> {
  // Use crt.sh to find the latest certificate for this domain
  try {
    const resp = await fetch(
      `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) {
      console.log(`crt.sh returned ${resp.status} for ${domain}`);
      return { expiry: null, issuer: null, daysLeft: null };
    }
    const certs: any[] = await resp.json();
    if (!certs || certs.length === 0) {
      return { expiry: null, issuer: null, daysLeft: null };
    }

    // Find the cert with the latest not_after that is still valid
    const now = new Date();
    const validCerts = certs
      .filter((c: any) => new Date(c.not_after) > now && new Date(c.not_before) <= now)
      .sort((a: any, b: any) => new Date(b.not_after).getTime() - new Date(a.not_after).getTime());

    if (validCerts.length === 0) {
      return { expiry: null, issuer: null, daysLeft: null };
    }

    const latest = validCerts[0];
    const expiryDate = new Date(latest.not_after);
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
    const expiryStr = expiryDate.toISOString().split("T")[0];
    const issuer = latest.issuer_name || null;

    return { expiry: expiryStr, issuer, daysLeft };
  } catch (err) {
    console.error(`SSL check error for ${domain}:`, err);
    return { expiry: null, issuer: null, daysLeft: null };
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

    // Deduplicate by domain to avoid redundant lookups
    const uniqueDomains = new Map<string, typeof sites>();
    for (const site of sites) {
      if (!site.domain) continue;
      const base = site.domain.replace(/^www\./, "");
      if (!uniqueDomains.has(base)) uniqueDomains.set(base, []);
      uniqueDomains.get(base)!.push(site);
    }

    const now = new Date();
    let checked = 0;
    const alertThresholds = [60, 30, 14, 7];

    for (const [baseDomain, domainSites] of uniqueDomains) {
      // Domain expiry (use base domain)
      const domainResult = await checkDomainExpiry(baseDomain);
      const domainExpiry = domainResult.expiry ? new Date(domainResult.expiry) : null;
      const daysToDomain = domainExpiry ? Math.ceil((domainExpiry.getTime() - now.getTime()) / 86400000) : null;

      // SSL expiry (check actual domain including www if present)
      const sslDomain = domainSites[0].domain;
      const sslResult = await checkSSLExpiry(sslDomain);

      // Apply to all sites with this base domain
      for (const site of domainSites) {
        await supabase.from("domain_health").upsert({
          site_id: site.id,
          org_id: site.org_id,
          domain: site.domain,
          domain_expiry_date: domainResult.expiry,
          days_to_domain_expiry: daysToDomain,
          source: domainResult.source,
          last_checked_at: now.toISOString(),
        }, { onConflict: "site_id" });

        await supabase.from("ssl_health").upsert({
          site_id: site.id,
          org_id: site.org_id,
          ssl_expiry_date: sslResult.expiry,
          days_to_ssl_expiry: sslResult.daysLeft,
          issuer: sslResult.issuer,
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

        // Alert if SSL expiring soon
        if (sslResult.daysLeft !== null && alertThresholds.includes(sslResult.daysLeft)) {
          await supabase.from("monitoring_alerts").insert({
            site_id: site.id,
            org_id: site.org_id,
            alert_type: "SSL_EXPIRING",
            severity: sslResult.daysLeft <= 7 ? "critical" : "warning",
            subject: `SSL expiring: ${site.domain}`,
            message: `SSL certificate expires in ${sslResult.daysLeft} days.`,
          });
        }

        checked++;
      }
    }

    return new Response(JSON.stringify({ status: "ok", checked }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Domain/SSL check error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
