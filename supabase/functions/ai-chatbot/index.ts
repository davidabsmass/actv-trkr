import { appCorsHeaders } from '../_shared/cors.ts'
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

const MONTHLY_LIMIT = 300;
const CONTEXT_CACHE_HOURS = 1;
const FUNCTION_NAME = "ai-chatbot";
const CONTEXT_CACHE_KEY = "ai-chatbot-context";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Rate limit check
    const rl = await checkUserRateLimit(userId, "ai-chatbot");
    if (!rl.allowed) return rateLimitResponse(appCorsHeaders(req), rl.retryAfterMs);

    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { messages, language, orgId: bodyOrgId } = await req.json();

    // Resolve and validate org membership
    let orgId = bodyOrgId;
    if (orgId) {
      const { data: membership } = await adminClient
        .from("org_users")
        .select("org_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!membership) orgId = null;
    }
    if (!orgId) {
      const { data: orgRow } = await adminClient
        .from("org_users")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      orgId = orgRow?.org_id;
    }
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === 300/month rate limit ===
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: monthlyCount } = await adminClient
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("function_name", FUNCTION_NAME)
      .eq("cached", false)
      .gte("created_at", monthStart);

    if ((monthlyCount ?? 0) >= MONTHLY_LIMIT) {
      return new Response(
        JSON.stringify({ error: "You've used all 300 AI assistant messages this month. They'll reset next month!" }),
        { status: 429, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // === Check context cache (1 hour) ===
    const cacheThreshold = new Date(Date.now() - CONTEXT_CACHE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedCtx } = await adminClient
      .from("ai_usage_log")
      .select("response_cache")
      .eq("org_id", orgId)
      .eq("function_name", CONTEXT_CACHE_KEY)
      .gte("created_at", cacheThreshold)
      .order("created_at", { ascending: false })
      .limit(1);

    let metricsContext: string;
    let orgName = "your organization";

    if (cachedCtx && cachedCtx.length > 0 && cachedCtx[0].response_cache) {
      metricsContext = cachedCtx[0].response_cache as string;
    } else {
      // Build fresh context
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const dayStart = weekAgo.toISOString();
      const dayEnd = now.toISOString();
      const prevStart = twoWeeksAgo.toISOString();
      const prevEnd = weekAgo.toISOString();
      const monthStartData = thirtyDaysAgo.toISOString();

      // Fetch org name
      const { data: orgData } = await adminClient.from("orgs").select("name").eq("id", orgId).single();
      orgName = orgData?.name || "your organization";

      const [
        sessThis, sessPrev, leadsThis, leadsPrev,
        formsRes, sitesRes, topPagesRes, topSourcesRes,
        goalsRes, goalCompletionsRes, ordersRes, ordersPrevRes,
        seoRes, brokenLinksRes, incidentsRes, domainHealthRes,
        alertsRes, nightlySummaryRes, recentLeadsRes,
      ] = await Promise.all([
        adminClient.from("sessions").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd),
        adminClient.from("sessions").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).gte("started_at", prevStart).lte("started_at", prevEnd),
        adminClient.from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", dayStart).lte("submitted_at", dayEnd),
        adminClient.from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", prevStart).lte("submitted_at", prevEnd),
        adminClient.from("forms").select("id, name, form_category, is_primary_lead, lead_weight, estimated_value", { count: "exact" })
          .eq("org_id", orgId).eq("archived", false).limit(50),
        adminClient.from("sites").select("id, domain").eq("org_id", orgId).limit(10),
        adminClient.from("pageviews").select("page_path")
          .eq("org_id", orgId).gte("occurred_at", monthStartData).limit(500),
        adminClient.from("sessions").select("utm_source, landing_referrer_domain")
          .eq("org_id", orgId).gte("started_at", monthStartData).limit(500),
        adminClient.from("goals_config").select("id, name, event_type, match_type, match_value, is_conversion")
          .eq("org_id", orgId).limit(50),
        adminClient.from("goal_completions").select("goal_id, event_type, page_path, utm_source")
          .eq("org_id", orgId).gte("completed_at", dayStart).limit(500),
        adminClient.from("orders").select("total, status", { count: "exact" })
          .eq("org_id", orgId).gte("ordered_at", dayStart).lte("ordered_at", dayEnd),
        adminClient.from("orders").select("total, status", { count: "exact" })
          .eq("org_id", orgId).gte("ordered_at", prevStart).lte("ordered_at", prevEnd),
        adminClient.from("seo_scans").select("score, issues, scanned_at, url")
          .eq("org_id", orgId).order("scanned_at", { ascending: false }).limit(1),
        adminClient.from("broken_links").select("broken_url, source_page, status_code, occurrences")
          .eq("org_id", orgId).order("last_seen_at", { ascending: false }).limit(20),
        adminClient.from("incidents").select("type, severity, started_at, resolved_at, site_id")
          .eq("org_id", orgId).is("resolved_at", null).limit(10),
        adminClient.from("domain_health").select("domain, days_to_domain_expiry, source")
          .eq("org_id", orgId).limit(10),
        adminClient.from("alerts").select("title, severity, date")
          .eq("org_id", orgId).order("date", { ascending: false }).limit(10),
        adminClient.from("nightly_summaries").select("summary_text, top_findings, suggested_actions, period_start, period_end")
          .eq("org_id", orgId).order("generated_at", { ascending: false }).limit(1),
        adminClient.from("leads").select("source, utm_source, utm_medium, utm_campaign, page_path, form_id, submitted_at")
          .eq("org_id", orgId).neq("status", "trashed").order("submitted_at", { ascending: false }).limit(30),
      ]);

      const sessionsThisWeek = sessThis.count || 0;
      const sessionsLastWeek = sessPrev.count || 0;
      const leadsThisWeek = leadsThis.count || 0;
      const leadsLastWeek = leadsPrev.count || 0;
      const cvrThisWeek = sessionsThisWeek > 0 ? leadsThisWeek / sessionsThisWeek : 0;
      const cvrLastWeek = sessionsLastWeek > 0 ? leadsLastWeek / sessionsLastWeek : 0;

      const pageCounts: Record<string, number> = {};
      (topPagesRes.data || []).forEach((p: any) => {
        const path = p.page_path || "/";
        pageCounts[path] = (pageCounts[path] || 0) + 1;
      });
      const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([path, count]) => `${path} (${count} views)`).join("\n  ");

      const sourceCounts: Record<string, number> = {};
      (topSourcesRes.data || []).forEach((s: any) => {
        const src = s.utm_source || s.landing_referrer_domain || "direct";
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      });
      const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([src, count]) => `${src} (${count} sessions)`).join("\n  ");

      const formsList = (formsRes.data || []).map((f: any) =>
        `${f.name} (category: ${f.form_category}, primary lead: ${f.is_primary_lead}, value: $${f.estimated_value || 0})`
      ).join("\n  ");

      const siteDomains = (sitesRes.data || []).map((s: any) => s.domain).join(", ");

      const goalsList = (goalsRes.data || []).map((g: any) =>
        `${g.name} (type: ${g.event_type}, match: ${g.match_type}=${g.match_value}, counts as conversion: ${g.is_conversion})`
      ).join("\n  ");
      const goalCompletions = goalCompletionsRes.data || [];
      const goalCompCounts: Record<string, number> = {};
      goalCompletions.forEach((gc: any) => { goalCompCounts[gc.goal_id] = (goalCompCounts[gc.goal_id] || 0) + 1; });
      const goalCompSummary = Object.entries(goalCompCounts)
        .map(([gid, count]) => {
          const goal = (goalsRes.data || []).find((g: any) => g.id === gid);
          return `${goal?.name || gid}: ${count} completions`;
        }).join("\n  ");

      const ordersThisWeek = ordersRes.count || 0;
      const ordersPrevWeek = ordersPrevRes.count || 0;
      const revenueThisWeek = (ordersRes.data || []).reduce((s: number, o: any) => s + (o.total || 0), 0);
      const revenuePrevWeek = (ordersPrevRes.data || []).reduce((s: number, o: any) => s + (o.total || 0), 0);

      const latestSeo = (seoRes.data || [])[0];
      let seoContext = "No SEO scans available.";
      if (latestSeo) {
        const issues = latestSeo.issues || [];
        const issuesSummary = issues.slice(0, 10).map((i: any) =>
          `[${i.severity}] ${i.title}: ${i.description || ""}`
        ).join("\n  ");
        seoContext = `Latest SEO scan (${latestSeo.url}, score: ${latestSeo.score}/100, scanned: ${latestSeo.scanned_at}):\n  ${issuesSummary}`;
      }

      const brokenLinksList = (brokenLinksRes.data || []).slice(0, 10).map((bl: any) =>
        `${bl.broken_url} (status: ${bl.status_code}, found on: ${bl.source_page}, occurrences: ${bl.occurrences})`
      ).join("\n  ");

      const activeIncidents = (incidentsRes.data || []).map((i: any) =>
        `${i.type} (severity: ${i.severity}, since: ${i.started_at})`
      ).join("\n  ");

      const domainInfo = (domainHealthRes.data || []).map((d: any) =>
        `${d.domain}: ${d.days_to_domain_expiry != null ? d.days_to_domain_expiry + " days to expiry" : "no expiry data"}`
      ).join("\n  ");

      const recentAlerts = (alertsRes.data || []).slice(0, 5).map((a: any) =>
        `[${a.severity}] ${a.title} (${a.date})`
      ).join("\n  ");

      const nightlySummary = (nightlySummaryRes.data || [])[0];
      const nightlyText = nightlySummary?.summary_text || "No nightly summary available.";
      const nightlyFindings = JSON.stringify(nightlySummary?.top_findings || []);
      const nightlyActions = JSON.stringify(nightlySummary?.suggested_actions || []);

      const leadSourceCounts: Record<string, number> = {};
      (recentLeadsRes.data || []).forEach((l: any) => {
        const src = l.utm_source || l.source || "direct";
        leadSourceCounts[src] = (leadSourceCounts[src] || 0) + 1;
      });
      const leadSourcesSummary = Object.entries(leadSourceCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([src, count]) => `${src}: ${count} leads`).join(", ");

      metricsContext = `
CLIENT: ${orgName}
TRACKED SITES: ${siteDomains || "None"}

LIVE DASHBOARD METRICS (last 7 days vs previous 7 days):

TRAFFIC & CONVERSIONS:
- Sessions this week: ${sessionsThisWeek} | Last week: ${sessionsLastWeek} | Change: ${sessionsLastWeek > 0 ? (((sessionsThisWeek - sessionsLastWeek) / sessionsLastWeek) * 100).toFixed(1) : "N/A"}%
- Leads this week: ${leadsThisWeek} | Last week: ${leadsLastWeek} | Change: ${leadsLastWeek > 0 ? (((leadsThisWeek - leadsLastWeek) / leadsLastWeek) * 100).toFixed(1) : "N/A"}%
- CVR this week: ${(cvrThisWeek * 100).toFixed(2)}% | Last week: ${(cvrLastWeek * 100).toFixed(2)}%
- Lead sources (recent 30): ${leadSourcesSummary || "None"}

ECOMMERCE (if applicable):
- Orders this week: ${ordersThisWeek} | Last week: ${ordersPrevWeek}
- Revenue this week: $${revenueThisWeek.toFixed(2)} | Last week: $${revenuePrevWeek.toFixed(2)}

TOP PAGES (30 days):
  ${topPages || "No pageview data"}

TOP TRAFFIC SOURCES (30 days):
  ${topSources || "No source data"}

FORMS (${formsRes.count || 0} active):
  ${formsList || "None configured"}

GOALS & CONVERSIONS:
  Configured goals: ${(goalsRes.data || []).length}
  ${goalsList || "No goals configured"}
  Goal completions this week:
  ${goalCompSummary || "None"}

SEO:
  ${seoContext}

BROKEN LINKS:
  ${brokenLinksList || "None detected"}

SITE HEALTH:
  Active incidents: ${activeIncidents || "None — all clear"}
  Domain health: ${domainInfo || "No domain data"}
  Recent alerts: ${recentAlerts || "None"}

LATEST NIGHTLY SUMMARY:
  ${nightlyText}
  Key findings: ${nightlyFindings}
  Suggested actions: ${nightlyActions}
`;

      // Cache the context for 1 hour
      await adminClient.from("ai_usage_log").insert({
        org_id: orgId,
        function_name: CONTEXT_CACHE_KEY,
        cached: true,
        response_cache: metricsContext,
        metrics_hash: "context",
      });
    }

    // === Model tiering: cheaper model for follow-ups ===
    const model = messages.length > 2
      ? "google/gemini-2.5-flash-lite"
      : "google/gemini-3-flash-preview";

    const systemPrompt = `You are the ACTV TRKR AI assistant — a friendly, knowledgeable analytics advisor embedded in a website performance tracking dashboard. You help users understand their website metrics, traffic, leads, conversion rates, forms, SEO health, site uptime, broken links, goals, ecommerce performance, and overall digital marketing performance.

${metricsContext}

Rules:
- Be conversational, helpful, and concise (2-4 sentences per answer unless the user asks for detail).
- Reference the actual live metrics above when answering questions about performance.
- You have FULL access to all the site's analytics data shown above. Use it to give specific, data-backed answers.
- IMPORTANT: The user IS the client named at the top. Address them in second person ("you", "your") and refer to their organization in first-person plural ("we", "our") when echoing back. Do NOT refer to them in third person by the org name (e.g. never say "${orgName} is…" or "My Organization is…").
- When asked "how am I doing", give a comprehensive health check covering traffic, leads, conversions, SEO score, site health, and any active issues.
- When asked about SEO, reference the actual scan results and broken links above.
- When asked about goals or conversions, reference the configured goals and completion data.
- When asked about revenue or orders, reference the ecommerce data.
- Suggest actionable improvements based on the actual data patterns you see.
- If something looks concerning (traffic drops, low SEO score, broken links, expiring domains), proactively mention it.
- Use calm, encouraging, professional language. Never alarming words.
- You MUST respond in the language specified: ${language || "en"}. Match the user's language naturally.`;

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
          model,
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
          { status: 429, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
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

    // Log usage
    await adminClient.from("ai_usage_log").insert({
      org_id: orgId,
      function_name: FUNCTION_NAME,
      cached: false,
      metrics_hash: "msg",
    });

    return new Response(response.body, {
      headers: { ...appCorsHeaders(req), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chatbot error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
