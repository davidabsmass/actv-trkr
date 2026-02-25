import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept optional job_id from the request body
    let jobId: string | null = null;
    try {
      const body = await req.json();
      jobId = body.job_id || null;
    } catch { /* no body is fine */ }

    // Find queued job(s)
    let query = supabase.from("export_jobs").select("*").eq("status", "queued").order("created_at").limit(1);
    if (jobId) query = supabase.from("export_jobs").select("*").eq("id", jobId).limit(1);

    const { data: jobs, error: jobErr } = await query;
    if (jobErr) throw jobErr;
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "No queued jobs" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const job = jobs[0];
    const orgId = job.org_id;

    // Mark as processing
    await supabase.from("export_jobs").update({ status: "processing" }).eq("id", job.id);

    try {
      // Fetch leads
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, submitted_at, status, source, utm_source, utm_medium, utm_campaign, page_url, page_path, referrer_domain, form_id, service, location, physician, lead_type, lead_score")
        .eq("org_id", orgId)
        .order("submitted_at", { ascending: false })
        .limit(5000);

      if (leadsErr) throw leadsErr;
      if (!leads || leads.length === 0) {
        await supabase.from("export_jobs").update({
          status: "completed", completed_at: new Date().toISOString(), row_count: 0,
          file_path: null, error: null,
        }).eq("id", job.id);
        return new Response(JSON.stringify({ message: "No leads to export", job_id: job.id }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch lead fields
      const leadIds = leads.map((l: any) => l.id);
      const allFields: any[] = [];
      for (let i = 0; i < leadIds.length; i += 100) {
        const batch = leadIds.slice(i, i + 100);
        const { data: fields } = await supabase
          .from("lead_fields_flat")
          .select("lead_id, field_key, field_label, value_text")
          .eq("org_id", orgId)
          .in("lead_id", batch);
        if (fields) allFields.push(...fields);
      }

      // Build field map
      const leadFieldMap = new Map<string, Record<string, string>>();
      const allFieldKeys = new Map<string, string>(); // key -> label
      for (const f of allFields) {
        if (!leadFieldMap.has(f.lead_id)) leadFieldMap.set(f.lead_id, {});
        leadFieldMap.get(f.lead_id)![f.field_key] = f.value_text || "";
        if (!allFieldKeys.has(f.field_key)) {
          allFieldKeys.set(f.field_key, f.field_label || f.field_key);
        }
      }

      // Fetch form names
      const formIds = [...new Set(leads.map((l: any) => l.form_id))];
      const { data: forms } = await supabase.from("forms").select("id, name").in("id", formIds);
      const formNameMap: Record<string, string> = {};
      (forms || []).forEach((f: any) => { formNameMap[f.id] = f.name; });

      // Build CSV
      const baseCols = ["submitted_at", "status", "form", "source", "utm_source", "utm_medium", "utm_campaign", "page_path", "referrer_domain", "service", "location", "lead_type", "lead_score"];
      const fieldCols = [...allFieldKeys.entries()];
      const headerRow = [...baseCols, ...fieldCols.map(([, label]) => label)];

      const csvRows: string[] = [headerRow.map(escCsv).join(",")];

      for (const lead of leads) {
        const fields = leadFieldMap.get(lead.id) || {};
        const row = [
          lead.submitted_at || "",
          lead.status || "",
          formNameMap[lead.form_id] || lead.form_id || "",
          lead.source || "",
          lead.utm_source || "",
          lead.utm_medium || "",
          lead.utm_campaign || "",
          lead.page_path || "",
          lead.referrer_domain || "",
          lead.service || "",
          lead.location || "",
          lead.lead_type || "",
          lead.lead_score != null ? String(lead.lead_score) : "",
          ...fieldCols.map(([key]) => fields[key] || ""),
        ];
        csvRows.push(row.map(escCsv).join(","));
      }

      const csvContent = csvRows.join("\n");
      const fileName = `export_${job.id}.csv`;

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from("exports")
        .upload(fileName, new Blob([csvContent], { type: "text/csv" }), {
          contentType: "text/csv",
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      // Update job as completed
      await supabase.from("export_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        row_count: leads.length,
        file_path: fileName,
        error: null,
      }).eq("id", job.id);

      return new Response(JSON.stringify({ message: "Export completed", job_id: job.id, rows: leads.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (processErr) {
      console.error("Export processing error:", processErr);
      await supabase.from("export_jobs").update({
        status: "error",
        error: processErr instanceof Error ? processErr.message : "Unknown error",
      }).eq("id", job.id);
      throw processErr;
    }
  } catch (err) {
    console.error("Export error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
