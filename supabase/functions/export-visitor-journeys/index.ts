// Streams a CSV export of visitor journeys for a given org/date range/filter.
// Bypasses the 500-row UI cap. Uses the caller's JWT for RLS-equivalent
// authorization (the underlying RPC enforces is_org_member + admin).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  org_id: string;
  start: string; // ISO
  end: string;   // ISO
  site_id?: string | null;
  outcome?: "all" | "lead" | "engaged" | "bounced";
  sort?: "recent" | "relevance";
}

const PAGE_SIZE = 500; // matches RPC hard cap

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS = [
  "session_id",
  "visitor_id",
  "site_id",
  "started_at",
  "ended_at",
  "duration_seconds",
  "active_seconds",
  "pageview_count",
  "landing_page_path",
  "landing_referrer_domain",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "exit_page_path",
  "exit_page_title",
  "exit_at",
  "device",
  "country_code",
  "has_lead",
  "has_conversion",
  "engagement_score",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { org_id, start, end, site_id, outcome = "all", sort = "recent" } = body;
  if (!org_id || !start || !end) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify user identity for the audit log
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Stream CSV. The RPC caps at 500 rows per call, so we page through using
  // the rank/started_at order via offset.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(HEADERS.join(",") + "\n"));

      let offset = 0;
      let rowsExported = 0;
      const HARD_TOTAL_CAP = 50_000; // safety net

      try {
        while (rowsExported < HARD_TOTAL_CAP) {
          const { data, error } = await supabase.rpc("get_session_journeys", {
            p_org_id: org_id,
            p_start: start,
            p_end: end,
            p_site_id: site_id ?? null,
            p_outcome: outcome,
            p_limit: PAGE_SIZE,
            p_offset: offset,
            p_sort: sort,
          });

          if (error) {
            controller.enqueue(
              enc.encode(`\n# Export aborted: ${error.message}\n`),
            );
            break;
          }

          const rows = (data ?? []) as Record<string, unknown>[];
          if (rows.length === 0) break;

          for (const r of rows) {
            const line = HEADERS.map((h) => csvEscape(r[h])).join(",");
            controller.enqueue(enc.encode(line + "\n"));
            rowsExported++;
            if (rowsExported >= HARD_TOTAL_CAP) break;
          }

          // RPC capped at 500 internally — if we got fewer than the page, we're done.
          if (rows.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        // Best-effort audit log (don't fail the export if logging fails)
        try {
          await supabase.from("export_audit").insert({
            user_id: userData.user.id,
            org_id,
            export_type: "visitor_journeys_csv",
            row_count: rowsExported,
            metadata: { start, end, site_id: site_id ?? null, outcome, sort },
          });
        } catch (_logErr) {
          // ignore
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(enc.encode(`\n# Export error: ${msg}\n`));
      } finally {
        controller.close();
      }
    },
  });

  const filename = `visitor-journeys-${start.slice(0, 10)}-to-${end.slice(0, 10)}.csv`;
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
