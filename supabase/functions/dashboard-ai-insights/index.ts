import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_LIMIT = 10;
const CACHE_HOURS = 4;
const FUNCTION_NAME = "dashboard-ai-insights";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = data.claims.sub as string;

    // Service-role client for ai_usage_log
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve org_id from org_users
    const { data: orgRow } = await adminClient
      .from("org_users")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const orgId = orgRow?.org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { metrics } = await req.json();
    const metricsHash = `${metrics.sessionsThisWeek}-${metrics.leadsThisWeek}-${(metrics.cvrThisWeek ?? 0).toFixed(4)}`;

    // Check cache first (< 4 hours, matching metrics hash)
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedRows } = await adminClient
      .from("ai_usage_log")
      .select("response_cache")
      .eq("org_id", orgId)
      .eq("function_name", FUNCTION_NAME)
      .eq("metrics_hash", metricsHash)
      .eq("cached", false)
      .gte("created_at", cacheThreshold)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cachedRows && cachedRows.length > 0 && cachedRows[0].response_cache) {
      // Log as cached hit
      await adminClient.from("ai_usage_log").insert({
        org_id: orgId, function_name: FUNCTION_NAME, cached: true, metrics_hash: metricsHash,
      });
      return new Response(JSON.stringify(cachedRows[0].response_cache), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await adminClient
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("function_name", FUNCTION_NAME)
      .eq("cached", false)
      .gte("created_at", dayAgo);

    if ((count ?? 0) >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: "Daily AI insight limit reached. Try again tomorrow.", code: "RATE_LIMITED" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a sharp marketing analytics advisor for ACTV TRKR, a website performance tracker. Given the metrics below, write a concise performance summary (2-3 sentences) and exactly 3 actionable suggestions. Each suggestion should be specific, data-driven, and immediately actionable.

Return a JSON object with this exact structure (no markdown, no code fences):
{
  "summary": "Your 2-3 sentence performance overview",
  "suggestions": [
    { "title": "Short title", "description": "One sentence action item", "priority": "high|medium|low" },
    { "title": "Short title", "description": "One sentence action item", "priority": "high|medium|low" },
    { "title": "Short title", "description": "One sentence action item", "priority": "high|medium|low" }
  ]
}

Rules:
- Be specific about numbers, not vague.
- Reference the actual data provided.
- Suggestions should feel like they come from a strategist, not a chatbot.
- If data is sparse (zeros or very low numbers), acknowledge the early stage and focus on setup/launch actions.
- IMPORTANT: Use calm, professional, encouraging language. Never use dramatic or alarming words like "plummeted," "collapsed," "crashed," "nosedived," "alarming," "devastating," or "critical." Instead use neutral phrases like "decreased," "dropped," "declined," "slowed," or "dipped." Frame downturns as opportunities for improvement, not disasters.`;

    const userPrompt = `Here are the current dashboard metrics:

Sessions (this week): ${metrics.sessionsThisWeek}
Sessions (last week): ${metrics.sessionsLastWeek}
Leads (this week): ${metrics.leadsThisWeek}
Leads (last week): ${metrics.leadsLastWeek}
Conversion Rate (this week): ${(metrics.cvrThisWeek * 100).toFixed(2)}%
Conversion Rate (last week): ${(metrics.cvrLastWeek * 100).toFixed(2)}%
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
                description:
                  "Return a performance summary and 3 actionable suggestions.",
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
                          priority: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                          },
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
          tool_choice: {
            type: "function",
            function: { name: "provide_insights" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
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

    // Log usage + cache the response
    await adminClient.from("ai_usage_log").insert({
      org_id: orgId,
      function_name: FUNCTION_NAME,
      cached: false,
      response_cache: insights,
      metrics_hash: metricsHash,
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
