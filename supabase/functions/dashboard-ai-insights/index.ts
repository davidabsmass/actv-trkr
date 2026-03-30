import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_LIMIT = 15;
const CACHE_HOURS = 4;
const FUNCTION_NAME = "dashboard-ai-insights";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("Auth failed:", userErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { metrics, orgId: bodyOrgId } = await req.json();

    // Resolve and validate org membership
    let orgId = bodyOrgId;
    if (orgId) {
      const { data: membership } = await adminClient
        .from("org_users").select("org_id").eq("user_id", userId).eq("org_id", orgId).maybeSingle();
      if (!membership) orgId = null;
    }
    if (!orgId) {
      const { data: orgRow } = await adminClient
        .from("org_users").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
      orgId = orgRow?.org_id;
    }
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const metricsHash = `${metrics.sessionsThisWeek}-${metrics.leadsThisWeek}-${(metrics.cvrThisWeek ?? 0).toFixed(4)}`;

    // Check cache
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedRows } = await adminClient
      .from("ai_usage_log")
      .select("response_cache")
      .eq("org_id", orgId).eq("function_name", FUNCTION_NAME).eq("metrics_hash", metricsHash).eq("cached", false)
      .gte("created_at", cacheThreshold).order("created_at", { ascending: false }).limit(1);

    if (cachedRows && cachedRows.length > 0 && cachedRows[0].response_cache) {
      await adminClient.from("ai_usage_log").insert({
        org_id: orgId, function_name: FUNCTION_NAME, cached: true, metrics_hash: metricsHash,
      });
      return new Response(JSON.stringify(cachedRows[0].response_cache), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await adminClient
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId).eq("function_name", FUNCTION_NAME).eq("cached", false).gte("created_at", dayAgo);

    if ((count ?? 0) >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: "Daily AI insight limit reached. Try again tomorrow.", code: "RATE_LIMITED", rate_limited: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch enriched context: org name, site domains, top pages, top sources
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const [orgData, sitesData, topPagesData, topSourcesData, ctaClicksData] = await Promise.all([
      adminClient.from("orgs").select("name").eq("id", orgId).single(),
      adminClient.from("sites").select("domain").eq("org_id", orgId).limit(10),
      adminClient.from("pageviews").select("page_path").eq("org_id", orgId).gte("occurred_at", thirtyDaysAgo).limit(500),
      adminClient.from("sessions").select("utm_source, landing_referrer_domain").eq("org_id", orgId).gte("started_at", thirtyDaysAgo).limit(500),
      adminClient.from("events").select("target_text, page_path, meta").eq("org_id", orgId).eq("event_type", "cta_click").gte("occurred_at", thirtyDaysAgo).limit(500),
    ]);

    const orgName = orgData.data?.name || "Unknown";
    const siteDomains = (sitesData.data || []).map((s: any) => s.domain).join(", ");

    const pageCounts: Record<string, number> = {};
    (topPagesData.data || []).forEach((p: any) => {
      const path = p.page_path || "/";
      pageCounts[path] = (pageCounts[path] || 0) + 1;
    });
    const topPagesStr = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([path, cnt]) => `${path} (${cnt} views)`).join(", ");

    const sourceCounts: Record<string, number> = {};
    (topSourcesData.data || []).forEach((s: any) => {
      const src = s.utm_source || s.landing_referrer_domain || "direct";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });
    const topSourcesStr = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([src, cnt]) => `${src} (${cnt} sessions)`).join(", ");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a sharp marketing analytics advisor for ACTV TRKR, a website performance tracker. Given the metrics below, write a concise performance summary (2-3 sentences) and exactly 3 actionable suggestions. Each suggestion should be specific, data-driven, and immediately actionable.

CLIENT: ${orgName}
SITES: ${siteDomains || "None"}
TOP PAGES (30d): ${topPagesStr || "No data"}
TOP SOURCES (30d): ${topSourcesStr || "No data"}

Return a JSON object with this exact structure (no markdown, no code fences):
{
  "summary": "Your 2-3 sentence performance overview mentioning the client by name",
  "suggestions": [
    { "title": "Short title", "description": "One sentence action item referencing specific pages or sources", "priority": "high|medium|low" },
    { "title": "Short title", "description": "One sentence action item", "priority": "high|medium|low" },
    { "title": "Short title", "description": "One sentence action item", "priority": "high|medium|low" }
  ]
}

Rules:
- Be specific about numbers, not vague. Reference the client name, specific pages, and sources.
- Suggestions should feel like they come from a strategist, not a chatbot.
- If data is sparse, acknowledge the early stage and focus on setup/launch actions.
- IMPORTANT: Use calm, professional, encouraging language. Never use dramatic or alarming words.`;

    const userPrompt = `Here are the current dashboard metrics for ${orgName}:

Sessions (this period): ${metrics.sessionsThisWeek}
Sessions (previous period): ${metrics.sessionsLastWeek}
Leads (this period): ${metrics.leadsThisWeek}
Leads (previous period): ${metrics.leadsLastWeek}
Conversion Rate (this period): ${(metrics.cvrThisWeek * 100).toFixed(2)}%
Conversion Rate (previous period): ${(metrics.cvrLastWeek * 100).toFixed(2)}%
Top Page: ${metrics.topPage || "N/A"}
Top Source: ${metrics.topSource || "N/A"}
Total Forms: ${metrics.totalForms || 0}
Primary Focus: ${metrics.primaryFocus || "lead_volume"}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "provide_insights",
                description: "Return a performance summary and 3 actionable suggestions.",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          description: { type: "string" },
                          priority: { type: "string", enum: ["high", "medium", "low"] },
                        },
                        required: ["title", "description", "priority"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["summary", "suggestions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "provide_insights" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is temporarily rate limited.", code: "RATE_LIMITED", rate_limited: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let insights;

    if (toolCall?.function?.arguments) {
      insights = JSON.parse(toolCall.function.arguments);
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      insights = JSON.parse(cleaned);
    }

    await adminClient.from("ai_usage_log").insert({
      org_id: orgId, function_name: FUNCTION_NAME, cached: false, response_cache: insights, metrics_hash: metricsHash,
    });

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dashboard-ai-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
