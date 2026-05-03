// Safety-net cron: any org stuck in `pending_connection` for >30 days
// (i.e. signed up + paid setup, but never connected their WordPress site)
// gets archived and their saved Stripe customer is left intact (no
// subscription was ever created, so nothing to cancel).
//
// Schedule via Supabase cron (recommended: daily at 03:00 UTC).
//
// SECURITY: Service-role only.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_DAYS = 30;

const log = (step: string, details?: any) => {
  console.log(`[ARCHIVE-STALE-PENDING-ORGS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("authorization") || "";
    const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!expected || !auth.includes(expected)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: stale, error: queryErr } = await supabase
      .from("orgs")
      .select("id, name, status_changed_at")
      .eq("status", "pending_connection")
      .lt("status_changed_at", cutoff);

    if (queryErr) {
      log("Query error", { error: queryErr.message });
      return new Response(JSON.stringify({ error: queryErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Stale pending orgs found", { count: stale?.length || 0 });

    let archived = 0;
    for (const org of stale || []) {
      const { error: updErr } = await supabase.rpc("set_org_lifecycle_status", {
        p_org_id: org.id,
        p_status: "archived",
        p_reason: "never_connected_after_30_days",
      });
      if (updErr) {
        log("Archive failed", { orgId: org.id, error: updErr.message });
      } else {
        archived++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: stale?.length || 0, archived }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
