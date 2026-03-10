import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Known Avada form field labels by external_form_id
const FORM_LABELS: Record<string, string[]> = {
  // Physician General (form 10097): text, email, text, text, text, text, text, text, select, select, text, date, time, text, text, text, text, textarea
  "10098": ["Name", "Email", "City", "State", "Zip Code", "Country", "Practice Name", "Product Interest", "Specialty", "I Am A", "Phone", "Preferred Date", "Preferred Time", "Company", "Title", "Purpose of Inquiry", "Subject", "Description"],
  // Physician Medical (form 10140): text, text, email, text, text, text, text, text, select, select, select, textarea
  "10140": ["Name", "Phone", "Email", "Practice Name", "City", "Zip Code", "State", "Country", "Specialty", "I Am A", "Purpose of Inquiry", "Description"],
  // Patient General (form 10102)
  "10102": ["Name", "Email", "City", "State", "Zip Code", "Country", "Phone", "Subject", "Description"],
  // Patient Medical (form 10121)
  "10121": ["Name", "Phone", "Email", "City", "Zip Code", "State", "Country", "Product", "Description"],
  // Schedule a Demo (form 434)
  "434": ["Name", "Email", "Phone", "Practice Name", "Product Interest"],
};

const SKIP_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page", "checkbox"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify user
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all Avada leads missing lead_fields_flat
    const { data: leads, error: leadsErr } = await supabase.rpc("get_avada_leads_missing_fields");

    // Fallback: direct query
    const { data: missingLeads } = await supabase
      .from("leads")
      .select("id, org_id, form_id, data")
      .eq("lead_type", "avada")
      .neq("status", "trashed")
      .limit(500);

    if (!missingLeads || missingLeads.length === 0) {
      return new Response(JSON.stringify({ ok: true, backfilled: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get form external IDs
    const formIds = [...new Set(missingLeads.map(l => l.form_id))];
    const { data: forms } = await supabase
      .from("forms").select("id, external_form_id").in("id", formIds);
    const formExtMap: Record<string, string> = {};
    forms?.forEach(f => { formExtMap[f.id] = f.external_form_id; });

    // Check which leads already have fields
    const leadIds = missingLeads.map(l => l.id);
    const { data: existingFields } = await supabase
      .from("lead_fields_flat").select("lead_id").in("lead_id", leadIds.slice(0, 500));
    const hasFields = new Set((existingFields || []).map(f => f.lead_id));

    let backfilled = 0;

    for (const lead of missingLeads) {
      if (hasFields.has(lead.id)) continue;

      const extFormId = formExtMap[lead.form_id];
      const knownLabels = extFormId ? FORM_LABELS[extFormId] : undefined;
      const data = lead.data as any[];
      if (!Array.isArray(data)) continue;

      const dataEntry = data.find((d: any) => d.name === "data");
      const typesEntry = data.find((d: any) => d.name === "field_types");

      if (!dataEntry?.value || !typesEntry?.value) continue;

      const values = dataEntry.value.split(", ").map((v: string) => v.trim());
      const types = typesEntry.value.split(", ").map((t: string) => t.trim());

      const flatRows: any[] = [];
      let valueIdx = 0;

      for (let i = 0; i < types.length; i++) {
        const type = types[i]?.toLowerCase();
        if (SKIP_TYPES.has(type)) continue;

        const val = values[valueIdx] || "";
        valueIdx++;
        if (!val || val === "Array") continue;

        const label = knownLabels?.[valueIdx - 1] || `Field ${valueIdx}`;
        flatRows.push({
          org_id: lead.org_id,
          lead_id: lead.id,
          field_key: label.toLowerCase().replace(/\s+/g, "_"),
          field_label: label,
          field_type: type,
          value_text: val,
        });
      }

      if (flatRows.length > 0) {
        const { error } = await supabase.from("lead_fields_flat").insert(flatRows);
        if (!error) backfilled++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, backfilled, total_checked: missingLeads.length }),
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
