import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonResponse = {
  ok: boolean;
  checked?: number;
  results?: Record<string, any>;
  failures?: Array<Record<string, any>>;
  error?: string;
  diagnostics?: Record<string, any>;
};

function respond(payload: JsonResponse) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithRetry(url: string, opts: RequestInit = {}, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
      if (resp.ok) return resp;
      if (i < retries) {
        console.log(`Retry ${i + 1} for ${url} (status ${resp.status})`);
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return resp;
    } catch (err) {
      if (i < retries) {
        console.log(`Retry ${i + 1} for ${url} after error: ${err}`);
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
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
    const resp = await fetchWithRetry(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`);
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const incomingCronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const isServiceRole = serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;
    const isCronAuth = !!(cronSecret && incomingCronSecret === cronSecret);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const targetSiteId = typeof body?.site_id === "string" ? body.site_id : null;
    let allowedOrgIds: string[] | null = null;
    let userId: string | null = null;

    if (!isCronAuth && !isServiceRole) {
      if (!authHeader) {
        return respond({
          ok: false,
          error: "Unauthorized",
          diagnostics: { error_stage: "auth_missing", processing_time_ms: Date.now() - startedAt },
        });
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });

      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) {
        return respond({
          ok: false,
          error: "Unauthorized",
          diagnostics: {
            error_stage: "auth_invalid",
            auth_error: authError?.message || null,
            processing_time_ms: Date.now() - startedAt,
          },
        });
      }

      userId = authData.user.id;
      const { data: memberships, error: membershipError } = await adminClient
        .from("org_users")
        .select("org_id")
        .eq("user_id", userId);

      if (membershipError) {
        return respond({
          ok: false,
          error: "Unable to verify site access",
          diagnostics: {
            error_stage: "membership_lookup_failed",
            membership_error: membershipError.message,
            processing_time_ms: Date.now() - startedAt,
          },
        });
      }

      allowedOrgIds = [...new Set((memberships || []).map((row) => row.org_id).filter(Boolean))];
      if (allowedOrgIds.length === 0) {
        return respond({
          ok: false,
          error: "No accessible sites found",
          checked: 0,
          diagnostics: { error_stage: "no_org_membership", processing_time_ms: Date.now() - startedAt },
        });
      }
    }

    let query = adminClient.from("sites").select("id, org_id, domain");
    if (targetSiteId) {
      query = query.eq("id", targetSiteId);
    }
    if (allowedOrgIds) {
      query = query.in("org_id", allowedOrgIds);
    }

    const { data: sites, error: sitesError } = await query;
    if (sitesError) {
      return respond({
        ok: false,
        error: "Unable to load sites",
        diagnostics: {
          error_stage: "sites_lookup_failed",
          sites_error: sitesError.message,
          processing_time_ms: Date.now() - startedAt,
        },
      });
    }

    if (!sites || sites.length === 0) {
      return respond({
        ok: false,
        error: targetSiteId ? "Site not found or not accessible" : "No accessible sites found",
        checked: 0,
        diagnostics: {
          error_stage: "no_sites",
          target_site_id: targetSiteId,
          user_id: userId,
          processing_time_ms: Date.now() - startedAt,
        },
      });
    }

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
    const failures: Array<Record<string, any>> = [];
    const alertThresholds = [30, 7, 5, 3, 1];

    for (const [baseDomain, domainSites] of uniqueDomains) {
      try {
        const domainResult = await checkDomainExpiry(baseDomain);
        const domainExpiry = domainResult.expiry ? new Date(domainResult.expiry) : null;
        const daysToDomain = domainExpiry ? Math.ceil((domainExpiry.getTime() - now.getTime()) / 86400000) : null;

        const sslDomain = domainSites[0].domain;
        const sslResult = await checkSSLExpiry(sslDomain);

        results[baseDomain] = { domain: domainResult, ssl: sslResult };

        for (const site of domainSites) {
          const nowIso = now.toISOString();

          const domainRow: Record<string, any> = {
            site_id: site.id,
            org_id: site.org_id,
            domain: site.domain,
            source: domainResult.source,
            last_checked_at: nowIso,
          };
          if (domainResult.expiry) {
            domainRow.domain_expiry_date = domainResult.expiry;
            domainRow.days_to_domain_expiry = daysToDomain;
          }

          const { data: existingDomain, error: existingDomainError } = await adminClient
            .from("domain_health")
            .select("id")
            .eq("site_id", site.id)
            .maybeSingle();

          if (existingDomainError) {
            failures.push({ site_id: site.id, domain: site.domain, stage: "domain_health_lookup", error: existingDomainError.message });
            continue;
          }

          const domainWrite = existingDomain
            ? await adminClient.from("domain_health").update(domainRow).eq("site_id", site.id)
            : await adminClient.from("domain_health").insert(domainRow);

          if (domainWrite.error) {
            failures.push({ site_id: site.id, domain: site.domain, stage: "domain_health_write", error: domainWrite.error.message });
            continue;
          }

          const sslRow: Record<string, any> = {
            site_id: site.id,
            org_id: site.org_id,
            last_checked_at: nowIso,
          };
          if (sslResult.expiry) {
            sslRow.ssl_expiry_date = sslResult.expiry;
            sslRow.days_to_ssl_expiry = sslResult.daysLeft;
            sslRow.issuer = sslResult.issuer;
          }

          const { data: existingSsl, error: existingSslError } = await adminClient
            .from("ssl_health")
            .select("id")
            .eq("site_id", site.id)
            .maybeSingle();

          if (existingSslError) {
            failures.push({ site_id: site.id, domain: site.domain, stage: "ssl_health_lookup", error: existingSslError.message });
            continue;
          }

          const sslWrite = existingSsl
            ? await adminClient.from("ssl_health").update(sslRow).eq("site_id", site.id)
            : await adminClient.from("ssl_health").insert(sslRow);

          if (sslWrite.error) {
            failures.push({ site_id: site.id, domain: site.domain, stage: "ssl_health_write", error: sslWrite.error.message });
            continue;
          }

          if (daysToDomain !== null && alertThresholds.includes(daysToDomain)) {
            const { error: domainAlertError } = await adminClient.from("monitoring_alerts").insert({
              site_id: site.id,
              org_id: site.org_id,
              alert_type: "DOMAIN_EXPIRING",
              severity: daysToDomain <= 5 ? "critical" : "warning",
              subject: `Domain expiring: ${site.domain}`,
              message: `Domain expires in ${daysToDomain} day${daysToDomain === 1 ? "" : "s"}.`,
            });
            if (domainAlertError) {
              console.warn("Domain alert insert failed", { site_id: site.id, error: domainAlertError.message });
            }
          }

          if (sslResult.daysLeft !== null && alertThresholds.includes(sslResult.daysLeft)) {
            const { error: sslAlertError } = await adminClient.from("monitoring_alerts").insert({
              site_id: site.id,
              org_id: site.org_id,
              alert_type: "SSL_EXPIRING",
              severity: sslResult.daysLeft <= 5 ? "critical" : "warning",
              subject: `SSL expiring: ${site.domain}`,
              message: `SSL certificate expires in ${sslResult.daysLeft} day${sslResult.daysLeft === 1 ? "" : "s"}.`,
            });
            if (sslAlertError) {
              console.warn("SSL alert insert failed", { site_id: site.id, error: sslAlertError.message });
            }
          }

          checked++;
        }
      } catch (err) {
        failures.push({
          domain: baseDomain,
          stage: "domain_group_processing",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log("Domain/SSL check results:", JSON.stringify(results));
    return respond({
      ok: failures.length === 0,
      checked,
      results,
      failures: failures.length > 0 ? failures : undefined,
      diagnostics: { target_site_id: targetSiteId, processing_time_ms: Date.now() - startedAt },
    });
  } catch (err) {
    console.error("Domain/SSL check error:", err);
    return respond({
      ok: false,
      error: "Internal server error",
      diagnostics: {
        error_stage: "unexpected_exception",
        message: err instanceof Error ? err.message : String(err),
        processing_time_ms: Date.now() - startedAt,
      },
    });
  }
});
