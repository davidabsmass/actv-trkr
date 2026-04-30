import { appCorsHeaders } from '../_shared/cors.ts'
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Rate limit check
    const rl = await checkUserRateLimit(userId, "process-export");
    if (!rl.allowed) return rateLimitResponse(appCorsHeaders(req), rl.retryAfterMs);

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let jobId: string | null = null;
    try {
      const body = await req.json();
      jobId = body.job_id || null;
    } catch { /* no body is fine */ }

    let query = supabase.from("export_jobs").select("*").eq("status", "queued").order("created_at").limit(1);
    if (jobId) query = supabase.from("export_jobs").select("*").eq("id", jobId).limit(1);

    const { data: jobs, error: jobErr } = await query;
    if (jobErr) throw jobErr;
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "No queued jobs" }), {
        status: 200, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const job = jobs[0];
    const orgId = job.org_id;

    // Verify caller is a member of the job's org
    const { data: membership } = await supabase
      .from("org_users").select("role")
      .eq("org_id", orgId).eq("user_id", userId).maybeSingle();
    if (!membership || !["admin", "member"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase.from("export_jobs").update({ status: "running" }).eq("id", job.id);

    try {
      // Build leads query with optional filters. Supabase caps each request at
      // 1000 rows by default, so we paginate up to a hard ceiling of 5000.
      const HARD_CAP = 5000;
      const PAGE = 1000;
      const filters = job.filters_json as Record<string, any> | null;

      const buildBaseQuery = () => {
        let q = supabase
          .from("leads")
          .select("id, submitted_at, status, source, utm_source, utm_medium, utm_campaign, page_url, page_path, referrer_domain, form_id, service, location, physician, lead_type, lead_score")
          .eq("org_id", orgId)
          .order("submitted_at", { ascending: false });
        if (filters?.form_id) q = q.eq("form_id", filters.form_id);
        if (job.start_date) q = q.gte("submitted_at", `${job.start_date}T00:00:00Z`);
        if (job.end_date) q = q.lte("submitted_at", `${job.end_date}T23:59:59.999Z`);
        return q;
      };

      const leads: any[] = [];
      for (let offset = 0; offset < HARD_CAP; offset += PAGE) {
        const end = Math.min(offset + PAGE, HARD_CAP) - 1;
        const { data: page, error: pageErr } = await buildBaseQuery().range(offset, end);
        if (pageErr) throw pageErr;
        if (!page || page.length === 0) break;
        leads.push(...page);
        if (page.length < PAGE) break;
      }

      if (!leads || leads.length === 0) {
        await supabase.from("export_jobs").update({
          status: "succeeded", completed_at: new Date().toISOString(), row_count: 0,
          file_path: null, error: null,
        }).eq("id", job.id);
        return new Response(JSON.stringify({ message: "No leads to export", job_id: job.id }), {
          status: 200, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Fetch lead fields
      const skipFieldTypes = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page"]);
      const leadIds = leads.map((l: any) => l.id);
      const allFields: any[] = [];
      for (let i = 0; i < leadIds.length; i += 100) {
        const batch = leadIds.slice(i, i + 100);
        const { data: fields } = await supabase
          .from("lead_fields_flat")
          .select("lead_id, field_key, field_label, field_type, value_text")
          .eq("org_id", orgId)
          .in("lead_id", batch);
        if (fields) {
          for (const f of fields) {
            if (!skipFieldTypes.has((f.field_type || "").toLowerCase())) {
              allFields.push(f);
            }
          }
        }
      }

      // Build field map
      const leadFieldMap = new Map<string, Record<string, string>>();
      const allFieldKeys = new Map<string, string>();
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
      const fieldCols = [...allFieldKeys.entries()];
      const headerRow = ["Date", "Form", "Status", ...fieldCols.map(([, label]) => label)];
      const csvRows: string[] = [headerRow.map(escCsv).join(",")];

      for (const lead of leads) {
        const fields = leadFieldMap.get(lead.id) || {};
        const row = [
          lead.submitted_at ? new Date(lead.submitted_at).toLocaleDateString("en-US") : "",
          formNameMap[lead.form_id] || "",
          lead.status || "",
          ...fieldCols.map(([key]) => fields[key] || ""),
        ];
        csvRows.push(row.map(escCsv).join(","));
      }

      // Prepend UTF-8 BOM so Excel and browsers correctly render accented
      // characters (otherwise "–" / curly quotes show up as "â€"" mojibake).
      const csvContent = "\uFEFF" + csvRows.join("\n");
      const fileName = `${orgId}/export_${job.id}.csv`;

      const { error: uploadErr } = await supabase.storage
        .from("exports")
        .upload(fileName, new Blob([csvContent], { type: "text/csv; charset=utf-8" }), {
          contentType: "text/csv; charset=utf-8",
          upsert: true,
        });
      if (uploadErr) throw uploadErr;

      await supabase.from("export_jobs").update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        row_count: leads.length,
        file_path: fileName,
        error: null,
      }).eq("id", job.id);

      return new Response(JSON.stringify({ message: "Export completed", job_id: job.id, rows: leads.length }), {
        status: 200, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    } catch (processErr) {
      console.error("Export processing error:", processErr);
      await supabase.from("export_jobs").update({
        status: "failed",
        error: processErr instanceof Error ? processErr.message : "Unknown error",
      }).eq("id", job.id);
      throw processErr;
    }
  } catch (err) {
    console.error("Export error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

function escCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
