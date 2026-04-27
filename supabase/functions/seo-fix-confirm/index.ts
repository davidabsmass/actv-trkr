import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate via API key
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) throw new Error("Missing API key");

    const { createHash } = await import("https://deno.land/std@0.168.0/node/crypto.ts");
    const keyHash = createHash("sha256").update(apiKey).digest("hex");

    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!keyRow) throw new Error("Invalid API key");

    const { fix_id, status, note } = await req.json();
    if (!fix_id || !status) throw new Error("Missing fix_id or status");

    // Get the fix to verify org ownership
    const { data: fix } = await supabase
      .from("seo_fix_queue")
      .select("id, org_id, site_id, issue_id, page_url")
      .eq("id", fix_id)
      .eq("org_id", keyRow.org_id)
      .maybeSingle();

    if (!fix) throw new Error("Fix not found");

    // Update fix status
    const updateData: Record<string, unknown> = {
      status, // "applied" | "failed" | "skipped"
      applied_at: status === "applied" ? new Date().toISOString() : null,
    };

    await supabase
      .from("seo_fix_queue")
      .update(updateData)
      .eq("id", fix_id);

    // If applied, record in fix history
    if (status === "applied") {
      // Get current score for before_score
      const { data: latestScan } = await supabase
        .from("seo_scans")
        .select("score")
        .eq("org_id", keyRow.org_id)
        .eq("url", fix.page_url)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase
        .from("seo_fix_history")
        .insert({
          org_id: fix.org_id,
          site_id: fix.site_id,
          issue_id: fix.issue_id,
          page_url: fix.page_url,
          before_score: latestScan?.score || null,
        });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
