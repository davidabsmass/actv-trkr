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

    // forms = [{ form_id: "5", provider: "gravity_forms", entry_ids: ["1","2","3"] }, ...]

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
        .from("forms").select("id")
        .eq("org_id", orgId).eq("site_id", siteId).eq("external_form_id", extFormId)
        .maybeSingle();

      if (!formRow) continue;
      const formId = formRow.id;

      // Get all lead_events_raw for this form to map external_entry_id → lead
      const { data: rawEvents } = await supabase
        .from("lead_events_raw")
        .select("external_entry_id")
        .eq("org_id", orgId).eq("site_id", siteId).eq("form_id", formId);

      if (!rawEvents || rawEvents.length === 0) continue;

      const allExternalIds = rawEvents.map(r => r.external_entry_id);
      const activeSet = new Set(activeEntryIds);

      // IDs that exist in our DB but NOT in WordPress anymore → trash
      const toTrash = allExternalIds.filter(id => !activeSet.has(id));
      // IDs that exist in both → restore if previously trashed
      const toRestore = allExternalIds.filter(id => activeSet.has(id));

      if (toTrash.length > 0) {
        // Find leads by matching through lead_events_raw
        // We need to get lead IDs — leads are linked by form_id + approximate matching
        // Since leads don't store external_entry_id directly, we match via lead_events_raw
        // lead_events_raw has external_entry_id, and leads are created at the same time
        // We'll use the submitted_at + form_id correlation, but more reliably:
        // Update leads whose data came from these entries by joining through submitted_at

        // Actually, the simplest approach: query leads by form and match on data/timestamps
        // But really we need a link. Let's use lead_events_raw to find the submitted_at times
        // and match leads.

        // Better approach: batch update leads that match these external entry IDs
        // by looking them up through lead_events_raw
        for (const extId of toTrash) {
          const { data: rawEvent } = await supabase
            .from("lead_events_raw")
            .select("submitted_at")
            .eq("org_id", orgId).eq("form_id", formId).eq("external_entry_id", extId)
            .maybeSingle();

          if (!rawEvent) continue;

          const { count } = await supabase
            .from("leads")
            .update({ status: "trashed" })
            .eq("org_id", orgId).eq("form_id", formId)
            .eq("submitted_at", rawEvent.submitted_at)
            .neq("status", "trashed");

          totalTrashed += (count || 0);
        }
      }

      if (toRestore.length > 0) {
        for (const extId of toRestore) {
          const { data: rawEvent } = await supabase
            .from("lead_events_raw")
            .select("submitted_at")
            .eq("org_id", orgId).eq("form_id", formId).eq("external_entry_id", extId)
            .maybeSingle();

          if (!rawEvent) continue;

          const { count } = await supabase
            .from("leads")
            .update({ status: "new" })
            .eq("org_id", orgId).eq("form_id", formId)
            .eq("submitted_at", rawEvent.submitted_at)
            .eq("status", "trashed");

          totalRestored += (count || 0);
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
