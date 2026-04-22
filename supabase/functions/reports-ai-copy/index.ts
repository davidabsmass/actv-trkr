import { appCorsHeaders } from '../_shared/cors.ts'
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

const DAILY_LIMIT = 15;
const FUNCTION_NAME = "reports-ai-copy";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const userId = data.claims.sub as string;

    // Rate limit check
    const rl = await checkUserRateLimit(userId, "reports-ai-copy");
    if (!rl.allowed) return rateLimitResponse(appCorsHeaders(req), rl.retryAfterMs);

    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve org_id
    const { data: orgRow } = await adminClient
      .from("org_users")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const orgId = orgRow?.org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
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
        JSON.stringify({ error: "Daily AI report summary limit reached. Try again tomorrow.", code: "RATE_LIMITED" }),
        { status: 429, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { findings, report_type } = await req.json();

    if (!findings || !Array.isArray(findings) || findings.length === 0) {
      return new Response(
        JSON.stringify({ summary: "Not enough data to generate a summary yet.", insights: [] }),
        { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
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
          status: 429, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
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

    // Log usage
    await adminClient.from("ai_usage_log").insert({
      org_id: orgId, function_name: FUNCTION_NAME, cached: false,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("reports-ai-copy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
