import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeStr(val: unknown, maxLen: number): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s.length === 0) return null;
  return s.slice(0, maxLen);
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function isValidUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function isValidEventId(val: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(val);
}

// Rate limiting
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;

function checkRate(orgId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(orgId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(orgId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) {
    if (now > v.resetAt) rateBuckets.delete(k);
  }
}, 300_000);

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

async function lookupCountryByIp(ip: string): Promise<string | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;
  const cached = geoCache.get(ip);
  if (cached && Date.now() < cached.expiresAt) return cached.country;
  if (!canCallGeoApi()) return null;

  try {
    geoApiCallCount++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    const country = data.status === "success" && data.countryCode ? data.countryCode : null;
    geoCache.set(ip, { country, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
    return country;
  } catch { return null; }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of geoCache) {
    if (now > v.expiresAt) geoCache.delete(k);
  }
}, 600_000);

function extractClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) { const first = xff.split(",")[0].trim(); if (first) return first; }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
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
  if (!ua || ua.length < 10) return true; // No UA or suspiciously short
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userAgent = req.headers.get("user-agent");

  try {
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 51200) {
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawBody = await req.text();
    if (rawBody.length > 51200) {
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: any;
    try { body = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Support API key from Authorization header OR request body (sendBeacon can't set headers)
    const authHeader = req.headers.get("authorization") || "";
    let apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey && body.api_key) {
      apiKey = String(body.api_key).trim();
    }
    if (!apiKey || apiKey.length > 256) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase.from("api_keys").select("org_id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
    if (!akRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orgId = akRow.org_id;

    if (!checkRate(orgId)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    // ── Handle time_update (active_seconds update) ──────────────
    if (body.type === "time_update") {
      const eventId = sanitizeStr(body.event?.event_id, 128);
      const activeSeconds = typeof body.event?.active_seconds === "number" ? Math.min(Math.max(0, Math.round(body.event.active_seconds)), 3600) : null;
      const domain = sanitizeStr(body.source?.domain, 253);

      if (!eventId || activeSeconds === null || !domain) {
        return new Response(JSON.stringify({ error: "Missing fields for time_update" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find the site
      const { data: site } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
      if (!site) return new Response(JSON.stringify({ status: "ok", note: "site not found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Update the pageview's active_seconds
      await supabase.from("pageviews")
        .update({ active_seconds: activeSeconds })
        .eq("org_id", orgId).eq("site_id", site.id).eq("event_id", eventId);

      return new Response(JSON.stringify({ status: "ok", active_seconds: activeSeconds }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reject bot traffic for standard pageview requests (time_update is already handled above)
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

    const domain = sanitizeStr(source?.domain, 253);
    if (!domain) return new Response(JSON.stringify({ error: "Missing source domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const now = new Date();
    let occurredAt = event.occurred_at ? new Date(event.occurred_at) : now;
    if (isNaN(occurredAt.getTime()) || Math.abs(occurredAt.getTime() - now.getTime()) / 36e5 > 24) occurredAt = now;

    let referrerDomain: string | null = null;
    const referrer = sanitizeStr(event?.referrer, 2048);
    if (referrer) { try { referrerDomain = new URL(referrer).hostname; } catch {} }

    // Block spam referrer traffic
    if (isSpamReferrer(referrerDomain)) {
      return new Response(JSON.stringify({ status: "ok", filtered: "spam_referrer" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let pagePath = sanitizeStr(event?.page_path, 2048) || "";
    try { pagePath = new URL(pageUrl).pathname; } catch {}

    const sessionId = sanitizeStr(event?.session_id, 128);
    const visitorId = sanitizeStr(visitor?.visitor_id, 128);
    const title = sanitizeStr(event?.title, 512);
    const device = sanitizeStr(event?.device, 32);
    const ipHash = sanitizeStr(visitor?.ip_hash, 128);
    const pluginVersion = sanitizeStr(source?.plugin_version, 32);
    const siteType = sanitizeStr(source?.type, 32) || "wordpress";

    // WP user identity
    const wpUserId = sanitizeStr(visitor?.wp_user_id, 64);
    const wpUserName = sanitizeStr(visitor?.wp_user_name, 256);
    const wpUserEmail = sanitizeStr(visitor?.wp_user_email, 256);
    const wpUserRole = sanitizeStr(visitor?.wp_user_role, 128);
    const siteType = sanitizeStr(source?.type, 32) || "wordpress";

    const utmSource = sanitizeStr(attribution?.utm_source, 256);
    const utmMedium = sanitizeStr(attribution?.utm_medium, 256);
    const utmCampaign = sanitizeStr(attribution?.utm_campaign, 256);
    const utmTerm = sanitizeStr(attribution?.utm_term, 256);
    const utmContent = sanitizeStr(attribution?.utm_content, 256);

    // Upsert site
    let siteId: string | null = null;
    const { data: existing } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    if (existing) { siteId = existing.id; }
    else {
      const { data: ns } = await supabase.from("sites").insert({ org_id: orgId, domain, type: siteType, plugin_version: pluginVersion }).select("id").single();
      siteId = ns?.id || null;
    }

    if (!siteId) return new Response(JSON.stringify({ error: "Failed to resolve site" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Resolve country code
    let countryCode = sanitizeStr(req.headers.get("cf-ipcountry") || req.headers.get("x-country-code"), 2)?.toUpperCase() || null;
    if (!countryCode) {
      const clientIp = extractClientIp(req);
      if (clientIp) {
        const geoCountry = await lookupCountryByIp(clientIp);
        if (geoCountry) countryCode = geoCountry.toUpperCase();
      }
    }

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

    return new Response(JSON.stringify({ status: "ok", event_id: eventId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Pageview tracking error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
