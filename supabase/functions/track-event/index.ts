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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 51200) {
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey || apiKey.length > 256) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase.from("api_keys").select("org_id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
    if (!akRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orgId = akRow.org_id;

    if (!checkRate(orgId)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    const rawBody = await req.text();
    if (rawBody.length > 51200) {
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: any;
    try { body = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { source, events } = body;
    const domain = sanitizeStr(source?.domain, 253);
    if (!domain) return new Response(JSON.stringify({ error: "Missing source domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ error: "No events" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve site
    const { data: site } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    if (!site) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const siteId = site.id;

    // Process events (max 50 per batch)
    const rows = [];
    const maxEvents = Math.min(events.length, 50);
    for (let i = 0; i < maxEvents; i++) {
      const evt = events[i];
      const eventType = sanitizeStr(evt.event_type, 32);
      if (!eventType || !VALID_EVENT_TYPES.has(eventType)) continue;

      const now = new Date();
      let occurredAt = evt.timestamp ? new Date(evt.timestamp) : now;
      if (isNaN(occurredAt.getTime()) || Math.abs(occurredAt.getTime() - now.getTime()) / 36e5 > 24) occurredAt = now;

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
      });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("events").insert(rows);
      if (insertError) {
        console.error("Event insert error:", insertError);
        return new Response(JSON.stringify({ error: "Failed to store events" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ status: "ok", stored: rows.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Event tracking error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
