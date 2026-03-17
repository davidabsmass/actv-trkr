import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { findings, report_type } = await req.json();
    // report_type: "overview" | "weekly" | "monthly"

    if (!findings || !Array.isArray(findings) || findings.length === 0) {
      return new Response(
        JSON.stringify({ summary: "Not enough data to generate a summary yet.", insights: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a business-friendly website reporting assistant for ACTV TRKR. 
You transform structured data findings into clear, plain-English summaries.

RULES:
- Be specific and reference actual numbers from the findings
- Never use technical jargon
- Keep sentences short and scannable
- Don't invent explanations not supported by the data
- Don't be robotic or overhyped
- Be helpful and confident

BAD: "Your visitors are confused by the pricing layout and emotionally disengaging."
GOOD: "Visitors are leaving the pricing page at a higher rate than other key pages this week."`;

    const userPrompt = report_type === "monthly"
      ? `Write a 3-4 sentence executive summary paragraph for a monthly website performance report based on these findings. Also provide 3 recommended focus items for next month.

Findings:
${JSON.stringify(findings, null, 2)}`
      : report_type === "weekly"
      ? `Write a 2-3 sentence weekly summary paragraph based on these findings. Mention what improved, what declined, and what deserves attention.

Findings:
${JSON.stringify(findings, null, 2)}`
      : `For each finding below, write ONE short plain-English sentence (max 15 words) that a business owner would understand. Return as a JSON array of objects with "type" and "summary" fields.

Findings:
${JSON.stringify(findings, null, 2)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_summary",
              description: "Return the generated summary",
              parameters: {
                type: "object",
                properties: {
                  summary_paragraph: { type: "string", description: "The main summary paragraph" },
                  focus_items: {
                    type: "array",
                    items: { type: "string" },
                    description: "Recommended focus items (for monthly reports)",
                  },
                  card_summaries: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        summary: { type: "string" },
                      },
                      required: ["type", "summary"],
                    },
                    description: "Per-finding one-line summaries (for overview)",
                  },
                },
                required: ["summary_paragraph"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_summary" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("reports-ai-copy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
