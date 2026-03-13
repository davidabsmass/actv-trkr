import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function inferAvadaFieldName(type: string, value: string, position: number): string {
  const t = type.toLowerCase();
  if (t === "email") return "Email";
  if (t === "textarea") return "Message";
  if (t === "select") return "Category";
  if (t === "text" && value) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return "Email";
    if (/^[\d\s\-\+\(\)]{7,}$/.test(value.replace(/\s/g, ""))) return "Phone";
    if (/^\d{4,5}(-\d{4})?$/.test(value)) return "Zip Code";
    if (/^[A-Z]{2}$/.test(value)) return "State";
  }
  const posMap: Record<number, string> = {
    1: "Name", 2: "Phone", 3: "Email", 4: "Category", 5: "City",
    6: "Zip Code", 7: "State", 8: "Country", 9: "Subject", 10: "Message",
  };
  return posMap[position] || `Field ${position}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const formId = body.form_id;

    // Get org membership
    const { data: orgUser } = await supabase
      .from("org_users").select("org_id").eq("user_id", user.id).limit(1).single();
    if (!orgUser) {
      return new Response(JSON.stringify({ error: "No org" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = orgUser.org_id;

    // Find Avada leads that have fewer than 3 fields in lead_fields_flat
    // (meaning they were poorly parsed)
    let query = supabase
      .from("leads")
      .select("id, data, org_id")
      .eq("org_id", orgId)
      .eq("lead_type", "avada");

    if (formId) {
      query = query.eq("form_id", formId);
    }

    const { data: leads, error: leadsErr } = await query.order("submitted_at", { ascending: false }).limit(500);
    if (leadsErr) {
      return new Response(JSON.stringify({ error: leadsErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SKIP_AVADA_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page", "checkbox"]);
    let backfilled = 0;
    let skipped = 0;

    for (const lead of leads || []) {
      // Check existing field count
      const { count } = await supabase
        .from("lead_fields_flat")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id);

      if ((count || 0) >= 3) {
        skipped++;
        continue; // Already has enough fields
      }

      // Parse data array to find Avada format
      const dataArr = lead.data;
      if (!Array.isArray(dataArr)) { skipped++; continue; }

      const dataEntry = dataArr.find((f: any) => f.name === "data" || f.label === "data");
      const typesEntry = dataArr.find((f: any) => f.name === "field_types" || f.label === "field_types");
      if (!dataEntry?.value || !typesEntry?.value) { skipped++; continue; }

      const types = typesEntry.value.split(", ").map((t: string) => t.trim());
      const labelsEntry = dataArr.find((f: any) => f.name === "field_labels" || f.label === "field_labels");
      const rawLabels = labelsEntry?.value ? labelsEntry.value.split(", ").map((l: string) => l.trim()) : [];
      const allLabelsEmpty = rawLabels.every((l: string) => !l || l === "");

      // Count non-skip types to know how many real fields there are
      const realTypes: { type: string; index: number }[] = [];
      for (let i = 0; i < types.length; i++) {
        if (!SKIP_AVADA_TYPES.has(types[i]?.toLowerCase())) {
          realTypes.push({ type: types[i], index: i });
        }
      }

      // Smart split: we know how many values to expect, split from the front
      const rawDataStr = dataEntry.value as string;
      const fieldValues: string[] = [];
      let remaining = rawDataStr;

      for (let fi = 0; fi < realTypes.length; fi++) {
        if (fi === realTypes.length - 1) {
          // Last field gets everything remaining (handles commas in message)
          fieldValues.push(remaining.trim());
        } else {
          const commaIdx = remaining.indexOf(", ");
          if (commaIdx === -1) {
            fieldValues.push(remaining.trim());
            remaining = "";
          } else {
            fieldValues.push(remaining.substring(0, commaIdx).trim());
            remaining = remaining.substring(commaIdx + 2);
          }
        }
      }

      // Delete existing sparse fields
      await supabase.from("lead_fields_flat").delete().eq("lead_id", lead.id);

      // Build new flat rows
      const flatRows: any[] = [];
      for (let fi = 0; fi < realTypes.length; fi++) {
        const type = realTypes[fi].type.toLowerCase();
        const val = fieldValues[fi] || "";
        if (!val || val === "Array") continue;

        let label: string;
        const rawLabel = rawLabels[realTypes[fi].index] || "";
        if (rawLabel && !allLabelsEmpty) {
          label = rawLabel;
        } else {
          label = inferAvadaFieldName(type, val, fi + 1);
        }

        flatRows.push({
          org_id: orgId,
          lead_id: lead.id,
          field_key: label.toLowerCase().replace(/\s+/g, "_"),
          field_label: label,
          field_type: type,
          value_text: val,
        });
      }

      if (flatRows.length > 0) {
        await supabase.from("lead_fields_flat").insert(flatRows);
        backfilled++;
      } else {
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, backfilled, skipped, total: (leads || []).length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-avada-fields error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
