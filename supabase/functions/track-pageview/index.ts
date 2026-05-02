import { createClient } from "npm:@supabase/supabase-js@2";
import {
  checkRateLimit, validateDomain, extractClientIp, hashIp,
  checkPayloadSize, logAnomaly, sanitizeStr,
} from "../_shared/ingestion-security.ts";
import { authenticateIngestRequest } from "../_shared/ingest-auth.ts";
import { observe } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function isValidEventId(val: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(val);
}

// ── Bot detection ────────────────────────────────────────────────
const BOT_UA_PATTERNS = [
  /bot\b/i, /crawl/i, /spider/i, /slurp/i, /mediapartners/i,
  /googlebot/i, /bingbot/i, /yandexbot/i, /baiduspider/i,
  /duckduckbot/i, /facebookexternalhit/i, /twitterbot/i,
  /linkedinbot/i, /embedly/i, /quora link/i, /showyoubot/i,
  /outbrain/i, /pinterest/i, /applebot/i, /semrushbot/i,
  /ahrefsbot/i, /mj12bot/i, /dotbot/i, /petalbot/i,
  /bytespider/i, /gptbot/i, /chatgpt/i, /claudebot/i,
  /anthropic/i, /ccbot/i, /ia_archiver/i, /archive\.org/i,
  /uptimerobot/i, /pingdom/i, /site24x7/i, /statuscake/i,
  /headlesschrome/i, /phantomjs/i, /selenium/i, /puppeteer/i,
  /wget/i, /curl\//i, /httpie/i, /python-requests/i,
  /go-http-client/i, /java\//i, /libwww/i, /lwp-/i,
  /node-fetch/i, /axios/i, /undici/i, /scrapy/i,
];

function isBot(ua: string | null): boolean {
  if (!ua || ua.length < 10) return true;
  for (const p of BOT_UA_PATTERNS) {
    if (p.test(ua)) return true;
  }
  return false;
}

// ── Referrer spam blocklist ─────────────────────────────────────
const SPAM_REFERRER_DOMAINS = new Set([
  "ebook-search-queen.com", "www.ebook-search-queen.com",
  "panjoy.com", "www.panjoy.com",
  "manyget.com", "www.manyget.com",
  "event-tracking.com", "buttons-for-website.com",
  "share-buttons.xyz", "best-seo-offer.com",
  "free-social-buttons.com", "get-free-traffic-now.com",
  "success-seo.com", "trafficmonetize.org",
  "webmonetizer.net", "youfreetech.com", "rankscanner.com",
  "icons-search.com", "searchgby.com", "oskope.com",
  "wonderfl.com", "verbase.com", "pipl.com",
  "www.123people.com", "www.258.com", "www.casttv.com",
  "www.everyclick.com", "www.findsounds.com", "www.fresheye.com",
  "www.geona.com", "www.goodsearch.com", "www.goofram.com",
  "www.heapr.com", "www.hotbot.com", "www.iconseeker.com",
  "www.ifacnet.com", "www.isearch.com", "www.magportal.com",
  "www.mamma.com", "www.oolone.com", "www.recipebridge.com",
  "www.slider.com", "www.spezify.com", "www.twicsy.com",
  "www.yometa.com", "www.zuula.com",
]);

function isSpamReferrer(referrerDomain: string | null): boolean {
  if (!referrerDomain) return false;
  return SPAM_REFERRER_DOMAINS.has(referrerDomain.toLowerCase());
}

// IP Geolocation cache
const geoCache = new Map<string, { country: string | null; expiresAt: number }>();
const GEO_CACHE_TTL_MS = 3600_000;

let geoApiCallCount = 0;
let geoApiWindowReset = Date.now() + 60_000;
const GEO_API_LIMIT = 40;

function canCallGeoApi(): boolean {
  const now = Date.now();
  if (now > geoApiWindowReset) {
    geoApiCallCount = 0;
    geoApiWindowReset = now + 60_000;
  }
  return geoApiCallCount < GEO_API_LIMIT;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return resp;
  } catch { return null; }
}

async function lookupCountryByIp(ip: string): Promise<string | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;
  const cached = geoCache.get(ip);
  if (cached && Date.now() < cached.expiresAt) return cached.country;
  if (!canCallGeoApi()) return null;

  geoApiCallCount++;
  let country: string | null = null;

  // Primary: ip-api.com (45 req/min unauthenticated, very reliable)
  try {
    const resp = await fetchWithTimeout(`http://ip-api.com/json/${ip}?fields=status,countryCode`, 1500);
    if (resp && resp.ok) {
      const data = await resp.json();
      if (data?.status === "success" && typeof data.countryCode === "string" && data.countryCode.length === 2) {
        country = data.countryCode.toUpperCase();
      }
    }
  } catch { /* fall through */ }

  // Fallback: ipapi.co (rate-limited but useful as secondary)
  if (!country) {
    try {
      const resp = await fetchWithTimeout(`https://ipapi.co/${ip}/json/`, 1500);
      if (resp && resp.ok) {
        const data = await resp.json();
        if (typeof data?.country_code === "string" && data.country_code.length === 2) {
          country = data.country_code.toUpperCase();
        }
      }
    } catch { /* give up */ }
  }

  geoCache.set(ip, { country, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
  return country;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of geoCache) {
    if (now > v.expiresAt) geoCache.delete(k);
  }
}, 600_000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userAgent = req.headers.get("user-agent");
  const clientIp = extractClientIp(req);

  try {
    const rawBody = await req.text();
    const sizeErr = checkPayloadSize(req, rawBody);
    if (sizeErr) {
      return new Response(JSON.stringify({ error: sizeErr }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: any;
    try { body = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Dual-mode auth: prefer narrow-scope ingest token, fall back to legacy admin key.
    const auth = await authenticateIngestRequest({ req, body, supabase, endpoint: "track-pageview" });
    if (!auth.ok) {
      const failed = auth as { ok: false; status: number; error: string; payload?: Record<string, unknown> };
      // Diagnostic logging for 401 storms: helps identify whether sites are
      // sending pageviews without credentials (e.g. stale cached HTML where
      // mmConfig wasn't injected) vs. invalid/revoked tokens.
      if (failed.status === 401) {
        const hasIngestHeader = !!req.headers.get("x-ingest-token");
        const hasAuthHeader = !!req.headers.get("authorization");
        const hasIngestBody = !!body?.ingest_token;
        const hasApiKeyBody = !!body?.api_key;
        const domain = body?.source?.domain || "unknown";
        const pluginVersion = body?.source?.plugin_version || "unknown";
        console.log(`[track-pageview 401] reason="${failed.error}" domain=${domain} v=${pluginVersion} hdr_ingest=${hasIngestHeader} hdr_auth=${hasAuthHeader} body_ingest=${hasIngestBody} body_apikey=${hasApiKeyBody}`);
      }
      const respBody = failed.payload ?? { error: failed.error };
      return new Response(JSON.stringify(respBody), { status: failed.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const orgId = auth.orgId;

    // ── Rate limiting (per-IP + per-org) ──
    const rateCheck = checkRateLimit(clientIp, null, orgId);
    if (!rateCheck.allowed) {
      logAnomaly(supabase, orgId, null, "rate_limit_exceeded", { reason: rateCheck.reason, ip_hash: clientIp ? await hashIp(clientIp) : null });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    // ── Handle time_update (active_seconds update) ──────────────
    if (body.type === "time_update") {
      const eventId = sanitizeStr(body.event?.event_id, 128);
      const activeSeconds = typeof body.event?.active_seconds === "number" ? Math.min(Math.max(0, Math.round(body.event.active_seconds)), 3600) : null;
      const domain = sanitizeStr(body.source?.domain, 253)?.replace(/^www\./i, "");

      if (!eventId || activeSeconds === null || !domain) {
        return new Response(JSON.stringify({ error: "Missing fields for time_update" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: site } = await supabase.from("sites").select("id, allowed_domains").eq("org_id", orgId).eq("domain", domain).maybeSingle();
      if (!site) return new Response(JSON.stringify({ status: "ok", note: "site not found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      await supabase.from("pageviews")
        .update({ active_seconds: activeSeconds })
        .eq("org_id", orgId).eq("site_id", site.id).eq("event_id", eventId);

      // Update tracking status for signal/time_update
      try {
        await supabase.from("site_tracking_status").upsert({
          org_id: orgId,
          site_id: site.id,
          last_event_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          tracker_status: "active",
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,site_id" });
      } catch (stsErr) {
        console.error("Tracking status update error (non-fatal):", stsErr);
      }

      observe(supabase, { orgId, siteId: site.id, endpoint: "track-pageview", status: "ok", details: { kind: "time_update" } });
      return new Response(JSON.stringify({ status: "ok", active_seconds: activeSeconds }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reject bot traffic for standard pageview requests
    if (isBot(userAgent)) {
      return new Response(JSON.stringify({ status: "ok", filtered: "bot" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Standard pageview tracking ──────────────────────────────
    const { source, event, attribution, visitor } = body;

    const pageUrl = sanitizeStr(event?.page_url, 2048);
    if (!pageUrl || !isValidUrl(pageUrl)) {
      return new Response(JSON.stringify({ error: "Missing or invalid page_url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const eventId = sanitizeStr(event?.event_id, 128);
    if (!eventId || !isValidEventId(eventId)) {
      return new Response(JSON.stringify({ error: "Missing or invalid event_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const domain = sanitizeStr(source?.domain, 253)?.replace(/^www\./i, "");
    if (!domain) return new Response(JSON.stringify({ error: "Missing source domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const now = new Date();
    let occurredAt = event.occurred_at ? new Date(event.occurred_at) : now;
    if (isNaN(occurredAt.getTime()) || Math.abs(occurredAt.getTime() - now.getTime()) / 36e5 > 24) occurredAt = now;

    let referrerDomain: string | null = null;
    const referrer = sanitizeStr(event?.referrer, 2048);
    if (referrer) { try { referrerDomain = new URL(referrer).hostname; } catch {} }

    if (isSpamReferrer(referrerDomain)) {
      return new Response(JSON.stringify({ status: "ok", filtered: "spam_referrer" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Self-referral suppression ──────────────────────────────────────
    // If the referrer host is the same as the site's own domain (apex,
    // www-prefixed, or any subdomain), drop it. This prevents internal
    // navigations on multi-host setups (e.g. blog.example.com → example.com)
    // from polluting analytics with the org's own domain as a "top source".
    if (referrerDomain && domain) {
      const refNorm = referrerDomain.toLowerCase().replace(/^www\./, "");
      const siteNorm = domain.toLowerCase().replace(/^www\./, "");
      const siteRoot = siteNorm.split(".").slice(-2).join(".");
      if (refNorm === siteNorm || refNorm.endsWith("." + siteNorm) || refNorm === siteRoot || refNorm.endsWith("." + siteRoot)) {
        referrerDomain = null;
      }
    }

    let pagePath = sanitizeStr(event?.page_path, 2048) || "";
    try { pagePath = new URL(pageUrl).pathname; } catch {}

    // v1.20.9+: Limited Pre-Consent Tracking enforcement.
    // The plugin flags pre-consent pageviews with event.tracking_mode='limited'.
    // We strip every persistent identifier server-side as a defense-in-depth
    // measure — even if a buggy/old client included them, they MUST NOT land
    // in the database. This is also forward-compatible: legacy clients never
    // send the flag, so existing behavior is unchanged.
    const trackingMode = sanitizeStr(event?.tracking_mode, 16) === "limited" ? "limited" : "full";
    const isLimited = trackingMode === "limited";

    const sessionId = isLimited ? "" : sanitizeStr(event?.session_id, 128);
    const visitorId = isLimited ? "" : sanitizeStr(visitor?.visitor_id, 128);
    const title = isLimited ? "" : sanitizeStr(event?.title, 512);
    const device = sanitizeStr(event?.device, 32);
    const pluginVersion = sanitizeStr(source?.plugin_version, 32);
    const siteType = sanitizeStr(source?.type, 32) || "wordpress";

    // ── Drop synthetic "Connection Test" pings from the WP plugin admin ──
    // The plugin's "Test Connection" button posts a pageview with test_-prefixed
    // event_id/session_id/visitor_id and title "Connection Test". Acknowledge
    // with 200 so the admin's UI still reports success, but never persist —
    // these would otherwise pollute Visitor Journeys, session counts, and pageviews.
    const isSyntheticTest =
      (eventId && eventId.startsWith("test_")) ||
      (sessionId && sessionId.startsWith("test_")) ||
      (visitorId && visitorId.startsWith("test_")) ||
      title === "Connection Test";
    if (isSyntheticTest) {
      return new Response(
        JSON.stringify({ status: "ok", filtered: "synthetic_test" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // WP user identity — hash email, never store plain text.
    // v1.20.9+: in limited mode, ignore all WP user identity fields.
    const wpUserId = isLimited ? "" : sanitizeStr(visitor?.wp_user_id, 64);
    const wpUserName = isLimited ? "" : sanitizeStr(visitor?.wp_user_name, 256);
    const wpUserRole = isLimited ? "" : sanitizeStr(visitor?.wp_user_role, 128);
    const rawWpEmail = isLimited ? "" : sanitizeStr(visitor?.wp_user_email, 256);
    const wpUserEmailHash = rawWpEmail ? await hashIp(rawWpEmail) : null;

    // v1.20.9+: limited mode strips UTM/attribution (consent-gated identifiers).
    const utmSource = isLimited ? "" : sanitizeStr(attribution?.utm_source, 256);
    const utmMedium = isLimited ? "" : sanitizeStr(attribution?.utm_medium, 256);
    const utmCampaign = isLimited ? "" : sanitizeStr(attribution?.utm_campaign, 256);
    const utmTerm = isLimited ? "" : sanitizeStr(attribution?.utm_term, 256);
    const utmContent = isLimited ? "" : sanitizeStr(attribution?.utm_content, 256);

    // ── Resolve site with domain validation ──
    let siteId: string | null = null;
    const { data: existing } = await supabase.from("sites").select("id, allowed_domains").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    if (existing) {
      siteId = existing.id;
      // Validate domain against allowed_domains
      const origin = req.headers.get("origin");
      if (existing.allowed_domains && existing.allowed_domains.length > 0) {
        if (!validateDomain(domain, domain, existing.allowed_domains, origin)) {
          logAnomaly(supabase, orgId, siteId, "domain_mismatch", { request_domain: domain, origin });
          return new Response(JSON.stringify({ error: "Domain not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    } else {
      // Auto-create site — set allowed_domains to the domain itself
      const { data: ns } = await supabase.from("sites").insert({
        org_id: orgId, domain, type: siteType, plugin_version: pluginVersion,
        allowed_domains: [domain],
      }).select("id").single();
      siteId = ns?.id || null;
    }

    if (!siteId) return new Response(JSON.stringify({ error: "Failed to resolve site" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Rate limit per site ──
    const siteRate = checkRateLimit(null, siteId, orgId);
    if (!siteRate.allowed) {
      logAnomaly(supabase, orgId, siteId, "site_rate_limit", { reason: siteRate.reason });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    // Resolve country code
    let countryCode = sanitizeStr(req.headers.get("cf-ipcountry") || req.headers.get("x-country-code"), 2)?.toUpperCase() || null;
    if (!countryCode && clientIp) {
      const geoCountry = await lookupCountryByIp(clientIp);
      if (geoCountry) countryCode = geoCountry.toUpperCase();
    }

    // Hash IP for storage instead of raw IP. v1.20.9+: limited mode skips IP hash too.
    const ipHash = isLimited ? null : (clientIp ? await hashIp(clientIp) : (sanitizeStr(visitor?.ip_hash, 128) || null));

    const { error: insertError } = await supabase.from("pageviews").upsert({
      org_id: orgId, site_id: siteId, occurred_at: occurredAt.toISOString(),
      event_id: eventId, visitor_id: visitorId, session_id: sessionId,
      page_url: pageUrl, page_path: pagePath, title,
      referrer, referrer_domain: referrerDomain,
      utm_source: utmSource, utm_medium: utmMedium,
      utm_campaign: utmCampaign, utm_term: utmTerm,
      utm_content: utmContent, device, ip_hash: ipHash,
      country_code: countryCode,
    }, { onConflict: "org_id,site_id,event_id", ignoreDuplicates: true });

    if (insertError) { console.error("Pageview insert error:", insertError); return new Response(JSON.stringify({ error: "Failed to store pageview" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    if (sessionId) {
      await supabase.rpc("upsert_session", {
        p_org_id: orgId, p_site_id: siteId, p_session_id: sessionId,
        p_visitor_id: visitorId || "", p_occurred_at: occurredAt.toISOString(),
        p_page_path: pagePath, p_referrer_domain: referrerDomain || "",
        p_utm_source: utmSource || "", p_utm_medium: utmMedium || "", p_utm_campaign: utmCampaign || "",
      });
    }

    // Upsert identified WP visitor — store hashed email only
    if (visitorId && siteId && wpUserId) {
      await supabase.from("site_visitors").upsert({
        org_id: orgId, site_id: siteId, visitor_id: visitorId,
        wp_user_id: wpUserId, wp_user_name: wpUserName,
        wp_user_email: null, // No longer store plain-text email
        wp_user_email_hash: wpUserEmailHash,
        wp_user_role: wpUserRole,
        last_seen_at: occurredAt.toISOString(),
      }, { onConflict: "org_id,site_id,visitor_id" });
    }

    // ── Update site_tracking_status ──
    try {
      const statusUpdate: Record<string, unknown> = {
        org_id: orgId,
        site_id: siteId,
        last_event_at: occurredAt.toISOString(),
        last_page_view_at: occurredAt.toISOString(),
        tracker_status: "active",
        updated_at: new Date().toISOString(),
      };
      await supabase.from("site_tracking_status").upsert(statusUpdate, { onConflict: "org_id,site_id" });
    } catch (stsErr) {
      console.error("Tracking status update error (non-fatal):", stsErr);
    }

    observe(supabase, { orgId, siteId, endpoint: "track-pageview", status: "ok" });
    return new Response(JSON.stringify({ status: "ok", event_id: eventId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Pageview tracking error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
