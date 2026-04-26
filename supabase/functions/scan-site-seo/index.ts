import { appCorsHeaders } from '../_shared/cors.ts'
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

interface SeoIssue {
  id: string;
  title: string;
  fix: string;
  impact: "Critical" | "High" | "Medium" | "Low";
  category: "SEO" | "Performance" | "Content" | "Technical";
  count?: number;
  ai_detected?: boolean;
}

/* ── Scoring logic (mirrors src/lib/seo-scoring.ts) ── */
const BASE_WEIGHTS: Record<string, number> = { Critical: 15, High: 8, Medium: 4, Low: 2 };

function severityMultiplier(issueId: string, count?: number): number {
  if (!count || count <= 1) return 1.0;
  switch (issueId) {
    case "h1-multiple":
    case "multiple-h1":
      return count <= 2 ? 1.0 : count <= 5 ? 1.3 : count <= 10 ? 1.7 : 2.0;
    case "images-without-alt":
    case "images-missing-alt":
      return count <= 5 ? 1.0 : count <= 15 ? 1.3 : count <= 30 ? 1.6 : 2.0;
    case "meta-desc-duplicate":
    case "canonical-duplicate":
      return count <= 2 ? 1.0 : count <= 4 ? 1.3 : 1.6;
    case "render-blocking-scripts":
      return count <= 2 ? 1.0 : count <= 5 ? 1.3 : 1.6;
    default:
      return count <= 3 ? 1.0 : count <= 10 ? 1.2 : 1.4;
  }
}

function calculateScore(issues: SeoIssue[]): number {
  if (issues.length === 0) return 100;
  const deductions = issues.reduce((sum, i) => {
    const base = BASE_WEIGHTS[i.impact] || 4;
    const mult = Math.min(severityMultiplier(i.id, i.count), 3.0);
    return sum + base * mult;
  }, 0);
  return Math.max(0, Math.round(100 - Math.min(deductions, 100)));
}

/* ── Platform detection ── */
function detectPlatform(html: string): string | null {
  const h = html.toLowerCase();
  if (h.includes("wp-content") || h.includes("wp-includes") || h.includes("wp-json")) return "wordpress";
  if (h.includes("cdn.shopify.com") || h.includes("shopify-section")) return "shopify";
  if (h.includes("wix.com") || h.includes("wixstatic.com")) return "wix";
  if (h.includes("squarespace.com") || h.includes("squarespace-cdn")) return "squarespace";
  if (h.includes("webflow.com") || h.includes("wf-section")) return "webflow";
  return null;
}

/* ── Deterministic issue builders ── */
function buildDeterministicIssues(ctx: {
  titleStatus: string; titleLength: number; titleContent: string | null;
  metaDescContent: string | null; metaDescLength: number; metaDescCount: number;
  h1Count: number; isSPA: boolean;
  hasCanonical: boolean; canonicalCount: number; hasOgTitle: boolean; hasOgDesc: boolean; hasOgImage: boolean;
  isHttps: boolean; blockingScriptsCount: number; blockingScriptSrcs: string[]; imgsNoLazy: number;
}): SeoIssue[] {
  const issues: SeoIssue[] = [];

  // Title
  if (ctx.titleStatus === "missing") {
    issues.push({ id: "title-missing", title: "Page title is missing", fix: "", impact: "Critical", category: "SEO" });
  } else if (ctx.titleStatus === "too-short") {
    issues.push({ id: "title-too-short", title: `Page title is too short (${ctx.titleLength} chars, aim for 30-65)`, fix: "", impact: "Medium", category: "SEO" });
  } else if (ctx.titleStatus === "too-long") {
    issues.push({ id: "title-too-long", title: `Page title is too long (${ctx.titleLength} chars, aim for 30-65)`, fix: "", impact: "Medium", category: "SEO" });
  }

  // Meta description
  if (!ctx.metaDescContent) {
    issues.push({ id: "meta-desc-missing", title: "Meta description is missing", fix: "", impact: "High", category: "SEO" });
  } else if (ctx.metaDescLength < 120) {
    issues.push({ id: "meta-desc-too-short", title: `Meta description is too short (${ctx.metaDescLength} chars, aim for 120-160)`, fix: "", impact: "Medium", category: "SEO" });
  } else if (ctx.metaDescLength > 160) {
    issues.push({ id: "meta-desc-too-long", title: `Meta description is too long (${ctx.metaDescLength} chars, aim for 120-160)`, fix: "", impact: "Medium", category: "SEO" });
  }
  if (ctx.metaDescCount > 1) {
    issues.push({ id: "meta-desc-duplicate", title: `${ctx.metaDescCount} meta description tags found (should be exactly 1)`, fix: "", impact: "High", category: "SEO", count: ctx.metaDescCount });
  }

  // H1
  if (!ctx.isSPA && ctx.h1Count === 0) {
    issues.push({ id: "h1-missing", title: "No H1 heading found", fix: "", impact: "Critical", category: "SEO" });
  } else if (ctx.h1Count > 1) {
    issues.push({ id: "h1-multiple", title: `Multiple H1 tags found (${ctx.h1Count})`, fix: "", impact: "Medium", category: "Content", count: ctx.h1Count });
  }

  // Canonical
  if (!ctx.hasCanonical) {
    issues.push({ id: "canonical-missing", title: "No canonical tag found", fix: "", impact: "Medium", category: "Technical" });
  } else if (ctx.canonicalCount > 1) {
    issues.push({ id: "canonical-duplicate", title: `${ctx.canonicalCount} canonical tags found (should be exactly 1)`, fix: "", impact: "High", category: "Technical", count: ctx.canonicalCount });
  }

  // OG tags
  const missingOg: string[] = [];
  if (!ctx.hasOgTitle) missingOg.push("og:title");
  if (!ctx.hasOgDesc) missingOg.push("og:description");
  if (!ctx.hasOgImage) missingOg.push("og:image");
  if (missingOg.length > 0) {
    issues.push({ id: "og-tags-missing", title: `Missing Open Graph tags: ${missingOg.join(", ")}`, fix: "", impact: "Low", category: "SEO", count: missingOg.length });
  }

  // HTTPS
  if (!ctx.isHttps) {
    issues.push({ id: "not-https", title: "Site is not using HTTPS", fix: "", impact: "Critical", category: "Technical" });
  }

  // Render-blocking scripts
  if (ctx.blockingScriptsCount > 0) {
    const detail = ctx.blockingScriptSrcs.length > 0
      ? `Blocking scripts:\n${ctx.blockingScriptSrcs.map(s => `• ${s}`).join("\n")}`
      : "";
    issues.push({ id: "render-blocking-scripts", title: `${ctx.blockingScriptsCount} render-blocking script(s) in <head>`, fix: detail || "Add async or defer attributes to render-blocking scripts in the <head>.", impact: "Medium", category: "Performance", count: ctx.blockingScriptsCount });
  }

  // Lazy loading
  if (ctx.imgsNoLazy > 5) {
    issues.push({ id: "images-no-lazy", title: `${ctx.imgsNoLazy} images without lazy loading`, fix: "", impact: "Low", category: "Performance", count: ctx.imgsNoLazy });
  }

  return issues;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });

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
        status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Per-user burst rate limit
    const rl = await checkUserRateLimit(user.id, "scan-site-seo");
    if (!rl.allowed) return rateLimitResponse(appCorsHeaders(req), rl.retryAfterMs);

    const { url, site_id, org_id } = await req.json();
    if (!url || !site_id || !org_id) {
      return new Response(JSON.stringify({ error: "url, site_id, org_id required" }), {
        status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Admin-only: verify user has admin role in this org
    const { data: roleRow } = await adminClient
      .from("org_users")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (!roleRow || roleRow.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required for SEO scanning" }), {
        status: 403, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!url || !site_id || !org_id) {
      return new Response(JSON.stringify({ error: "url, site_id, org_id required" }), {
        status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: "Only HTTP/HTTPS allowed" }), {
        status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Block private IPs
    const hostname = parsedUrl.hostname.toLowerCase();
    const privatePatterns = [/^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^169\.254\./, /^localhost$/i];
    if (privatePatterns.some(p => p.test(hostname))) {
      return new Response(JSON.stringify({ error: "Cannot scan private addresses" }), {
        status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: usageCount } = await adminClient
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("function_name", "scan-site-seo")
      .eq("cached", false)
      .gte("created_at", dayAgo);

    if ((usageCount ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: "Daily SEO scan limit reached (10/day). Try again tomorrow.", code: "RATE_LIMITED" }),
        { status: 429, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
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
        // Add cache-busting query param + no-cache headers to bypass WordPress/CDN caches
        const bustUrl = new URL(url);
        bustUrl.searchParams.set("_seo_scan", Date.now().toString());
        const resp = await fetch(bustUrl.toString(), {
          redirect: "follow",
          headers: {
            "User-Agent": userAgents[i],
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
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
        status: 422, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Parse HTML signals ──
    const platform = detectPlatform(html);
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headContent = headMatch ? headMatch[0] : "";

    const h1Count = (html.match(/<h1(\s[^>]*)?>/gi) || []).length;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleContentRaw = titleMatch ? titleMatch[1].trim() : null;
    const titleContent = titleContentRaw ? titleContentRaw.replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-fA-F]+);/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'") : null;
    const titleLength = titleContent ? titleContent.length : 0;

    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const metaDescRaw = metaDescMatch ? metaDescMatch[1].trim() : null;
    const metaDescContent = metaDescRaw ? metaDescRaw.replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-fA-F]+);/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'") : null;
    const metaDescLength = metaDescContent ? metaDescContent.length : 0;
    const metaDescAllMatches = html.match(/<meta[^>]+name=["']description["']/gi) || [];
    const metaDescCount = metaDescAllMatches.length;

    const canonicalMatches = html.match(/<link[^>]+rel=["']canonical["']/gi) || [];
    const canonicalCount = canonicalMatches.length;
    const hasCanonical = canonicalCount > 0;
    const hasOgTitle = !!html.match(/<meta[^>]+property=["']og:title["']/i);
    const hasOgDesc = !!html.match(/<meta[^>]+property=["']og:description["']/i);
    const hasOgImage = !!html.match(/<meta[^>]+property=["']og:image["']/i);
    const isHttps = parsedUrl.protocol === "https:";

    const headScripts = (headContent.match(/<script[^>]*>/gi) || []);
    const blockingScripts = headScripts.filter(t => /src=/i.test(t) && !/async/i.test(t) && !/defer/i.test(t));
    const blockingScriptSrcs = blockingScripts.map(t => {
      const m = t.match(/src=["']([^"']+)["']/i);
      return m ? m[1] : "(inline)";
    });
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsNoLazy = imgTags.filter(t => !/loading=/i.test(t)).length;

    let titleStatus = "missing";
    if (titleContent) titleStatus = titleLength < 30 ? "too-short" : titleLength > 65 ? "too-long" : "good";

    const bodyContent = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, "").trim();
    const isSPA = bodyContent.length < 500 && /<div[^>]+id=["'](root|app|__next)["']/i.test(html);

    // ── Step 1: Build deterministic issues ──
    const deterministicIssues = buildDeterministicIssues({
      titleStatus, titleLength, titleContent,
      metaDescContent, metaDescLength, metaDescCount,
      h1Count, isSPA,
      hasCanonical, canonicalCount, hasOgTitle, hasOgDesc, hasOgImage,
      isHttps, blockingScriptsCount: blockingScripts.length, blockingScriptSrcs, imgsNoLazy,
    });
    const deterministicIds = new Set(deterministicIssues.map(i => i.id));

    console.log(`Deterministic issues found: ${deterministicIssues.length}`);

    // ── Step 2: Call AI for fix text + supplementary issues ──
    const analyzableHtml = headContent + "\n" + html.slice(0, 20000);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const deterministicSummary = deterministicIssues.map(i => `- [${i.impact}] ${i.id}: ${i.title}`).join("\n");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: `You are an SEO audit system. A deterministic scan already found these issues:

${deterministicSummary || "(none)"}

Your tasks:
1. For each deterministic issue above, write a beginner-friendly fix instruction starting with "One way to fix this:". ${platform ? `Platform: ${platform.toUpperCase()}. Give platform-specific steps.` : "Give general fix steps."}
2. Identify up to 3 ADDITIONAL issues NOT already listed above (e.g. thin content, keyword stuffing, accessibility, structured data). Only report real problems you can see in the HTML.

Return ALL issues (both deterministic + your additions) via the tool call. For deterministic issues, use the EXACT same id. For new issues, use a descriptive kebab-case id.

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
                    required: ["id", "title", "fix", "impact", "category"],
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
      if (s === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
      if (s === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
      throw new Error(`AI error: ${s}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No AI response");

    const aiResult = JSON.parse(toolCall.function.arguments) as { issues: SeoIssue[] };

    // ── Step 3: Merge — deterministic issues are authoritative ──
    const finalIssues: SeoIssue[] = [];

    // Start with deterministic issues, enriched with AI fix text
    for (const det of deterministicIssues) {
      const aiMatch = aiResult.issues.find(ai => ai.id === det.id);
      finalIssues.push({
        ...det,
        fix: aiMatch?.fix || det.fix || "",
      });
    }

    // Add AI-only supplementary issues (capped at 3, deduped)
    // Important: We do NOT trust AI for duplicate meta/canonical claims (hallucination-prone).
    // Those must be surfaced only via deterministic counters above.
    const blockedAiIds = new Set([
      "duplicate-meta-description",
      "multiple-canonical-tags",
      "duplicate-canonical-tags",
      "duplicate-meta-description-tag",
      "multiple-canonical",
    ]);

    let aiExtras = 0;
    const MAX_AI_EXTRAS = 0; // Only show deterministic issues; AI provides fix text only
    for (const ai of aiResult.issues) {
      if (deterministicIds.has(ai.id)) continue;
      if (blockedAiIds.has(ai.id)) continue;
      if (aiExtras >= MAX_AI_EXTRAS) break;
      finalIssues.push({ ...ai, ai_detected: true });
      aiExtras++;
    }

    console.log(`Final issues: ${finalIssues.length} (${deterministicIssues.length} deterministic + ${aiExtras} AI)`);

    // ── Step 4: Score using shared logic ──
    const score = calculateScore(finalIssues);

    // Build scan evidence signals
    const canonicalHrefMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
    const signals = {
      title_text: titleContent || null,
      title_length: titleLength,
      meta_description_text: metaDescContent || null,
      meta_description_length: metaDescLength,
      og_title: ogTitleMatch ? ogTitleMatch[1].trim() : null,
      og_image: ogImageMatch ? ogImageMatch[1].trim() : null,
      canonical: canonicalHrefMatch ? canonicalHrefMatch[1].trim() : null,
      final_url: url,
      fetched_at: new Date().toISOString(),
    };

    // Store scan result
    await adminClient.from("seo_scans").insert({
      org_id, site_id, url, score,
      issues_json: finalIssues,
      recommendations_json: [],
      platform,
      signals_json: signals,
    });

    // Log AI usage
    await adminClient.from("ai_usage_log").insert({
      org_id, function_name: "scan-site-seo", cached: false,
    });

    return new Response(JSON.stringify({ score, issues: finalIssues, platform, url }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scan-site-seo error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
