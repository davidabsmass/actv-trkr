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

const VALID_EVENT_TYPES = new Set([
  "cta_click", "download_click", "outbound_click",
  "tel_click", "mailto_click", "form_start",
]);

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

function matchEventToGoals(
  evt: { event_type: string; target_text: string | null; page_url: string | null; page_path: string | null; meta: Record<string, any> },
  goals: GoalRow[]
): string[] {
  const matched: string[] = [];
  const text = (evt.target_text || "").toLowerCase();
  const label = (evt.meta?.target_label || "").toLowerCase();
  const url = (evt.page_url || "").toLowerCase();
  const path = (evt.page_path || "").toLowerCase();

  // Click-type goals can cross-match related event types
  const CLICK_TYPES = new Set(["cta_click", "outbound_click", "tel_click", "mailto_click"]);

  for (const goal of goals) {
    // Custom event matching
    if (goal.goal_type === "custom_event") {
      const r = goal.tracking_rules || {};
      if (r.event_name && r.event_name === evt.event_type) { matched.push(goal.id); }
      continue;
    }

    // Allow click-type goals to match any click-type event (e.g. cta_click goal matches outbound_click)
    const goalIsClick = CLICK_TYPES.has(goal.goal_type);
    const evtIsClick = CLICK_TYPES.has(evt.event_type);
    if (!goalIsClick && goal.goal_type !== evt.event_type) continue;
    if (goalIsClick && !evtIsClick) continue;

    // If the goal type is specific (tel_click, mailto_click), require exact type match
    if ((goal.goal_type === "tel_click" || goal.goal_type === "mailto_click") && goal.goal_type !== evt.event_type) continue;

    const r = goal.tracking_rules || {};

    // Type-specific matching
    let passes = true;

    if (r.text_contains && !text.includes(r.text_contains.toLowerCase()) && !label.includes(r.text_contains.toLowerCase())) {
      passes = false;
    }
    if (r.href_contains && !text.includes(r.href_contains.toLowerCase()) && !url.includes(r.href_contains.toLowerCase())) {
      passes = false;
    }
    if (r.page_path_contains && !path.includes(r.page_path_contains.toLowerCase())) {
      passes = false;
    }
    // "match all" — no filters, just match by event type
    if (r.match === "all") {
      passes = true;
    }

    if (passes) matched.push(goal.id);
  }

  return matched;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userAgent = req.headers.get("user-agent");
  if (isBot(userAgent)) {
    return new Response(JSON.stringify({ status: "ok", filtered: "bot" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

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

    const { source, events } = body;
    const domain = sanitizeStr(source?.domain, 253);
    if (!domain) return new Response(JSON.stringify({ error: "Missing source domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ error: "No events" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: site } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    if (!site) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const siteId = site.id;

    // Process events (max 50 per batch)
    const rows: any[] = [];
    const maxEvents = Math.min(events.length, 50);
    for (let i = 0; i < maxEvents; i++) {
      const evt = events[i];
      const eventType = sanitizeStr(evt.event_type, 32);
      if (!eventType || !VALID_EVENT_TYPES.has(eventType)) continue;

      const now = new Date();
      let occurredAt = evt.timestamp ? new Date(evt.timestamp) : now;
      if (isNaN(occurredAt.getTime()) || Math.abs(occurredAt.getTime() - now.getTime()) / 36e5 > 24) occurredAt = now;

      const targetLabel = sanitizeStr(evt.target_label, 256);
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
        meta: targetLabel ? { target_label: targetLabel } : {},
      });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("events").insert(rows);
      if (insertError) {
        console.error("Event insert error:", insertError);
        return new Response(JSON.stringify({ error: "Failed to store events" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Goal Matching ──────────────────────────────────────────────
      try {
        const { data: activeGoals } = await supabase
          .from("conversion_goals")
          .select("id, goal_type, tracking_rules")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .eq("is_conversion", true);

        if (activeGoals && activeGoals.length > 0) {
          const completionRows: any[] = [];
          const DEDUPE_WINDOW = 300_000; // 5 minutes
          const timeBucket = Math.floor(Date.now() / DEDUPE_WINDOW);

          for (const row of rows) {
            const matchedGoalIds = matchEventToGoals(
              { event_type: row.event_type, target_text: row.target_text, page_url: row.page_url, page_path: row.page_path, meta: row.meta || {} },
              activeGoals as GoalRow[]
            );

            for (const goalId of matchedGoalIds) {
              const sessionKey = row.session_id || "no-session";
              const dedupeKey = `${goalId}:${sessionKey}:${timeBucket}`;

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
            // Use upsert with ON CONFLICT to handle deduplication
            const { error: compError } = await supabase
              .from("goal_completions")
              .upsert(completionRows, { onConflict: "org_id,dedupe_key", ignoreDuplicates: true });

            if (compError) {
              console.error("Goal completion insert error:", compError);
              // Non-fatal — events are already stored
            }
          }
        }
      } catch (goalErr) {
        console.error("Goal matching error (non-fatal):", goalErr);
      }
    }

    return new Response(JSON.stringify({ status: "ok", stored: rows.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Event tracking error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
