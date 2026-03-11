import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithRetry(url: string, opts: RequestInit = {}, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
      if (resp.ok) return resp;
      if (i < retries) {
        console.log(`Retry ${i + 1} for ${url} (status ${resp.status})`);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return resp;
    } catch (err) {
      if (i < retries) {
        console.log(`Retry ${i + 1} for ${url} after error: ${err}`);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

async function checkDomainExpiry(domain: string): Promise<{ expiry: string | null; source: string }> {
  const baseDomain = domain.replace(/^www\./, "");
  try {
    const resp = await fetchWithRetry(`https://rdap.org/domain/${baseDomain}`);
    if (!resp.ok) {
      console.log(`RDAP returned ${resp.status} for ${baseDomain}`);
      return { expiry: null, source: "rdap" };
    }
    const data = await resp.json();
    const expiryEvent = data.events?.find((e: any) => e.eventAction === "expiration");
    if (expiryEvent?.eventDate) {
      return { expiry: expiryEvent.eventDate.split("T")[0], source: "rdap" };
    }
    console.log(`RDAP: no expiration event found for ${baseDomain}`);
    return { expiry: null, source: "rdap" };
  } catch (err) {
    console.error(`RDAP lookup failed for ${baseDomain}:`, err);
    return { expiry: null, source: "unknown" };
  }
}

async function checkSSLExpiry(domain: string): Promise<{ expiry: string | null; issuer: string | null; daysLeft: number | null }> {
  try {
    const resp = await fetchWithRetry(
      `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`
    );
    if (!resp.ok) {
      console.log(`crt.sh returned ${resp.status} for ${domain}`);
      return { expiry: null, issuer: null, daysLeft: null };
    }
    const certs: any[] = await resp.json();
    if (!certs || certs.length === 0) {
      console.log(`crt.sh: no certs found for ${domain}`);
      return { expiry: null, issuer: null, daysLeft: null };
    }

    const now = new Date();
    const validCerts = certs
      .filter((c: any) => new Date(c.not_after) > now && new Date(c.not_before) <= now)
      .sort((a: any, b: any) => new Date(b.not_after).getTime() - new Date(a.not_after).getTime());

    if (validCerts.length === 0) {
      console.log(`crt.sh: no currently valid certs for ${domain}`);
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

    // Deduplicate by domain
    const uniqueDomains = new Map<string, typeof sites>();
    for (const site of sites) {
      if (!site.domain) continue;
      const base = site.domain.replace(/^www\./, "");
      if (!uniqueDomains.has(base)) uniqueDomains.set(base, []);
      uniqueDomains.get(base)!.push(site);
    }

    const now = new Date();
    let checked = 0;
    const results: Record<string, any> = {};
    const alertThresholds = [30, 7, 5, 3, 1];

    for (const [baseDomain, domainSites] of uniqueDomains) {
      const domainResult = await checkDomainExpiry(baseDomain);
      const domainExpiry = domainResult.expiry ? new Date(domainResult.expiry) : null;
      const daysToDomain = domainExpiry ? Math.ceil((domainExpiry.getTime() - now.getTime()) / 86400000) : null;

      const sslDomain = domainSites[0].domain;
      const sslResult = await checkSSLExpiry(sslDomain);

      results[baseDomain] = { domain: domainResult, ssl: sslResult };

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

    console.log("Domain/SSL check results:", JSON.stringify(results));
    return new Response(JSON.stringify({ status: "ok", checked, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Domain/SSL check error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
