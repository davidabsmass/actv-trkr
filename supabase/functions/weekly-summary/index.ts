import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all orgs
    const { data: orgs } = await supabase.from("orgs").select("id, name");
    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ message: "No orgs" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86400000);
    const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
    const weekStartStr = weekStart.toISOString();
    const prevWeekStartStr = prevWeekStart.toISOString();
    const nowStr = now.toISOString();
    const weekStartDate = weekStart.toISOString().split("T")[0];

    const results: string[] = [];

    for (const org of orgs) {
      // Current week metrics
      const [sessThis, leadsThis, sessPrev, leadsPrev] = await Promise.all([
        supabase.from("sessions").select("*", { count: "exact", head: true })
          .eq("org_id", org.id).gte("started_at", weekStartStr).lte("started_at", nowStr),
        supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", org.id).gte("submitted_at", weekStartStr).lte("submitted_at", nowStr),
        supabase.from("sessions").select("*", { count: "exact", head: true })
          .eq("org_id", org.id).gte("started_at", prevWeekStartStr).lt("started_at", weekStartStr),
        supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", org.id).gte("submitted_at", prevWeekStartStr).lt("submitted_at", weekStartStr),
      ]);

      const thisWeekSess = sessThis.count || 0;
      const thisWeekLeads = leadsThis.count || 0;
      const prevWeekSess = sessPrev.count || 0;
      const prevWeekLeads = leadsPrev.count || 0;

      const sessionsChange = prevWeekSess > 0 ? ((thisWeekSess - prevWeekSess) / prevWeekSess) * 100 : 0;
      const leadsChange = prevWeekLeads > 0 ? ((thisWeekLeads - prevWeekLeads) / prevWeekLeads) * 100 : 0;
      const cvr = thisWeekSess > 0 ? (thisWeekLeads / thisWeekSess * 100) : 0;

      // Get first site_id for this org
      const { data: sites } = await supabase.from("sites").select("id").eq("org_id", org.id).limit(1);
      const siteId = sites?.[0]?.id;
      if (!siteId) continue;

      // Generate AI summary
      const prompt = `You are an analytics expert. Generate a concise weekly performance summary for a website.

Data for ${org.name}:
- Sessions this week: ${thisWeekSess} (${sessionsChange >= 0 ? '+' : ''}${sessionsChange.toFixed(1)}% vs last week)
- Leads this week: ${thisWeekLeads} (${leadsChange >= 0 ? '+' : ''}${leadsChange.toFixed(1)}% vs last week)
- Conversion rate: ${cvr.toFixed(2)}%

Use calm, professional language. Avoid dramatic words like "plummeted," "collapsed," "crashed," or "alarming." Use neutral terms like "decreased," "dropped," or "slowed" instead. Frame downturns as opportunities.

Provide:
1. A 2-3 sentence performance summary
2. The top growth opportunity (one sentence)
3. A risk alert if any metric dropped more than 20% (or null if none)

Respond ONLY with valid JSON:
{"summary": "...", "top_opportunity": "...", "risk_alert": "..." or null}`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      let summaryText = `Sessions: ${thisWeekSess} (${sessionsChange.toFixed(1)}% change). Leads: ${thisWeekLeads} (${leadsChange.toFixed(1)}% change). Conversion: ${cvr.toFixed(2)}%.`;
      let topOpportunity: string | null = null;
      let riskAlert: string | null = null;

      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            summaryText = parsed.summary || summaryText;
            topOpportunity = parsed.top_opportunity || null;
            riskAlert = parsed.risk_alert || null;
          }
        } catch {
          // Use fallback summary
        }
      }

      // Upsert into weekly_summaries
      const { error } = await supabase.from("weekly_summaries").upsert(
        {
          org_id: org.id,
          site_id: siteId,
          week_start: weekStartDate,
          sessions_change: sessionsChange,
          leads_change: leadsChange,
          summary_text: summaryText,
          top_opportunity: topOpportunity,
          risk_alert: riskAlert,
        },
        { onConflict: "site_id,week_start" }
      );

      if (error) {
        console.error(`Error saving summary for ${org.name}:`, error);
      } else {
        results.push(`Generated summary for ${org.name}`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weekly-summary error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
