import { appCorsHeaders } from '../_shared/cors.ts'
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

const DAILY_LIMIT = 15;
const CACHE_HOURS = 4;
const FUNCTION_NAME = "dashboard-ai-insights";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("Auth failed:", userErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const userId = userData.user.id;

    // Rate limit check
    const rl = await checkUserRateLimit(userId, "dashboard-ai-insights");
    if (!rl.allowed) return rateLimitResponse(appCorsHeaders(req), rl.retryAfterMs);

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
      return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
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
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
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
        { status: 200, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Fetch enriched context: org name, site domains, top pages, top sources
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const [orgData, sitesData, topPagesData, topSourcesData, ctaClicksData, goalsData, formsData, incidentsData, brokenLinksData, domainData] = await Promise.all([
      adminClient.from("orgs").select("name").eq("id", orgId).single(),
      adminClient.from("sites").select("domain, plugin_version").eq("org_id", orgId).limit(10),
      adminClient.from("pageviews").select("page_path").eq("org_id", orgId).gte("occurred_at", thirtyDaysAgo).limit(500),
      adminClient.from("sessions").select("utm_source, landing_referrer_domain").eq("org_id", orgId).gte("started_at", thirtyDaysAgo).limit(500),
      adminClient.from("events").select("target_text, page_path, meta").eq("org_id", orgId).eq("event_type", "cta_click").gte("occurred_at", thirtyDaysAgo).limit(500),
      adminClient.from("conversion_goals").select("name, goal_type, is_active").eq("org_id", orgId).eq("is_active", true).limit(20),
      adminClient.from("forms").select("name, form_category, provider, is_primary_lead").eq("org_id", orgId).eq("archived", false).limit(30),
      adminClient.from("incidents").select("type, severity").eq("org_id", orgId).is("resolved_at", null).limit(10),
      adminClient.from("broken_links").select("broken_url, source_page").eq("org_id", orgId).gte("last_seen_at", thirtyDaysAgo).limit(20),
      adminClient.from("domain_health").select("domain, days_to_domain_expiry").eq("org_id", orgId).limit(5),
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

    // Aggregate CTA clicks to know what buttons/CTAs already exist on the site
    const ctaCounts: Record<string, number> = {};
    (ctaClicksData.data || []).forEach((e: any) => {
      const label = (e.target_text || "").trim();
      if (label) ctaCounts[label] = (ctaCounts[label] || 0) + 1;
    });
    const topCtasStr = Object.entries(ctaCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([label, cnt]) => `"${label}" (${cnt} clicks)`).join(", ");

    // Goals context
    const activeGoals = (goalsData.data || []) as any[];
    const goalsStr = activeGoals.length > 0
      ? activeGoals.map((g: any) => `${g.name} (${g.goal_type})`).join(", ")
      : "None configured";

    // Forms context
    const activeForms = (formsData.data || []) as any[];
    const formsStr = activeForms.length > 0
      ? activeForms.map((f: any) => `${f.name} [${f.provider}, ${f.form_category}${f.is_primary_lead ? ", primary" : ""}]`).join("; ")
      : "None";

    // Site health context
    const openIncidents = (incidentsData.data || []) as any[];
    const brokenLinks = (brokenLinksData.data || []) as any[];
    const domains = (domainData.data || []) as any[];
    const healthStr = [
      openIncidents.length > 0 ? `${openIncidents.length} open incident(s)` : "No open incidents",
      brokenLinks.length > 0 ? `${brokenLinks.length} broken link(s)` : "No broken links",
      domains.length > 0 ? domains.map((d: any) => `${d.domain}: ${d.days_to_domain_expiry ?? "?"}d to expiry`).join(", ") : "",
    ].filter(Boolean).join(". ");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a sharp marketing analytics advisor for ACTV TRKR, a website performance tracker. Given the metrics below, write a concise performance summary (2-3 sentences) and exactly 3 actionable suggestions. Each suggestion should be specific, data-driven, and immediately actionable.

CLIENT: ${orgName}
SITES: ${siteDomains || "None"}
TOP PAGES (30d): ${topPagesStr || "No data"}
TOP SOURCES (30d): ${topSourcesStr || "No data"}
EXISTING CTAs CLICKED (30d): ${topCtasStr || "No CTA click data"}
ACTIVE GOALS: ${goalsStr}
TRACKED FORMS: ${formsStr}
SITE HEALTH: ${healthStr}

Return a JSON object with this exact structure (no markdown, no code fences):
{
  "summary": "Your 2-3 sentence performance overview written in first-person plural (we/our)",
  "suggestions": [
    { "title": "Short title", "description": "One sentence action item referencing specific pages or sources", "priority": "high|medium|low" },
    { "title": "Short title", "description": "One sentence action item", "priority": "high|medium|low" },
    { "title": "Short title", "description": "One sentence action item", "priority": "high|medium|low" }
  ]
}

Rules:
- Be specific about numbers, not vague. Reference specific pages and sources.
- CRITICAL: Write the summary in first-person plural ("We are…", "Our traffic…", "Our leads…"). Do NOT refer to the client by name (e.g. never say "${orgName} is…" or "My Organization is…"). The reader IS the client.
- Suggestions should feel like they come from a strategist, not a chatbot.
- If data is sparse, acknowledge the early stage and focus on setup/launch actions.
- IMPORTANT: Use calm, professional, encouraging language. Never use dramatic or alarming words.
- CRITICAL: Check the "EXISTING CTAs CLICKED" list before suggesting to add any button or CTA. If a CTA already exists and gets clicks, do NOT suggest adding it — instead suggest optimizing its placement, visibility, or the page it links to.
- CRITICAL: The user already has forms tracking set up. Do NOT suggest setting up form tracking, installing tracking, or creating forms — they are already tracked. See "TRACKED FORMS" above.
- CRITICAL: If "ACTIVE GOALS" shows configured goals, do NOT suggest setting up goals — they already exist. Instead, suggest ways to improve the metrics those goals track.
- CRITICAL: Do NOT repeat information already visible in the dashboard (site health status, domain expiry). Focus on strategic marketing actions the user should take.
- CRITICAL: If the previous period's value for any metric (sessions, leads, CVR) is zero, do NOT report a percentage drop or gain for that metric. Instead, note that tracking just started and there isn't enough history for a comparison yet. Only compare periods when both have real data.
- Focus suggestions on content strategy, traffic growth, conversion optimization, and audience engagement — not on tool setup.
- CRITICAL — NO FABRICATION: Only reference facts that appear in the data above. Do NOT invent page elements, popups, modals, banners, layouts, or UI behavior that aren't in the data. If you reference a CTA label from "EXISTING CTAs CLICKED", treat it as a labeled click event only — you do NOT know whether it is a button, link, popup, close icon, or where it sits on the page. Never speculate about why a click happened (e.g. "popups appearing too early", "obstructing other links") unless that cause is explicitly in the data.
- If a CTA label looks generic (e.g. "Close", "X", "Submit", "Click here", "Read more"), do NOT build a recommendation around it — these are ambiguous and we cannot infer intent from the label alone.`;

    const keyActionsThis = Number(metrics.keyActionsThisWeek ?? 0);
    const keyActionsLast = Number(metrics.keyActionsLastWeek ?? 0);
    const leadsThis = Number(metrics.leadsThisWeek ?? 0);
    const leadsLast = Number(metrics.leadsLastWeek ?? 0);
    // Conversions = the union signal already used to compute CVR on the dashboard
    // (Key Actions when configured, otherwise form leads). Never just "leads".
    const conversionsThis = Math.max(keyActionsThis, leadsThis);
    const conversionsLast = Math.max(keyActionsLast, leadsLast);

    const userPrompt = `Here are the current dashboard metrics for ${orgName}:

Sessions (this period): ${metrics.sessionsThisWeek}
Sessions (previous period): ${metrics.sessionsLastWeek}
Conversions this period — Key Actions: ${keyActionsThis} | Form leads: ${leadsThis} | Combined: ${conversionsThis}
Conversions previous period — Key Actions: ${keyActionsLast} | Form leads: ${leadsLast} | Combined: ${conversionsLast}
Conversion Rate (this period): ${(metrics.cvrThisWeek * 100).toFixed(2)}%  — calculated as Combined Conversions ÷ Sessions (Key Actions + form leads, NOT form leads alone)
Conversion Rate (previous period): ${(metrics.cvrLastWeek * 100).toFixed(2)}%
Top Page: ${metrics.topPage || "N/A"}
Top Source: ${metrics.topSource || "N/A"}
Total Forms: ${metrics.totalForms || 0}
Primary Focus: ${metrics.primaryFocus || "lead_volume"}

CRITICAL: Never claim "0% conversion rate" or a "conversion gap" purely because form leads = 0. Conversion rate above already counts Key Actions (CTA clicks, calls, email clicks, etc.). If Combined Conversions > 0, the site IS converting — frame insights around that signal, not form fills alone.`;

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
          { status: 200, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached." }),
          { status: 402, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
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
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dashboard-ai-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
