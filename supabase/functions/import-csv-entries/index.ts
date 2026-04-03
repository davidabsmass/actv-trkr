import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the user via their JWT
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { form_id, rows } = body;
    // rows = [{ fields: { Name: "...", Email: "...", ... }, submitted_at: "2026-02-02T23:57:11Z", external_entry_id: "csv_1" }]

    if (!form_id || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "Missing form_id or rows" }), {
        status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get the form to find org_id and site_id
    const { data: form, error: formErr } = await supabase
      .from("forms").select("id, org_id, site_id, provider").eq("id", form_id).single();
    if (formErr || !form) {
      return new Response(JSON.stringify({ error: "Form not found" }), {
        status: 404, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify user is member of this org
    const { data: membership } = await supabase
      .from("org_users").select("role").eq("org_id", form.org_id).eq("user_id", user.id).single();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const orgId = form.org_id;
    const siteId = form.site_id;

    // Get existing leads for this form to deduplicate by submitted_at
    const { data: existingLeads } = await supabase
      .from("leads").select("submitted_at")
      .eq("org_id", orgId).eq("form_id", form_id);

    const existingTimestamps = new Set(
      (existingLeads || []).map(l => new Date(l.submitted_at).toISOString())
    );

    let imported = 0;
    let skipped = 0;

    const SKIP_KEYS = new Set(["data", "submission", "field_labels", "field_types", "field_keys",
      "hidden_field_names", "fields_holding_privacy_data"]);

    for (const row of rows) {
      const submittedAt = row.submitted_at ? new Date(row.submitted_at).toISOString() : null;
      if (!submittedAt) { skipped++; continue; }

      // Deduplicate
      if (existingTimestamps.has(submittedAt)) { skipped++; continue; }
      existingTimestamps.add(submittedAt);

      const extEntryId = row.external_entry_id || `csv_import_${Date.now()}_${imported}`;
      const fields = row.fields || {};

      // Insert lead
      const { data: lead, error: leadErr } = await supabase.from("leads").insert({
        org_id: orgId,
        site_id: siteId,
        form_id: form_id,
        submitted_at: submittedAt,
        source: "csv_import",
        medium: "import",
        lead_type: form.provider || "csv_import",
        status: "new",
        data: fields,
      }).select("id").single();

      if (leadErr) {
        console.error("Lead insert error:", leadErr);
        skipped++;
        continue;
      }

      // Insert lead_events_raw for traceability
      await supabase.from("lead_events_raw").upsert({
        org_id: orgId,
        site_id: siteId,
        form_id: form_id,
        external_entry_id: extEntryId,
        submitted_at: submittedAt,
        payload: { csv_import: true, fields },
        context: { source: "csv_import" },
      }, { onConflict: "org_id,site_id,form_id,external_entry_id", ignoreDuplicates: true });

      // Insert lead_fields_flat
      const flatRows = Object.entries(fields)
        .filter(([key, value]) => {
          if (SKIP_KEYS.has(key)) return false;
          if (value === undefined || value === null || String(value).trim() === "") return false;
          return true;
        })
        .map(([key, value]) => ({
          org_id: orgId,
          lead_id: lead.id,
          field_key: key,
          field_label: key,
          field_type: "text",
          value_text: String(value),
        }));

      if (flatRows.length > 0) {
        await supabase.from("lead_fields_flat").insert(flatRows);
      }

      imported++;
    }

    return new Response(
      JSON.stringify({ ok: true, imported, skipped }),
      { status: 200, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("import-csv-entries error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
