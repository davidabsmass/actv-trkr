import { createClient } from "npm:@supabase/supabase-js@2";
import {
  checkRateLimit, validateDomain, extractClientIp, hashIp,
  checkPayloadSize, logAnomaly, sanitizeStr, VALID_EVENT_TYPES,
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

// Bot detection
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

/* ─── Goal Matching ─── */

interface GoalRow {
  id: string;
  goal_type: string;
  tracking_rules: Record<string, any>;
}

function normalizeForKey(value: unknown, maxLen = 240): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function normalizeUrlMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/%20/g, "")
    .replace(/\s+/g, "");
}

function buildDedupeKey(goalId: string, row: {
  event_type: string;
  session_id: string | null;
  visitor_id: string | null;
  page_path: string | null;
  occurred_at: string;
  target_text: string | null;
  meta?: Record<string, any>;
}) {
  const occurredAtMs = new Date(row.occurred_at).getTime();
  const eventSecond = Math.floor((Number.isNaN(occurredAtMs) ? Date.now() : occurredAtMs) / 1000);
  const actorKey = row.session_id || row.visitor_id || "no-actor";

  const href = normalizeForKey(row.meta?.target_href, 320);
  const label = normalizeForKey(row.meta?.target_label, 160);
  const text = normalizeForKey(row.target_text, 160);
  const path = normalizeForKey(row.page_path, 240);
  const eventType = normalizeForKey(row.event_type, 48);
  const rawFingerprint = `${eventType}|${path}|${href || ""}|${label || ""}|${text || ""}|${eventSecond}`;
  const fingerprint = hashString(rawFingerprint);

  return `${goalId}:${actorKey}:${fingerprint}`;
}

function matchEventToGoals(
  evt: { event_type: string; target_text: string | null; page_url: string | null; page_path: string | null; meta: Record<string, any> },
  goals: GoalRow[]
): string[] {
  const matched: string[] = [];
  const text = (evt.target_text || "").toLowerCase();
  const label = (evt.meta?.target_label || "").toLowerCase();
  const href = (evt.meta?.target_href || "").toLowerCase();
  const url = (evt.page_url || "").toLowerCase();
  const path = (evt.page_path || "").toLowerCase();

  const CLICK_TYPES = new Set(["cta_click", "outbound_click", "tel_click", "mailto_click"]);

  for (const goal of goals) {
    if (goal.goal_type === "custom_event") {
      const r = goal.tracking_rules || {};
      if (r.event_name && r.event_name === evt.event_type) { matched.push(goal.id); }
      continue;
    }

    const goalIsClick = CLICK_TYPES.has(goal.goal_type);
    const evtIsClick = CLICK_TYPES.has(evt.event_type);
    if (!goalIsClick && goal.goal_type !== evt.event_type) continue;
    if (goalIsClick && !evtIsClick) continue;

    if ((goal.goal_type === "tel_click" || goal.goal_type === "mailto_click") && goal.goal_type !== evt.event_type) continue;

    const r = goal.tracking_rules || {};
    let passes = true;

    if (r.text_contains && !text.includes(r.text_contains.toLowerCase()) && !label.includes(r.text_contains.toLowerCase())) {
      passes = false;
    }
    if (r.href_contains) {
      const hrefNeedle = normalizeUrlMatch(r.href_contains);
      const hrefValue = normalizeUrlMatch(href);
      const urlValue = normalizeUrlMatch(url);
      const textValue = normalizeUrlMatch(text);
      const labelValue = normalizeUrlMatch(label);
      const hrefMatches =
        hrefValue.includes(hrefNeedle) ||
        urlValue.includes(hrefNeedle) ||
        textValue.includes(hrefNeedle) ||
        labelValue.includes(hrefNeedle);
      const allowLegacyNoHref = !href && !!r.text_contains;
      if (!hrefMatches && !allowLegacyNoHref) {
        passes = false;
      }
    }
    if (r.page_path_contains && !path.includes(r.page_path_contains.toLowerCase())) {
      passes = false;
    }
    if (r.match === "all") {
      passes = true;
    }

    if (passes) matched.push(goal.id);
  }

  return matched;
}

const MAX_EVENTS_PER_BATCH = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userAgent = req.headers.get("user-agent");
  if (isBot(userAgent)) {
    return new Response(JSON.stringify({ status: "ok", filtered: "bot" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

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

    const auth = await authenticateIngestRequest({ req, body, supabase, endpoint: "track-event" });
    if (!auth.ok) {
      const failed = auth as { ok: false; status: number; error: string; payload?: Record<string, unknown> };
      const respBody = failed.payload ?? { error: failed.error };
      return new Response(JSON.stringify(respBody), { status: failed.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const orgId = auth.orgId;

    // ── Rate limiting ──
    const rateCheck = checkRateLimit(clientIp, null, orgId);
    if (!rateCheck.allowed) {
      logAnomaly(supabase, orgId, null, "rate_limit_exceeded", { endpoint: "track-event", reason: rateCheck.reason });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    const { source, events } = body;
    const domain = sanitizeStr(source?.domain, 253)?.replace(/^www\./i, "");
    if (!domain) return new Response(JSON.stringify({ error: "Missing source domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ error: "No events" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: site } = await supabase.from("sites").select("id, allowed_domains").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    if (!site) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const siteId = site.id;

    // ── Domain validation ──
    const origin = req.headers.get("origin");
    if (site.allowed_domains && site.allowed_domains.length > 0) {
      if (!validateDomain(domain, domain, site.allowed_domains, origin)) {
        logAnomaly(supabase, orgId, siteId, "domain_mismatch", { endpoint: "track-event", request_domain: domain, origin });
        return new Response(JSON.stringify({ error: "Domain not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Site-level rate limit ──
    const siteRate = checkRateLimit(null, siteId, orgId);
    if (!siteRate.allowed) {
      logAnomaly(supabase, orgId, siteId, "site_rate_limit", { endpoint: "track-event" });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    // Process events (max per batch)
    const rows: any[] = [];
    const skipped: number[] = [];
    const maxEvents = Math.min(events.length, MAX_EVENTS_PER_BATCH);
    for (let i = 0; i < maxEvents; i++) {
      const evt = events[i];
      const eventType = sanitizeStr(evt.event_type, 32);
      if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
        skipped.push(i);
        continue;
      }

      const now = new Date();
      let occurredAt = evt.timestamp ? new Date(evt.timestamp) : now;
      if (isNaN(occurredAt.getTime()) || Math.abs(occurredAt.getTime() - now.getTime()) / 36e5 > 24) occurredAt = now;

      const targetLabel = sanitizeStr(evt.target_label, 256);
      const targetHref = sanitizeStr(evt.target_href, 2048);
      const eventMeta: Record<string, string> = {};
      if (targetLabel) eventMeta.target_label = targetLabel;
      if (targetHref) eventMeta.target_href = targetHref;
      rows.push({
        org_id: orgId,
        site_id: siteId,
        session_id: sanitizeStr(evt.session_id, 128),
        visitor_id: sanitizeStr(evt.visitor_id, 128),
        event_type: eventType,
        page_url: sanitizeStr(evt.page_url, 2048),
        page_path: sanitizeStr(evt.page_path, 2048),
        target_text: sanitizeStr(evt.target_text, 256),
        occurred_at: occurredAt.toISOString(),
        meta: eventMeta,
      });
    }

    if (skipped.length > 0) {
      logAnomaly(supabase, orgId, siteId, "invalid_event_types", { skipped_count: skipped.length, total: events.length });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("events").insert(rows);
      if (insertError) {
        console.error("Event insert error:", insertError);
        return new Response(JSON.stringify({ error: "Failed to store events" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Goal Matching ──
      try {
        const { data: activeGoals } = await supabase
          .from("conversion_goals")
          .select("id, goal_type, tracking_rules")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .eq("is_conversion", true);

        if (activeGoals && activeGoals.length > 0) {
          const completionRows: any[] = [];

          for (const row of rows) {
            const matchedGoalIds = matchEventToGoals(
              { event_type: row.event_type, target_text: row.target_text, page_url: row.page_url, page_path: row.page_path, meta: row.meta || {} },
              activeGoals as GoalRow[]
            );

            for (const goalId of matchedGoalIds) {
              const dedupeKey = buildDedupeKey(goalId, row);

              completionRows.push({
                org_id: orgId,
                goal_id: goalId,
                site_id: siteId,
                session_id: row.session_id,
                visitor_id: row.visitor_id,
                event_type: row.event_type,
                page_url: row.page_url,
                page_path: row.page_path,
                target_text: row.target_text,
                dedupe_key: dedupeKey,
                completed_at: row.occurred_at,
              });
            }
          }

          if (completionRows.length > 0) {
            const { error: compError } = await supabase
              .from("goal_completions")
              .upsert(completionRows, { onConflict: "org_id,dedupe_key", ignoreDuplicates: true });

            if (compError) {
              console.error("Goal completion insert error:", compError);
            }
          }
        }
      } catch (goalErr) {
        console.error("Goal matching error (non-fatal):", goalErr);
      }
    }

    // ── Update site_tracking_status ──
    if (rows.length > 0) {
      try {
        await supabase.from("site_tracking_status").upsert({
          org_id: orgId,
          site_id: siteId,
          last_event_at: new Date().toISOString(),
          tracker_status: "active",
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,site_id" });
      } catch (stsErr) {
        console.error("Tracking status update error (non-fatal):", stsErr);
      }
    }

    observe(supabase, { orgId, siteId, endpoint: "track-event", status: "ok", details: { stored: rows.length } });
    return new Response(JSON.stringify({ status: "ok", stored: rows.length, skipped: skipped.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Event tracking error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
