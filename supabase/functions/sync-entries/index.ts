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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase
      .from("api_keys").select("org_id")
      .eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();

    if (!akRow) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = akRow.org_id;
    const body = await req.json();
    const { domain, forms } = body;

    if (!domain || !Array.isArray(forms)) {
      return new Response(JSON.stringify({ error: "Missing domain or forms array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: site } = await supabase
      .from("sites").select("id")
      .eq("org_id", orgId).eq("domain", domain).maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteId = site.id;
    let totalTrashed = 0;
    let totalRestored = 0;

    for (const f of forms) {
      const extFormId = String(f.form_id || "");
      const activeEntryIds: string[] = (f.entry_ids || []).map(String);

      if (!extFormId || activeEntryIds.length === 0) continue;

      // Find the internal form id
      const { data: formRow } = await supabase
        .from("forms").select("id, provider")
        .eq("org_id", orgId).eq("site_id", siteId).eq("external_form_id", extFormId)
        .maybeSingle();

      if (!formRow) continue;
      const formId = formRow.id;
      const provider = formRow.provider || "";

      // Get all lead_events_raw for this form
      const { data: rawEvents } = await supabase
        .from("lead_events_raw")
        .select("external_entry_id, submitted_at")
        .eq("org_id", orgId).eq("site_id", siteId).eq("form_id", formId);

      if (!rawEvents || rawEvents.length === 0) continue;

      const activeSet = new Set(activeEntryIds);

      // For providers that switched to DB-backed IDs (avada_db_, ninja_db_, cf7_db_),
      // legacy entries won't match. We need to identify which entries are NOT active.
      // Strategy: match by external_entry_id directly, then for unmatched legacy entries
      // that use old format (avada_timestamp_rand), consider them orphaned and trash them.
      
      const toTrashEntries: { external_entry_id: string; submitted_at: string | null }[] = [];
      const toRestoreEntries: { external_entry_id: string; submitted_at: string | null }[] = [];

      for (const rawEvent of rawEvents) {
        const eid = rawEvent.external_entry_id;
        
        if (activeSet.has(eid)) {
          // This entry is active in WordPress — restore if trashed
          toRestoreEntries.push(rawEvent);
        } else {
          // Check if this is a legacy ID format that we can't match
          // For legacy avada/ninja/cf7 entries with random IDs, we can't know if they're
          // still active or not. Only trash entries that use the NEW DB-backed format
          // and are NOT in the active set (meaning they were definitely deleted).
          const isNewFormat = eid.startsWith("avada_db_") || eid.startsWith("ninja_db_") || eid.startsWith("cf7_db_");
          const isStandardProvider = provider === "gravity_forms" || provider === "wpforms" || provider === "fluent_forms";

          if (isNewFormat || isStandardProvider) {
            // This entry uses a format we can reliably match — it's genuinely missing
            toTrashEntries.push(rawEvent);
          }
          // For legacy format entries (avada_timestamp_rand), we skip — can't determine
          // if they were deleted. They'll be reconciled once new entries use DB IDs.
        }
      }

      // Trash entries that are confirmed deleted
      for (const entry of toTrashEntries) {
        if (!entry.submitted_at) continue;
        const { count } = await supabase
          .from("leads")
          .update({ status: "trashed" })
          .eq("org_id", orgId).eq("form_id", formId)
          .eq("submitted_at", entry.submitted_at)
          .neq("status", "trashed");
        totalTrashed += (count || 0);
      }

      // Restore entries that are active
      for (const entry of toRestoreEntries) {
        if (!entry.submitted_at) continue;
        const { count } = await supabase
          .from("leads")
          .update({ status: "new" })
          .eq("org_id", orgId).eq("form_id", formId)
          .eq("submitted_at", entry.submitted_at)
          .eq("status", "trashed");
        totalRestored += (count || 0);
      }

      // Also update legacy external_entry_ids in lead_events_raw to new format
      // so future syncs can match them properly.
      // Match legacy entries to active DB IDs by position (oldest first)
      if (provider === "avada" || provider === "ninja_forms" || provider === "cf7") {
        const legacyPrefix = provider === "avada" ? "avada_" : provider === "ninja_forms" ? "ninja_" : "cf7_";
        const newPrefix = provider === "avada" ? "avada_db_" : provider === "ninja_forms" ? "ninja_db_" : "cf7_db_";

        // Get legacy entries sorted by submitted_at
        const legacyEntries = rawEvents
          .filter(e => e.external_entry_id.startsWith(legacyPrefix) && !e.external_entry_id.startsWith(newPrefix))
          .sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""));

        // Get active DB IDs sorted numerically
        const activeDbIds = activeEntryIds
          .filter(id => id.startsWith(newPrefix))
          .sort((a, b) => {
            const numA = parseInt(a.replace(newPrefix, ""), 10);
            const numB = parseInt(b.replace(newPrefix, ""), 10);
            return numA - numB;
          });

        // Match legacy to new by chronological order if counts align
        if (legacyEntries.length > 0 && activeDbIds.length > 0 && legacyEntries.length <= activeDbIds.length) {
          for (let i = 0; i < legacyEntries.length; i++) {
            if (i < activeDbIds.length) {
              await supabase
                .from("lead_events_raw")
                .update({ external_entry_id: activeDbIds[i] })
                .eq("org_id", orgId)
                .eq("form_id", formId)
                .eq("external_entry_id", legacyEntries[i].external_entry_id);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, trashed: totalTrashed, restored: totalRestored }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-entries error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
