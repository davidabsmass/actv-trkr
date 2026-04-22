import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });

  try {
    // ── Auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub;

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { job_id } = await req.json().catch(() => ({}));

    // Find the job
    let job: any;
    if (job_id) {
      const { data } = await supabase.from("export_jobs").select("*").eq("id", job_id).single();
      job = data;
    } else {
      const { data } = await supabase.from("export_jobs")
        .select("*")
        .eq("request_type", "archive_export")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      job = data;
    }

    if (!job) {
      return jsonResponse({ message: "No archive export jobs to process" }, 200);
    }

    // ── Verify caller is a member of the job's org ──
    const { data: membership } = await supabase
      .from("org_users")
      .select("role")
      .eq("org_id", job.org_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || !["admin", "member"].includes(membership.role)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Mark as running
    await supabase.from("export_jobs").update({ status: "running" }).eq("id", job.id);

    try {
      const orgId = job.org_id;
      const startDate = job.start_date;
      const endDate = job.end_date;
      const tableName = job.table_name || "leads";

      // Map table_name to DB table and date column
      const tableMap: Record<string, { dbTable: string; dateCol: string; manifestName: string }> = {
        sessions: { dbTable: "sessions", dateCol: "started_at", manifestName: "sessions" },
        pageviews: { dbTable: "pageviews", dateCol: "occurred_at", manifestName: "pageviews" },
        form_submissions: { dbTable: "leads", dateCol: "submitted_at", manifestName: "form_submissions" },
        leads: { dbTable: "leads", dateCol: "submitted_at", manifestName: "form_submissions" },
        events: { dbTable: "events", dateCol: "occurred_at", manifestName: "events" },
        lead_events: { dbTable: "lead_events_raw", dateCol: "received_at", manifestName: "lead_events" },
        form_events: { dbTable: "form_submission_logs", dateCol: "occurred_at", manifestName: "form_events" },
      };

      const config = tableMap[tableName] || tableMap["leads"];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      const cutoffStr = cutoff.toISOString().split("T")[0];

      let allRows: any[] = [];

      // ─── Part 1: Hot DB rows (within retention) ───
      if (!endDate || endDate >= cutoffStr) {
        const hotStart = startDate && startDate > cutoffStr ? startDate : cutoffStr;
        const hotEnd = endDate || new Date().toISOString().split("T")[0];

        const { data: hotRows } = await supabase.from(config.dbTable)
          .select("*")
          .eq("org_id", orgId)
          .gte(config.dateCol, `${hotStart}T00:00:00Z`)
          .lte(config.dateCol, `${hotEnd}T23:59:59.999Z`)
          .order(config.dateCol, { ascending: true })
          .limit(50000);

        if (hotRows) allRows = allRows.concat(hotRows);
      }

      // ─── Part 2: Archived rows (from cold storage) ───
      if (startDate && startDate < cutoffStr) {
        const archiveEnd = endDate && endDate < cutoffStr ? endDate : cutoffStr;

        const { data: manifests } = await supabase.from("archive_manifest")
          .select("object_path, row_count")
          .eq("org_id", orgId)
          .eq("table_name", config.manifestName)
          .gte("start_date", startDate)
          .lte("end_date", archiveEnd)
          .order("start_date", { ascending: true });

        if (manifests) {
          for (const m of manifests) {
            const { data: fileData } = await supabase.storage
              .from("archives")
              .download(m.object_path);

            if (fileData) {
              const text = await fileData.text();
              const lines = text.split("\n").filter((l: string) => l.trim());
              const parsed = lines.map((l: string) => {
                try { return JSON.parse(l); } catch { return null; }
              }).filter(Boolean);
              allRows = allRows.concat(parsed);
            }
          }
        }
      }

      // ─── Build CSV ───
      if (allRows.length === 0) {
        await supabase.from("export_jobs").update({
          status: "complete",
          completed_at: new Date().toISOString(),
          row_count: 0,
          error: "No data found for the requested range",
        }).eq("id", job.id);
        return jsonResponse({ message: "No data for range", job_id: job.id }, 200);
      }

      // Collect all columns
      const colSet = new Set<string>();
      allRows.forEach((r: any) => Object.keys(r).forEach((k) => colSet.add(k)));
      // Remove sensitive data field from leads
      colSet.delete("data");
      const columns = Array.from(colSet);

      const csvLines = [columns.join(",")];
      for (const row of allRows) {
        csvLines.push(columns.map((col) => escCsv(String(row[col] ?? ""))).join(","));
      }
      const csvContent = csvLines.join("\n");
      const blob = new TextEncoder().encode(csvContent);

      // Upload
      const outputPath = `${orgId}/${job.id}/export.csv`;
      const { error: uploadErr } = await supabase.storage
        .from("exports")
        .upload(outputPath, blob, { contentType: "text/csv", upsert: true });

      if (uploadErr) throw uploadErr;

      await supabase.from("export_jobs").update({
        status: "complete",
        completed_at: new Date().toISOString(),
        file_path: outputPath,
        row_count: allRows.length,
        output_size_bytes: blob.byteLength,
      }).eq("id", job.id);

      return jsonResponse({ message: "Export complete", job_id: job.id, rows: allRows.length }, 200);

    } catch (err: any) {
      console.error("Archive export error:", err);
      await supabase.from("export_jobs").update({
        status: "failed",
        error: err.message || "Unknown error",
        completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      return jsonResponse({ error: err.message }, 500);
    }
  } catch (err) {
    console.error("process-archive-export error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

function escCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function jsonResponse(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}
