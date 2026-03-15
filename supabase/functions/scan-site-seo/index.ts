import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SeoIssue {
  id: string;
  title: string;
  fix: string;
  impact: "Critical" | "High" | "Medium" | "Low";
  category: "SEO" | "Performance" | "Content" | "Technical";
  count?: number;
}

function detectPlatform(html: string): string | null {
  const h = html.toLowerCase();
  if (h.includes("wp-content") || h.includes("wp-includes") || h.includes("wp-json")) return "wordpress";
  if (h.includes("cdn.shopify.com") || h.includes("shopify-section")) return "shopify";
  if (h.includes("wix.com") || h.includes("wixstatic.com")) return "wix";
  if (h.includes("squarespace.com") || h.includes("squarespace-cdn")) return "squarespace";
  if (h.includes("webflow.com") || h.includes("wf-section")) return "webflow";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, site_id, org_id } = await req.json();
    if (!url || !site_id || !org_id) {
      return new Response(JSON.stringify({ error: "url, site_id, org_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: "Only HTTP/HTTPS allowed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block private IPs
    const hostname = parsedUrl.hostname.toLowerCase();
    const privatePatterns = [/^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^169\.254\./, /^localhost$/i];
    if (privatePatterns.some(p => p.test(hostname))) {
      return new Response(JSON.stringify({ error: "Cannot scan private addresses" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Scanning: ${url} for org ${org_id}`);

    // Fetch HTML
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ];

    let html = "";
    for (let i = 0; i < userAgents.length; i++) {
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 2000));
        const resp = await fetch(url, {
          redirect: "follow",
          headers: {
            "User-Agent": userAgents[i],
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
          html = await resp.text();
          if (html.length > 500) break;
        }
      } catch (e) {
        console.log(`Attempt ${i + 1} failed:`, e);
      }
    }

    if (!html) {
      return new Response(JSON.stringify({ error: "Could not fetch website. It may block automated scanners." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-checks
    const platform = detectPlatform(html);
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headContent = headMatch ? headMatch[0] : "";

    const h1Count = (html.match(/<h1(\s[^>]*)?>/gi) || []).length;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleContent = titleMatch ? titleMatch[1].trim() : null;
    const titleLength = titleContent ? titleContent.length : 0;

    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const metaDescContent = metaDescMatch ? metaDescMatch[1].trim() : null;
    const metaDescLength = metaDescContent ? metaDescContent.length : 0;

    const hasCanonical = !!html.match(/<link[^>]+rel=["']canonical["']/i);
    const hasOgTitle = !!html.match(/<meta[^>]+property=["']og:title["']/i);
    const hasOgDesc = !!html.match(/<meta[^>]+property=["']og:description["']/i);
    const hasOgImage = !!html.match(/<meta[^>]+property=["']og:image["']/i);
    const isHttps = parsedUrl.protocol === "https:";

    const headScripts = (headContent.match(/<script[^>]*>/gi) || []);
    const blockingScripts = headScripts.filter(t => /src=/i.test(t) && !/async/i.test(t) && !/defer/i.test(t));
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsNoLazy = imgTags.filter(t => !/loading=/i.test(t)).length;

    // Build deterministic issues
    let titleStatus = "missing";
    if (titleContent) titleStatus = titleLength < 30 ? "too-short" : titleLength > 60 ? "too-long" : "good";

    const bodyContent = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, "").trim();
    const isSPA = bodyContent.length < 500 && /<div[^>]+id=["'](root|app|__next)["']/i.test(html);

    // Build prompt
    const analyzableHtml = headContent + "\n" + html.slice(0, 20000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: `You are an SEO audit system. Analyze this page and report issues.

DETECTION CRITERIA:
Title: ${titleStatus === "missing" ? "MISSING" : titleStatus === "too-short" ? `TOO SHORT (${titleLength} chars)` : titleStatus === "too-long" ? `TOO LONG (${titleLength} chars)` : `GOOD (${titleLength} chars)`}
Meta Desc: ${!metaDescContent ? "MISSING" : metaDescLength < 120 ? `TOO SHORT (${metaDescLength})` : metaDescLength > 160 ? `TOO LONG (${metaDescLength})` : `GOOD (${metaDescLength})`}
H1: ${isSPA && h1Count === 0 ? "CANNOT VERIFY (SPA)" : h1Count === 0 ? "MISSING" : h1Count === 1 ? "GOOD" : `${h1Count} FOUND`}
Canonical: ${hasCanonical ? "GOOD" : "MISSING"}
OG Tags: title=${hasOgTitle}, desc=${hasOgDesc}, image=${hasOgImage}
HTTPS: ${isHttps ? "YES" : "NO"}
Blocking Scripts: ${blockingScripts.length}
Images without lazy loading: ${imgsNoLazy}

Write simple, beginner-friendly fixes. ${platform ? `Platform: ${platform.toUpperCase()}. Give platform-specific steps.` : "Give general fix steps."}
Start each fix with "One way to fix this:"

URL: ${url}
HTML: ${analyzableHtml}`,
        }],
        tools: [{
          type: "function",
          function: {
            name: "report_seo_issues",
            description: "Report SEO issues",
            parameters: {
              type: "object",
              properties: {
                issues: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      fix: { type: "string" },
                      impact: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
                      category: { type: "string", enum: ["SEO", "Performance", "Content", "Technical"] },
                      count: { type: "number" },
                    },
                    required: ["id", "title", "fix", "impact", "category", "count"],
                  },
                },
              },
              required: ["issues"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_seo_issues" } },
      }),
    });

    if (!aiResponse.ok) {
      const s = aiResponse.status;
      if (s === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (s === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${s}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No AI response");

    const { issues } = JSON.parse(toolCall.function.arguments) as { issues: SeoIssue[] };

    // Enrich with server-side counts
    const enriched = issues.map((i: SeoIssue) => {
      if (["h1-multiple", "multiple-h1"].includes(i.id)) return { ...i, count: h1Count };
      if (["render-blocking-scripts"].includes(i.id)) return { ...i, count: blockingScripts.length };
      return i;
    });

    // Calculate score
    const BASE_WEIGHTS: Record<string, number> = { Critical: 15, High: 8, Medium: 4, Low: 2 };
    const score = Math.max(0, Math.round(100 - Math.min(
      enriched.reduce((s: number, i: SeoIssue) => s + (BASE_WEIGHTS[i.impact] || 4) * Math.min(i.count && i.count > 1 ? 1.3 : 1.0, 3.0), 0),
      100
    )));

    // Store scan result
    await adminClient.from("seo_scans").insert({
      org_id, site_id, url, score,
      issues_json: enriched,
      recommendations_json: [],
      platform,
    });

    return new Response(JSON.stringify({ score, issues: enriched, platform, url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scan-site-seo error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
