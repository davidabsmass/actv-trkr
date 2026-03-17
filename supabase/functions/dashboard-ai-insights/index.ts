import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { metrics } = await req.json();

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
      // Fallback: try parsing content directly
      const content = aiData.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      insights = JSON.parse(cleaned);
    }

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
