import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronRequest = !!cronSecret && incomingSecret === cronSecret;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    if (!publishableKey) {
      throw new Error("Missing publishable key");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let body: Record<string, unknown> = {};
    if (req.method !== "GET") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    let requestedOrgId = typeof body.org_id === "string" ? body.org_id : null;

    if (!isCronRequest) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userClient = createClient(supabaseUrl, publishableKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!requestedOrgId) {
        const { data: membership } = await supabase
          .from("org_users")
          .select("org_id")
          .eq("user_id", authData.user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        requestedOrgId = membership?.org_id ?? null;
      }

      if (!requestedOrgId) {
        return new Response(JSON.stringify({ error: "No organization found for user" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: canAccess } = await supabase
        .from("org_users")
        .select("id")
        .eq("user_id", authData.user.id)
        .eq("org_id", requestedOrgId)
        .maybeSingle();

      if (!canAccess) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const orgsQuery = supabase.from("orgs").select("id, name");
    const { data: orgs, error: orgsError } = isCronRequest
      ? await orgsQuery
      : await orgsQuery.eq("id", requestedOrgId!).limit(1);

    if (orgsError) throw orgsError;

    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ message: "No orgs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      const [sessThis, leadsThis, sessPrev, leadsPrev] = await Promise.all([
        supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", org.id)
          .gte("started_at", weekStartStr)
          .lte("started_at", nowStr),
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", org.id)
          .neq("status", "trashed")
          .gte("submitted_at", weekStartStr)
          .lte("submitted_at", nowStr),
        supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", org.id)
          .gte("started_at", prevWeekStartStr)
          .lt("started_at", weekStartStr),
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", org.id)
          .neq("status", "trashed")
          .gte("submitted_at", prevWeekStartStr)
          .lt("submitted_at", weekStartStr),
      ]);

      const thisWeekSess = sessThis.count || 0;
      const thisWeekLeads = leadsThis.count || 0;
      const prevWeekSess = sessPrev.count || 0;
      const prevWeekLeads = leadsPrev.count || 0;

      const sessionsChange = prevWeekSess > 0 ? ((thisWeekSess - prevWeekSess) / prevWeekSess) * 100 : 0;
      const leadsChange = prevWeekLeads > 0 ? ((thisWeekLeads - prevWeekLeads) / prevWeekLeads) * 100 : 0;
      const cvr = thisWeekSess > 0 ? (thisWeekLeads / thisWeekSess) * 100 : 0;
      const prevCvr = prevWeekSess > 0 ? (prevWeekLeads / prevWeekSess) * 100 : 0;
      const cvrChange = prevCvr > 0 ? ((cvr - prevCvr) / prevCvr) * 100 : 0;

      const { data: site } = await supabase
        .from("sites")
        .select("id")
        .eq("org_id", org.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const siteId = site?.id;
      if (!siteId) {
        results.push(`Skipped ${org.name}: no site configured`);
        continue;
      }

      const prompt = `You are an analytics expert. Generate a concise weekly performance summary for a website.

Data for ${org.name}:
- Sessions this week: ${thisWeekSess} (${sessionsChange >= 0 ? "+" : ""}${sessionsChange.toFixed(1)}% vs last week)
- Leads this week: ${thisWeekLeads} (${leadsChange >= 0 ? "+" : ""}${leadsChange.toFixed(1)}% vs last week)
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
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            summaryText = parsed.summary || summaryText;
            topOpportunity = parsed.top_opportunity || null;
            riskAlert = parsed.risk_alert || null;
          }
        } catch {
          // fallback text already set
        }
      }

      const { error } = await supabase.from("weekly_summaries").upsert(
        {
          org_id: org.id,
          site_id: siteId,
          week_start: weekStartDate,
          sessions_change: sessionsChange,
          leads_change: leadsChange,
          conversion_anomalies: {
            sessions_current: thisWeekSess,
            sessions_previous: prevWeekSess,
            sessions_change: Number(sessionsChange.toFixed(1)),
            leads_current: thisWeekLeads,
            leads_previous: prevWeekLeads,
            leads_change: Number(leadsChange.toFixed(1)),
            cvr_current: Number(cvr.toFixed(2)),
            cvr_previous: Number(prevCvr.toFixed(2)),
            cvr_change: Number(cvrChange.toFixed(1)),
          },
          summary_text: summaryText,
          top_opportunity: topOpportunity,
          risk_alert: riskAlert,
        },
        { onConflict: "site_id,week_start" },
      );

      if (error) {
        console.error(`Error saving summary for ${org.name}:`, error);
        results.push(`Failed ${org.name}: ${error.message}`);
        continue;
      }

      results.push(`Generated summary for ${org.name}`);

      if (isCronRequest) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a1628; color: #e2e8f0; padding: 32px; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #ffffff; font-size: 20px; margin: 0;">📊 Weekly Performance Summary</h1>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">${org.name} — Week of ${weekStartDate}</p>
            </div>
            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
              <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0;">${summaryText}</p>
            </div>
            <div style="display: flex; gap: 12px; margin-bottom: 16px;">
              <div style="flex: 1; background: #1e293b; border-radius: 8px; padding: 16px; text-align: center;">
                <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0;">Sessions</p>
                <p style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 4px 0;">${thisWeekSess}</p>
                <p style="color: ${sessionsChange >= 0 ? "#4ade80" : "#f87171"}; font-size: 12px; margin: 0;">${sessionsChange >= 0 ? "↑" : "↓"} ${Math.abs(sessionsChange).toFixed(1)}%</p>
              </div>
              <div style="flex: 1; background: #1e293b; border-radius: 8px; padding: 16px; text-align: center;">
                <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0;">Leads</p>
                <p style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 4px 0;">${thisWeekLeads}</p>
                <p style="color: ${leadsChange >= 0 ? "#4ade80" : "#f87171"}; font-size: 12px; margin: 0;">${leadsChange >= 0 ? "↑" : "↓"} ${Math.abs(leadsChange).toFixed(1)}%</p>
              </div>
              <div style="flex: 1; background: #1e293b; border-radius: 8px; padding: 16px; text-align: center;">
                <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0;">CVR</p>
                <p style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 4px 0;">${cvr.toFixed(1)}%</p>
              </div>
            </div>
            ${topOpportunity ? `<div style="background: #1e3a5f; border-left: 3px solid #6C5CE7; border-radius: 8px; padding: 16px; margin-bottom: 12px;"><p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0 0 4px;">💡 Top Opportunity</p><p style="color: #e2e8f0; font-size: 13px; margin: 0;">${topOpportunity}</p></div>` : ""}
            ${riskAlert ? `<div style="background: #3b1c1c; border-left: 3px solid #f87171; border-radius: 8px; padding: 16px; margin-bottom: 12px;"><p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin: 0 0 4px;">⚠️ Risk Alert</p><p style="color: #fca5a5; font-size: 13px; margin: 0;">${riskAlert}</p></div>` : ""}
            <div style="text-align: center; margin-top: 24px;">
              <a href="https://actvtrkr.com/dashboard" style="display: inline-block; background: #6C5CE7; color: #ffffff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">View Dashboard</a>
            </div>
            <p style="color: #64748b; font-size: 11px; text-align: center; margin-top: 24px;">Sent by ACTV TRKR · You can manage notification preferences in Settings</p>
          </div>`;

        try {
          await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publishableKey}`,
              "x-cron-secret": cronSecret,
            },
            body: JSON.stringify({
              type: "weekly_summary",
              org_id: org.id,
              subject: `📊 Weekly Summary — ${org.name} (${weekStartDate})`,
              html_body: emailHtml,
              text_body: `Weekly Summary for ${org.name}\n\nSessions: ${thisWeekSess} (${sessionsChange.toFixed(1)}% change)\nLeads: ${thisWeekLeads} (${leadsChange.toFixed(1)}% change)\nCVR: ${cvr.toFixed(1)}%\n\n${summaryText}\n\n${topOpportunity ? "Top Opportunity: " + topOpportunity + "\n" : ""}${riskAlert ? "Risk Alert: " + riskAlert + "\n" : ""}\nView dashboard: https://actvtrkr.com/dashboard`,
            }),
          });
        } catch (emailErr) {
          console.error(`Failed to send weekly email for ${org.name}:`, emailErr);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results, generated: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weekly-summary error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
