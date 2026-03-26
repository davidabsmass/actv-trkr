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
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = user.id;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve org_id
    const { data: orgRow } = await adminClient
      .from("org_users")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const orgId = orgRow?.org_id;

    // Rate limit check (only if org found)
    if (orgId) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await adminClient
        .from("ai_usage_log")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("function_name", "seo-suggest-fix")
        .eq("cached", false)
        .gte("created_at", dayAgo);

      if ((count ?? 0) >= 5) {
        return new Response(
          JSON.stringify({ error: "Daily SEO suggestion limit reached. Try again tomorrow.", code: "RATE_LIMITED" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { page_url, fix_type } = await req.json();

    if (!page_url || !fix_type) {
      throw new Error("Missing page_url or fix_type");
    }

    // Canonical doesn't need AI
    if (fix_type === "add_canonical") {
      return new Response(
        JSON.stringify({ suggested_value: page_url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch page HTML for context
    let pageTitle = "";
    let h1Text = "";
    let firstParagraph = "";
    let currentMetaDesc = "";

    try {
      const pageResp = await fetch(page_url, {
        headers: { "User-Agent": "ACTV-TRKR-SEO/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await pageResp.text();

      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
      pageTitle = titleMatch?.[1]?.trim() || "";

      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
      h1Text = h1Match?.[1]?.replace(/<[^>]+>/g, "").trim() || "";

      const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/is);
      currentMetaDesc = metaDescMatch?.[1]?.trim() || "";

      const pMatch = html.match(/<p[^>]*>(.{30,}?)<\/p>/is);
      firstParagraph = pMatch?.[1]?.replace(/<[^>]+>/g, "").trim().substring(0, 300) || "";
    } catch {
      // Fallback if page fetch fails
      const pathname = new URL(page_url).pathname.replace(/[/-]/g, " ").trim();
      pageTitle = pathname;
      h1Text = pathname;
    }

    // Build AI prompt based on fix type
    let prompt = "";
    const context = `Page URL: ${page_url}\nCurrent Title: ${pageTitle}\nH1: ${h1Text}\nCurrent Meta Description: ${currentMetaDesc}\nFirst Paragraph: ${firstParagraph}`;

    if (fix_type === "set_title") {
      prompt = `You are an SEO expert. Given the following page context, write ONE optimized page title tag.

Rules:
- Must be under 60 characters
- Include the primary keyword naturally
- Be compelling and click-worthy
- Do NOT include quotes around the title

${context}

Return ONLY the title text, nothing else.`;
    } else if (fix_type === "set_meta_desc") {
      prompt = `You are an SEO expert. Given the following page context, write ONE optimized meta description.

Rules:
- Must be between 120-155 characters
- Include a clear call-to-action or value proposition
- Include the primary keyword naturally
- Be compelling and encourage clicks
- Do NOT include quotes around the description

${context}

Return ONLY the meta description text, nothing else.`;
    } else if (fix_type === "add_og_tags") {
      prompt = `You are an SEO expert. Given the following page context, generate Open Graph tag values.

${context}

Return a JSON object with exactly these keys:
{"title": "...", "description": "..."}

The title should be under 60 characters and the description under 155 characters. Return ONLY the JSON, nothing else.`;
    } else {
      throw new Error(`Unsupported fix_type: ${fix_type}`);
    }

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);

      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI generation failed");
    }

    const aiData = await aiResp.json();
    let suggested = aiData.choices?.[0]?.message?.content?.trim() || "";

    // Clean up any quotes the model might add
    suggested = suggested.replace(/^["']|["']$/g, "");

    // For OG tags, validate JSON
    if (fix_type === "add_og_tags") {
      try {
        const parsed = JSON.parse(suggested);
        suggested = JSON.stringify({ title: parsed.title || pageTitle, description: parsed.description || "", url: page_url });
      } catch {
        suggested = JSON.stringify({ title: pageTitle, description: currentMetaDesc || firstParagraph.substring(0, 155), url: page_url });
      }
    }

    // Log AI usage
    if (orgId) {
      await adminClient.from("ai_usage_log").insert({
        org_id: orgId, function_name: "seo-suggest-fix", cached: false,
      });
    }

    return new Response(
      JSON.stringify({ suggested_value: suggested }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("seo-suggest-fix error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
