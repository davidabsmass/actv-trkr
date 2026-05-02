import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: Record<string, any> = {};

    // Get all orgs with active/past_due subscriptions (or no subscription record = active by default)
    const { data: orgs } = await supabase.from("orgs").select("id, timezone");
    if (!orgs || orgs.length === 0) {
      return jsonResponse({ message: "No orgs found" }, 200);
    }

    for (const org of orgs) {
      const orgId = org.id;
      const orgResult: Record<string, any> = { aggregate: "skipped", archive: "skipped", cleanup: "skipped" };

      // Check subscription status
      const { data: sub } = await supabase
        .from("subscription_status")
        .select("status, grace_end_at")
        .eq("org_id", orgId)
        .maybeSingle();

      const subStatus = sub?.status || "active"; // default active if no record

      // ─── STEP 1: Aggregate yesterday ───
      if (subStatus === "active" || subStatus === "past_due") {
        try {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const dateStr = yesterday.toISOString().split("T")[0];

          await aggregateDay(supabase, orgId, dateStr);
          await upsertMonthlyAggregates(supabase, orgId, dateStr);
          orgResult.aggregate = "ok";
        } catch (err) {
          console.error(`Aggregate error org=${orgId}:`, err);
          orgResult.aggregate = "error";
        }
      }

      // ─── STEP 2: Archive raw data older than retention window ───
      if ((subStatus === "active" || subStatus === "past_due")) {
        try {
          // Check org archive settings
          const { data: settings } = await supabase
            .from("site_settings")
            .select("raw_retention_days, archive_enabled, archive_format")
            .eq("org_id", orgId)
            .maybeSingle();

          // 60 days of live detailed data; aggregates remain for 12+ months
          const retentionDays = settings?.raw_retention_days || 60;
          const archiveEnabled = settings?.archive_enabled !== false;

          if (archiveEnabled) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);
            const cutoffStr = cutoff.toISOString().split("T")[0];

            const tables = [
              { name: "pageviews", dateCol: "occurred_at", manifest: "pageviews" },
              { name: "sessions", dateCol: "started_at", manifest: "sessions" },
              { name: "leads", dateCol: "submitted_at", manifest: "form_submissions" },
              { name: "events", dateCol: "occurred_at", manifest: "events" },
              { name: "lead_events_raw", dateCol: "received_at", manifest: "lead_events" },
              { name: "form_submission_logs", dateCol: "occurred_at", manifest: "form_events" },
            ] as const;

            for (const table of tables) {
              await archiveTable(supabase, orgId, table.name, table.manifest, table.dateCol, cutoffStr);
            }
            orgResult.archive = "ok";
          }
        } catch (err) {
          console.error(`Archive error org=${orgId}:`, err);
          orgResult.archive = "error";
        }
      }

      // ─── STEP 3: Cleanup canceled orgs past grace ───
      if (subStatus === "canceled" && sub?.grace_end_at) {
        const graceEnd = new Date(sub.grace_end_at);
        const now = new Date();
        // 90-day retention after grace
        const deleteAfter = new Date(graceEnd);
        deleteAfter.setDate(deleteAfter.getDate() + 90);

        if (now > deleteAfter) {
          try {
            await cleanupOrg(supabase, orgId);
            orgResult.cleanup = "deleted";
          } catch (err) {
            console.error(`Cleanup error org=${orgId}:`, err);
            orgResult.cleanup = "error";
          }
        }
      }

      results[orgId] = orgResult;
    }

    return jsonResponse({ results }, 200);
  } catch (err) {
    console.error("archive-nightly error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ═══════════════════════════════════════════
// AGGREGATE DAILY
// ═══════════════════════════════════════════
async function aggregateDay(supabase: any, orgId: string, dateStr: string) {
  const dayStart = `${dateStr}T00:00:00Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  // Pageviews total
  const { count: pvCount } = await supabase.from("pageviews")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd);
  await upsertDaily(supabase, "traffic_daily", orgId, dateStr, "pageviews_total", null, pvCount || 0);

  // Sessions total
  const { count: sessCount } = await supabase.from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
  await upsertDaily(supabase, "traffic_daily", orgId, dateStr, "sessions_total", null, sessCount || 0);

  // Visitors total
  const { data: visitors } = await supabase.from("pageviews")
    .select("visitor_id").eq("org_id", orgId)
    .gte("occurred_at", dayStart).lte("occurred_at", dayEnd)
    .not("visitor_id", "is", null);
  await upsertDaily(supabase, "traffic_daily", orgId, dateStr, "visitors_total", null,
    new Set(visitors?.map((v: any) => v.visitor_id)).size);

  // Leads total
  const { count: leadsCount } = await supabase.from("leads")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
  await upsertDaily(supabase, "kpi_daily", orgId, dateStr, "leads_total", null, leadsCount || 0);

  // Sessions by source (top 50) — collapse self-referrals to "direct" so
  // the dashboard's kpi_daily-backed Top Sources widget never shows the
  // org's own domain (apex / www. / subdomain) as a referrer.
  const { data: orgSites } = await supabase.from("sites").select("domain").eq("org_id", orgId);
  const ownedRoots = new Set<string>();
  for (const s of orgSites || []) {
    const host = String((s as any).domain || "")
      .toLowerCase().trim()
      .replace(/^https?:\/\//, "").replace(/^www\./, "")
      .replace(/[/?#].*$/, "").replace(/:\d+$/, "");
    if (!host) continue;
    ownedRoots.add(host);
    const parts = host.split(".");
    if (parts.length > 2) ownedRoots.add(parts.slice(-2).join("."));
  }
  const isSelfRef = (raw: string): boolean => {
    const h = raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "")
      .replace(/[/?#].*$/, "").replace(/:\d+$/, "");
    if (!h) return false;
    if (ownedRoots.has(h)) return true;
    for (const o of ownedRoots) if (h === o || h.endsWith("." + o)) return true;
    return false;
  };

  const { data: sbs } = await supabase.from("sessions")
    .select("utm_source, landing_referrer_domain")
    .eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
  if (sbs) {
    const m = countBy(sbs, (s: any) => {
      const raw = s.utm_source || s.landing_referrer_domain || "";
      if (!raw) return "direct";
      return isSelfRef(raw) ? "direct" : raw;
    });
    const top = topN(m, 50);
    for (const [d, v] of top) await upsertDaily(supabase, "traffic_daily", orgId, dateStr, "sessions_by_source", d, v);
  }

  // Sessions by page (top 50)
  const { data: sbp } = await supabase.from("sessions")
    .select("landing_page_path")
    .eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
  if (sbp) {
    const m = countBy(sbp, (s: any) => s.landing_page_path || "(unknown)");
    const top = topN(m, 50);
    for (const [d, v] of top) await upsertDaily(supabase, "traffic_daily", orgId, dateStr, "sessions_by_page", d, v);
  }

  // Leads by source
  const { data: lbs } = await supabase.from("leads")
    .select("source").eq("org_id", orgId)
    .gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
  if (lbs) {
    const m = countBy(lbs, (l: any) => l.source || "direct");
    for (const [d, v] of Object.entries(m)) await upsertDaily(supabase, "kpi_daily", orgId, dateStr, "leads_by_source", d, v);
  }

  // Leads by form
  const { data: lbf } = await supabase.from("leads")
    .select("form_id").eq("org_id", orgId)
    .gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
  if (lbf) {
    const m = countBy(lbf, (l: any) => l.form_id || "(unknown)");
    for (const [d, v] of Object.entries(m)) await upsertDaily(supabase, "kpi_daily", orgId, dateStr, "leads_by_form", d, v);
  }

  // Leads by page
  const { data: lbp } = await supabase.from("leads")
    .select("page_path").eq("org_id", orgId)
    .gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
  if (lbp) {
    const m = countBy(lbp, (l: any) => l.page_path || "(unknown)");
    for (const [d, v] of Object.entries(m)) await upsertDaily(supabase, "kpi_daily", orgId, dateStr, "leads_by_page", d, v);
  }

  // Sessions by country
  const { data: sbc } = await supabase.from("pageviews")
    .select("country_code, session_id")
    .eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd)
    .not("country_code", "is", null);
  if (sbc) {
    const csMap: Record<string, Set<string>> = {};
    sbc.forEach((pv: any) => {
      const cc = pv.country_code || "XX";
      if (!csMap[cc]) csMap[cc] = new Set();
      csMap[cc].add(pv.session_id || cc);
    });
    for (const [cc, sessions] of Object.entries(csMap)) {
      await upsertDaily(supabase, "traffic_daily", orgId, dateStr, "sessions_by_country", cc, sessions.size);
    }
  }

  // Sessions by campaign
  const { data: sbcmp } = await supabase.from("sessions")
    .select("utm_campaign").eq("org_id", orgId)
    .gte("started_at", dayStart).lte("started_at", dayEnd)
    .not("utm_campaign", "is", null);
  if (sbcmp) {
    const m = countBy(sbcmp, (s: any) => s.utm_campaign);
    for (const [d, v] of Object.entries(m)) await upsertDaily(supabase, "traffic_daily", orgId, dateStr, "sessions_by_campaign", d, v);
  }

  // Leads by campaign
  const { data: lbcmp } = await supabase.from("leads")
    .select("utm_campaign").eq("org_id", orgId)
    .gte("submitted_at", dayStart).lte("submitted_at", dayEnd)
    .not("utm_campaign", "is", null);
  if (lbcmp) {
    const m = countBy(lbcmp, (l: any) => l.utm_campaign);
    for (const [d, v] of Object.entries(m)) await upsertDaily(supabase, "kpi_daily", orgId, dateStr, "leads_by_campaign", d, v);
  }
}

// ═══════════════════════════════════════════
// MONTHLY AGGREGATES
// ═══════════════════════════════════════════
async function upsertMonthlyAggregates(supabase: any, orgId: string, dateStr: string) {
  const d = new Date(dateStr);
  const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const monthEnd = new Date(nextMonth.getTime() - 1).toISOString();

  // Sum daily aggregates for this month
  const metrics = ["pageviews_total", "sessions_total", "visitors_total"];
  for (const metric of metrics) {
    const { data: dailyRows } = await supabase.from("traffic_daily")
      .select("value").eq("org_id", orgId).eq("metric", metric)
      .is("dimension", null)
      .gte("date", monthStart).lt("date", nextMonth.toISOString().split("T")[0]);

    const total = dailyRows?.reduce((sum: number, r: any) => sum + Number(r.value), 0) || 0;
    await upsertMonthly(supabase, orgId, monthStart, metric, null, total);
  }

  // Leads total monthly
  const { data: leadRows } = await supabase.from("kpi_daily")
    .select("value").eq("org_id", orgId).eq("metric", "leads_total")
    .is("dimension", null)
    .gte("date", monthStart).lt("date", nextMonth.toISOString().split("T")[0]);
  const leadsTotal = leadRows?.reduce((sum: number, r: any) => sum + Number(r.value), 0) || 0;
  await upsertMonthly(supabase, orgId, monthStart, "leads_total", null, leadsTotal);
}

async function upsertMonthly(supabase: any, orgId: string, month: string, metric: string, dimension: string | null, value: number) {
  let q = supabase.from("monthly_aggregates").select("id")
    .eq("org_id", orgId).eq("month", month).eq("metric", metric);
  q = dimension === null ? q.is("dimension", null) : q.eq("dimension", dimension);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    await supabase.from("monthly_aggregates").update({ value }).eq("id", existing.id);
  } else {
    await supabase.from("monthly_aggregates").insert({ org_id: orgId, month, metric, dimension, value });
  }
}

// ═══════════════════════════════════════════
// ARCHIVE RAW DATA
// ═══════════════════════════════════════════
async function archiveTable(
  supabase: any, orgId: string,
  dbTable: string, manifestTable: string,
  dateCol: string, cutoffDate: string
) {
  // Get the oldest record date
  const { data: oldest } = await supabase.from(dbTable)
    .select(dateCol)
    .eq("org_id", orgId)
    .lte(dateCol, `${cutoffDate}T23:59:59.999Z`)
    .order(dateCol, { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!oldest) return; // nothing to archive

  const oldestDate = new Date(oldest[dateCol]);
  const cutoffDateObj = new Date(cutoffDate);

  // Process day by day from oldest to cutoff
  const current = new Date(oldestDate);
  current.setUTCHours(0, 0, 0, 0);

  while (current <= cutoffDateObj) {
    const dayStr = current.toISOString().split("T")[0];

    // Check idempotency — skip if already archived
    const { data: existing } = await supabase.from("archive_manifest")
      .select("id")
      .eq("org_id", orgId)
      .eq("table_name", manifestTable)
      .eq("start_date", dayStr)
      .eq("end_date", dayStr)
      .maybeSingle();

    if (existing) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dayStart = `${dayStr}T00:00:00Z`;
    const dayEnd = `${dayStr}T23:59:59.999Z`;

    // Fetch rows for this day
    const { data: rows, error: fetchErr } = await supabase.from(dbTable)
      .select("*")
      .eq("org_id", orgId)
      .gte(dateCol, dayStart)
      .lte(dateCol, dayEnd)
      .limit(10000);

    if (fetchErr || !rows || rows.length === 0) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Strip sensitive fields from leads
    const sanitized = dbTable === "leads"
      ? rows.map((r: any) => { const { data: _, ...rest } = r; return rest; })
      : rows;

    // Convert to JSONL
    const jsonl = sanitized.map((r: any) => JSON.stringify(r)).join("\n");
    const encoder = new TextEncoder();
    const blob = encoder.encode(jsonl);

    // Upload to storage
    const yyyy = dayStr.substring(0, 4);
    const mm = dayStr.substring(5, 7);
    const dd = dayStr.substring(8, 10);
    const objectPath = `${orgId}/${manifestTable}/${yyyy}/${mm}/${dd}/data.jsonl`;

    const { error: uploadErr } = await supabase.storage
      .from("archives")
      .upload(objectPath, blob, {
        contentType: "application/jsonl",
        upsert: true,
      });

    if (uploadErr) {
      console.error(`Upload error ${orgId}/${manifestTable}/${dayStr}:`, uploadErr);
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Record in manifest
    await supabase.from("archive_manifest").insert({
      org_id: orgId,
      table_name: manifestTable,
      start_date: dayStr,
      end_date: dayStr,
      object_path: objectPath,
      file_format: "jsonl_gzip",
      row_count: sanitized.length,
      size_bytes: blob.byteLength,
    });

    // Delete archived rows from hot DB
    await supabase.from(dbTable)
      .delete()
      .eq("org_id", orgId)
      .gte(dateCol, dayStart)
      .lte(dateCol, dayEnd);

    current.setDate(current.getDate() + 1);
  }
}

// ═══════════════════════════════════════════
// CLEANUP CANCELED ORGS
// ═══════════════════════════════════════════
async function cleanupOrg(supabase: any, orgId: string) {
  // Delete archived files
  const { data: manifests } = await supabase.from("archive_manifest")
    .select("object_path").eq("org_id", orgId);

  if (manifests) {
    const paths = manifests.map((m: any) => m.object_path);
    if (paths.length > 0) {
      await supabase.storage.from("archives").remove(paths);
    }
  }

  // Delete hot data
  for (const table of ["pageviews", "sessions", "leads", "lead_events_raw", "lead_fields_flat"]) {
    await supabase.from(table).delete().eq("org_id", orgId);
  }

  // Delete aggregates
  for (const table of ["traffic_daily", "kpi_daily", "monthly_aggregates"]) {
    await supabase.from(table).delete().eq("org_id", orgId);
  }

  // Delete archive manifest
  await supabase.from("archive_manifest").delete().eq("org_id", orgId);

  // Delete export artifacts
  const { data: exports } = await supabase.from("export_jobs")
    .select("file_path").eq("org_id", orgId).not("file_path", "is", null);
  if (exports) {
    const paths = exports.map((e: any) => e.file_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("exports").remove(paths);
    }
  }
  await supabase.from("export_jobs").delete().eq("org_id", orgId);

  // Audit log
  await supabase.from("deletion_audit").insert({
    org_id: orgId,
    action: "full_org_cleanup",
    details: { reason: "canceled_past_grace_plus_retention" },
  });
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function countBy(arr: any[], keyFn: (item: any) => string): Record<string, number> {
  const m: Record<string, number> = {};
  arr.forEach((item) => { const k = keyFn(item); m[k] = (m[k] || 0) + 1; });
  return m;
}

function topN(m: Record<string, number>, n: number): [string, number][] {
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function upsertDaily(supabase: any, table: string, orgId: string, date: string, metric: string, dimension: string | null, value: number) {
  let q = supabase.from(table).select("id").eq("org_id", orgId).eq("date", date).eq("metric", metric);
  q = dimension === null ? q.is("dimension", null) : q.eq("dimension", dimension);
  const { data: existing } = await q.maybeSingle();
  if (existing) await supabase.from(table).update({ value }).eq("id", existing.id);
  else await supabase.from(table).insert({ org_id: orgId, date, metric, dimension, value });
}

function jsonResponse(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
