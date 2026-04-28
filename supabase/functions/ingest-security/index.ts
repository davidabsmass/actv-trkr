import { createClient } from "npm:@supabase/supabase-js@2";
import { observe } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate API key
    const keyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    const hashHex = Array.from(new Uint8Array(keyHash)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", hashHex)
      .is("revoked_at", null)
      .maybeSingle();

    if (!keyRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const orgId = keyRow.org_id;
    const body = await req.json();
    const { site_domain, events } = body;

    if (!site_domain || !Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ error: "Missing site_domain or events" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Look up site
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", site_domain)
      .maybeSingle();

    if (!site) return new Response(JSON.stringify({ error: "Site not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // --- Aggregation: group repeat events (same event_type + IP) ---
    // For login-type events, aggregate by event_type + IP within this batch
    const aggregated: Array<{
      event_type: string;
      severity: string;
      title: string;
      details: Record<string, any>;
      occurred_at: string;
    }> = [];

    // Separate into aggregatable (login events with an IP) and pass-through (file events, etc.)
    const loginTypes = new Set(["failed_login", "new_ip_login"]);
    const buckets = new Map<string, { events: typeof events; count: number }>();

    for (const e of events) {
      const ip = e.details?.ip || "";
      const type = e.event_type || "";

      // Aggregate failed_login and new_ip_login by type+IP
      if (loginTypes.has(type) && ip) {
        const key = `${type}::${ip}`;
        const existing = buckets.get(key);
        if (existing) {
          existing.count++;
          // Keep the latest occurred_at
          if (e.occurred_at > existing.events[0].occurred_at) {
            existing.events[0] = e;
          }
        } else {
          buckets.set(key, { events: [e], count: 1 });
        }
      } else {
        // Pass through brute_force, file events, etc. as-is
        aggregated.push({
          event_type: type,
          severity: e.severity || "info",
          title: e.title || "",
          details: e.details || {},
          occurred_at: e.occurred_at || new Date().toISOString(),
        });
      }
    }

    // Also check for recent duplicates in the DB (last 1 hour) and bump count instead of inserting
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    for (const [key, bucket] of buckets) {
      const representative = bucket.events[0];
      const ip = representative.details?.ip || "";
      const eventType = representative.event_type;

      // Check if there's already a recent event for this type+IP
      const { data: existing } = await supabase
        .from("security_events")
        .select("id, details")
        .eq("org_id", orgId)
        .eq("site_id", site.id)
        .eq("event_type", eventType)
        .is("reviewed_at", null)
        .gte("occurred_at", oneHourAgo)
        .order("occurred_at", { ascending: false })
        .limit(1);

      const existingRow = existing?.[0];
      const existingDetails = (existingRow?.details || {}) as Record<string, any>;

      if (existingRow && existingDetails.ip === ip) {
        // Bump the count on the existing row
        const prevCount = (existingDetails.occurrences as number) || 1;
        const newCount = prevCount + bucket.count;
        await supabase
          .from("security_events")
          .update({
            title: `${eventType === "failed_login" ? "Failed login" : "Login from new IP"}: ${newCount} attempts from ${ip}`,
            details: { ...existingDetails, occurrences: newCount },
            occurred_at: representative.occurred_at || new Date().toISOString(),
          } as any)
          .eq("id", existingRow.id);
      } else {
        // Insert as new aggregated row
        const count = bucket.count;
        aggregated.push({
          event_type: eventType,
          severity: representative.severity || "warning",
          title: count > 1
            ? `${eventType === "failed_login" ? "Failed login" : "Login from new IP"}: ${count} attempts from ${ip}`
            : representative.title || "",
          details: { ...(representative.details || {}), occurrences: count },
          occurred_at: representative.occurred_at || new Date().toISOString(),
        });
      }
    }

    // Insert new rows
    if (aggregated.length > 0) {
      const rows = aggregated.map((e) => ({
        org_id: orgId,
        site_id: site.id,
        event_type: e.event_type,
        severity: e.severity,
        title: e.title,
        details: e.details,
        occurred_at: e.occurred_at,
      }));

      const { error } = await supabase.from("security_events").insert(rows);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, inserted: aggregated.length, aggregated_updates: buckets.size - aggregated.filter(a => loginTypes.has(a.event_type)).length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ingest-security error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
