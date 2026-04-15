import { appCorsHeaders } from '../_shared/cors.ts'
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_MIN = 120;
const META_MAX = 155;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const countChars = (value: string): number => [...value].length;

function sanitizeAiText(value: string): string {
  return value
    .replace(/^\s*["'`]+/, "")
    .replace(/["'`]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimToMax(value: string, max: number): string {
  const clean = sanitizeAiText(value);
  if (countChars(clean) <= max) return clean;

  const clipped = [...clean].slice(0, max).join("");
  const lastSpace = clipped.lastIndexOf(" ");
  const safeCut = lastSpace > Math.floor(max * 0.6) ? clipped.slice(0, lastSpace) : clipped;
  return safeCut.replace(/[,:;.!?\-–—|]+$/g, "").trim();
}

function isInRange(value: string, min: number, max: number): boolean {
  const len = countChars(sanitizeAiText(value));
  return len >= min && len <= max;
}

function enforceTitleLength(value: string, fallbackBase: string): string {
  let out = sanitizeAiText(value || "");
  const base = sanitizeAiText(fallbackBase || "");

  if (!out) out = base || "Official Site";
  if (countChars(out) > TITLE_MAX) out = trimToMax(out, TITLE_MAX);

  if (countChars(out) < TITLE_MIN) {
    const suffixes = [" | Official Site", " | Advanced Solutions", " | Apyx Medical"];
    for (const suffix of suffixes) {
      const candidate = sanitizeAiText(`${out}${suffix}`);
      const len = countChars(candidate);
      if (len >= TITLE_MIN && len <= TITLE_MAX) return candidate;
    }

    if (base) {
      const merged = sanitizeAiText(`${out} | ${base}`);
      if (countChars(merged) <= TITLE_MAX) out = merged;
    }
  }

  const fillers = [" Solutions", " Platform", " Official"];
  for (const filler of fillers) {
    if (countChars(out) >= TITLE_MIN) break;
    if (countChars(`${out}${filler}`) <= TITLE_MAX) out = `${out}${filler}`;
  }

  if (countChars(out) > TITLE_MAX) out = trimToMax(out, TITLE_MAX);
  return out;
}

function enforceMetaDescriptionLength(value: string, fallbackSource: string): string {
  let out = sanitizeAiText(value || "");
  const backup = sanitizeAiText(fallbackSource || "");

  if (!out) out = backup;
  if (!out) {
    out = "Explore Apyx Medical advanced energy solutions for surgery and aesthetics, including Renuvion technology, clinical resources, and support for physicians and patients.";
  }

  if (countChars(out) > META_MAX) out = trimToMax(out, META_MAX);

  const additions = [
    " Explore our technology and clinical resources.",
    " Learn how our platform supports better outcomes.",
    " See solutions, evidence, and patient information.",
  ];

  if (countChars(out) < META_MIN) {
    for (const extra of additions) {
      if (countChars(out) >= META_MIN) break;
      const candidate = sanitizeAiText(`${out}${extra}`);
      if (countChars(candidate) <= META_MAX) out = candidate;
    }
  }

  if (countChars(out) < META_MIN && backup) {
    const room = META_MAX - countChars(out);
    if (room > 12) {
      const snippet = trimToMax(backup, room - 1);
      out = sanitizeAiText(`${out} ${snippet}`);
    }
  }

  const filler = " Learn more about our solutions.";
  while (countChars(out) < META_MIN && countChars(`${out}${filler}`) <= META_MAX) {
    out = sanitizeAiText(`${out}${filler}`);
  }

  if (countChars(out) > META_MAX) out = trimToMax(out, META_MAX);
  return out;
}

async function runAiPrompt(apiKey: string, prompt: string): Promise<string> {
  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    console.error("AI gateway error:", aiResp.status, errText);

    if (aiResp.status === 429) {
      throw new HttpError(429, "Rate limit exceeded, please try again shortly.");
    }
    if (aiResp.status === 402) {
      throw new HttpError(402, "AI credits exhausted.");
    }
    throw new Error("AI generation failed");
  }

  const aiData = await aiResp.json();
  const content = aiData.choices?.[0]?.message?.content ?? "";
  return sanitizeAiText(content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const userId = user.id;

    // Per-user burst rate limit
    const rl = checkUserRateLimit(userId, "seo-suggest-fix");
    if (!rl.allowed) return rateLimitResponse(appCorsHeaders(req), rl.retryAfterMs);

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
          { status: 429, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
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
        { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
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
- MUST be between ${TITLE_MIN} and ${TITLE_MAX} characters (strict)
- Include the primary keyword naturally
- Be compelling and click-worthy
- Do NOT include quotes around the title
- Count characters before finalizing

${context}

Return ONLY the title text, nothing else.`;
    } else if (fix_type === "set_meta_desc") {
      prompt = `You are an SEO expert. Given the following page context, write ONE optimized meta description.

Rules:
- MUST be between ${META_MIN}-${META_MAX} characters (strict)
- Include a clear call-to-action or value proposition
- Include the primary keyword naturally
- Be compelling and encourage clicks
- Do NOT include quotes around the description
- Count characters before finalizing

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

    let suggested = await runAiPrompt(LOVABLE_API_KEY, prompt);

    const fallbackBase = sanitizeAiText(h1Text || pageTitle || new URL(page_url).hostname.replace(/^www\./, ""));
    const fallbackMeta = sanitizeAiText(currentMetaDesc || firstParagraph || pageTitle || fallbackBase);

    if (fix_type === "set_title") {
      if (!isInRange(suggested, TITLE_MIN, TITLE_MAX)) {
        try {
          suggested = await runAiPrompt(
            LOVABLE_API_KEY,
            `Rewrite this SEO title to be strictly ${TITLE_MIN}-${TITLE_MAX} characters while keeping the same meaning and keyword intent.\n\nTitle: ${suggested}\n\nReturn ONLY the rewritten title.`
          );
        } catch (repairErr) {
          console.warn("Title repair prompt failed, using deterministic fallback", repairErr);
        }
      }
      suggested = enforceTitleLength(suggested, fallbackBase);
    }

    if (fix_type === "set_meta_desc") {
      if (!isInRange(suggested, META_MIN, META_MAX)) {
        try {
          suggested = await runAiPrompt(
            LOVABLE_API_KEY,
            `Rewrite this meta description to be strictly ${META_MIN}-${META_MAX} characters while preserving meaning and SEO intent.\n\nDescription: ${suggested}\n\nReturn ONLY the rewritten description.`
          );
        } catch (repairErr) {
          console.warn("Meta description repair prompt failed, using deterministic fallback", repairErr);
        }
      }
      suggested = enforceMetaDescriptionLength(suggested, fallbackMeta);
    }

    // For OG tags, validate JSON
    if (fix_type === "add_og_tags") {
      try {
        const parsed = JSON.parse(suggested);
        suggested = JSON.stringify({
          title: trimToMax(sanitizeAiText(parsed.title || pageTitle || fallbackBase), 60),
          description: trimToMax(sanitizeAiText(parsed.description || currentMetaDesc || firstParagraph || ""), 155),
          url: page_url,
        });
      } catch {
        suggested = JSON.stringify({
          title: trimToMax(sanitizeAiText(pageTitle || fallbackBase), 60),
          description: trimToMax(sanitizeAiText(currentMetaDesc || firstParagraph || ""), 155),
          url: page_url,
        });
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
      { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("seo-suggest-fix error:", err);

    if (err instanceof HttpError) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: err.status, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});