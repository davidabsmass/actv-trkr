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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !authData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve org
    const { data: orgRow } = await adminClient
      .from("org_users")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const orgId = orgRow?.org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, language } = await req.json();

    // Gather live metrics for context
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const dayStart = weekAgo.toISOString();
    const dayEnd = now.toISOString();
    const prevStart = twoWeeksAgo.toISOString();
    const prevEnd = weekAgo.toISOString();

    const [sessThis, sessPrev, leadsThis, leadsPrev, formsRes, sitesRes] =
      await Promise.all([
        adminClient
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd),
        adminClient
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("started_at", prevStart)
          .lte("started_at", prevEnd),
        adminClient
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd),
        adminClient
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", prevStart)
          .lte("submitted_at", prevEnd),
        adminClient
          .from("forms")
          .select("id, name", { count: "exact", head: false })
          .eq("org_id", orgId)
          .eq("archived", false)
          .limit(20),
        adminClient
          .from("sites")
          .select("id, domain")
          .eq("org_id", orgId)
          .limit(10),
      ]);

    const sessionsThisWeek = sessThis.count || 0;
    const sessionsLastWeek = sessPrev.count || 0;
    const leadsThisWeek = leadsThis.count || 0;
    const leadsLastWeek = leadsPrev.count || 0;
    const cvrThisWeek = sessionsThisWeek > 0 ? leadsThisWeek / sessionsThisWeek : 0;
    const cvrLastWeek = sessionsLastWeek > 0 ? leadsLastWeek / sessionsLastWeek : 0;

    const formNames = (formsRes.data || []).map((f: any) => f.name).join(", ");
    const siteDomains = (sitesRes.data || []).map((s: any) => s.domain).join(", ");

    const metricsContext = `
LIVE DASHBOARD METRICS (last 7 days vs previous 7 days):
- Sessions this week: ${sessionsThisWeek} | Last week: ${sessionsLastWeek}
- Leads this week: ${leadsThisWeek} | Last week: ${leadsLastWeek}
- Conversion rate this week: ${(cvrThisWeek * 100).toFixed(2)}% | Last week: ${(cvrLastWeek * 100).toFixed(2)}%
- Active forms: ${formNames || "None"}
- Tracked sites: ${siteDomains || "None"}
- Total forms count: ${formsRes.count || 0}
`;

    const systemPrompt = `You are the ACTV TRKR AI assistant — a friendly, knowledgeable analytics advisor embedded in a website performance tracking dashboard. You help users understand their website metrics, traffic, leads, conversion rates, forms, and SEO data.

${metricsContext}

Rules:
- Be conversational, helpful, and concise (2-4 sentences per answer unless the user asks for detail).
- Reference the actual live metrics above when answering questions about performance.
- If the user asks about data you don't have, politely say you can only see the summary metrics shown above.
- Use calm, encouraging, professional language. Never alarming words.
- You MUST respond in the language specified: ${language || "en"}. Match the user's language naturally.
- When asked "how am I doing", give a quick health check based on the numbers.
- Suggest actionable improvements when relevant.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chatbot error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
