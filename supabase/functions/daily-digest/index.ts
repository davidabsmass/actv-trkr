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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: orgs } = await supabase.from("orgs").select("id, name");
    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ message: "No orgs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const dayBefore = new Date(now.getTime() - 2 * 86400000).toISOString().split("T")[0];

    const results: string[] = [];

    for (const org of orgs) {
      // Get today's and yesterday's metrics
      const [sessToday, sessPrev, leadsToday, leadsPrev] = await Promise.all([
        supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "sessions_total").eq("date", yesterdayStr).is("dimension", null),
        supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "sessions_total").eq("date", dayBefore).is("dimension", null),
        supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "leads_total").eq("date", yesterdayStr).is("dimension", null),
        supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "leads_total").eq("date", dayBefore).is("dimension", null),
      ]);

      const todaySess = (sessToday.data?.[0]?.value as number) || 0;
      const prevSess = (sessPrev.data?.[0]?.value as number) || 0;
      const todayLeads = (leadsToday.data?.[0]?.value as number) || 0;
      const prevLeads = (leadsPrev.data?.[0]?.value as number) || 0;

      const sessChange = prevSess > 0 ? ((todaySess - prevSess) / prevSess * 100) : 0;
      const leadsChange = prevLeads > 0 ? ((todayLeads - prevLeads) / prevLeads * 100) : 0;

      // Get top pages for the day
      const { data: topPagesData } = await supabase
        .from("kpi_daily")
        .select("dimension, value")
        .eq("org_id", org.id)
        .eq("metric", "page_views")
        .eq("date", yesterdayStr)
        .not("dimension", "is", null)
        .order("value", { ascending: false })
        .limit(5);

      const topPagesHtml = (topPagesData || []).map(p =>
        `<tr><td style="padding: 6px 12px; color: #e2e8f0; font-size: 13px; border-bottom: 1px solid #334155;">${p.dimension}</td><td style="padding: 6px 12px; color: #ffffff; font-size: 13px; text-align: right; border-bottom: 1px solid #334155;">${p.value}</td></tr>`
      ).join("");

      // Get recent leads
      const { data: recentLeads } = await supabase
        .from("leads")
        .select("submitted_at, page_path, source")
        .eq("org_id", org.id)
        .gte("submitted_at", yesterday.toISOString())
        .order("submitted_at", { ascending: false })
        .limit(5);

      const leadsHtml = (recentLeads || []).map(l =>
        `<tr><td style="padding: 6px 12px; color: #e2e8f0; font-size: 13px; border-bottom: 1px solid #334155;">${l.page_path || "—"}</td><td style="padding: 6px 12px; color: #94a3b8; font-size: 13px; text-align: right; border-bottom: 1px solid #334155;">${l.source || "direct"}</td></tr>`
      ).join("");

      const dateLabel = yesterday.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a1628; color: #e2e8f0; padding: 32px; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #ffffff; font-size: 20px; margin: 0;">📋 Daily Digest</h1>
            <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">${org.name} — ${dateLabel}</p>
          </div>
          <div style="display: flex; gap: 12px; margin-bottom: 20px;">
            <div style="flex: 1; background: #1e293b; border-radius: 8px; padding: 16px; text-align: center;">
              <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0;">Sessions</p>
              <p style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 4px 0;">${todaySess}</p>
              <p style="color: ${sessChange >= 0 ? '#4ade80' : '#f87171'}; font-size: 12px; margin: 0;">${sessChange >= 0 ? '↑' : '↓'} ${Math.abs(sessChange).toFixed(0)}% vs prev day</p>
            </div>
            <div style="flex: 1; background: #1e293b; border-radius: 8px; padding: 16px; text-align: center;">
              <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0;">Leads</p>
              <p style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 4px 0;">${todayLeads}</p>
              <p style="color: ${leadsChange >= 0 ? '#4ade80' : '#f87171'}; font-size: 12px; margin: 0;">${leadsChange >= 0 ? '↑' : '↓'} ${Math.abs(leadsChange).toFixed(0)}% vs prev day</p>
            </div>
          </div>
          ${topPagesHtml ? `<div style="background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0 0 8px;">Top Pages</p>
            <table style="width: 100%; border-collapse: collapse;">
              <thead><tr><th style="text-align: left; padding: 4px 12px; color: #64748b; font-size: 11px;">Page</th><th style="text-align: right; padding: 4px 12px; color: #64748b; font-size: 11px;">Views</th></tr></thead>
              <tbody>${topPagesHtml}</tbody>
            </table>
          </div>` : ''}
          ${leadsHtml ? `<div style="background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0 0 8px;">Recent Leads</p>
            <table style="width: 100%; border-collapse: collapse;">
              <thead><tr><th style="text-align: left; padding: 4px 12px; color: #64748b; font-size: 11px;">Page</th><th style="text-align: right; padding: 4px 12px; color: #64748b; font-size: 11px;">Source</th></tr></thead>
              <tbody>${leadsHtml}</tbody>
            </table>
          </div>` : ''}
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://actvtrkr.com/dashboard" style="display: inline-block; background: #6C5CE7; color: #ffffff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">View Dashboard</a>
          </div>
          <p style="color: #64748b; font-size: 11px; text-align: center; margin-top: 24px;">Sent by ACTV TRKR · Manage preferences in Settings</p>
        </div>`;

      try {
        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
            "x-cron-secret": cronSecret,
          },
          body: JSON.stringify({
            type: "daily_digest",
            org_id: org.id,
            subject: `📋 Daily Digest — ${org.name} (${dateLabel})`,
            html_body: emailHtml,
            text_body: `Daily Digest for ${org.name}\n${dateLabel}\n\nSessions: ${todaySess} (${sessChange.toFixed(0)}% vs prev day)\nLeads: ${todayLeads} (${leadsChange.toFixed(0)}% vs prev day)\n\nView dashboard: https://actvtrkr.com/dashboard`,
          }),
        });
        results.push(`Sent daily digest for ${org.name}`);
      } catch (e) {
        console.error(`Failed to send daily digest for ${org.name}:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("daily-digest error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
