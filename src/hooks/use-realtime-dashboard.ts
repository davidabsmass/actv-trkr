import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format as fnsFormat, parseISO } from "date-fns";
import { expandSiteDomains, isSelfReferral, canonicalSource } from "@/lib/source-normalize";

/**
 * Real-time dashboard data — optimised for speed.
 *
 * Strategy:
 *  • Head-only COUNT queries for KPI totals (zero row transfer).
 *  • kpi_daily aggregate table for the daily trend chart.
 *  • Capped SELECT queries (top 200) for source / campaign / page breakdowns.
 *  • traffic_daily for country data (already aggregated).
 *
 * Previous approach fetched ALL raw rows via pagination loops — tens of
 * thousands of rows downloaded and processed client-side on every load.
 */
export function useRealtimeDashboard(
  orgId: string | null,
  startDate: string,
  endDate: string,
  installCutoff?: string | null
) {
  return useQuery({
    queryKey: ["realtime_dashboard", orgId, startDate, endDate, installCutoff || null],
    queryFn: async () => {
      if (!orgId) return null;

      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      // Effective lower bound for "fresh" leads — the later of window start
      // and install date. Used so Form Fills + CVR exclude historical imports.
      // Anchored on `submitted_at` (real submission time), NOT `created_at`
      // (which is the import timestamp for backfilled WP leads and would let
      // thousands of pre-install submissions count as "fresh").
      const leadsLowerBound =
        installCutoff && new Date(installCutoff) > new Date(dayStart)
          ? installCutoff
          : dayStart;
      const windowEntirelyBeforeInstall = !!(
        installCutoff && new Date(installCutoff) > new Date(dayEnd)
      );
      const installCutoffDate = installCutoff ? installCutoff.slice(0, 10) : null;

      // ── 1. Parallel lightweight queries ──────────────────────────────
      const [
        pvRes,
        sessRes,
        leadRes,
        kpiRes,
        countryRes,
        sitesRes,
        sessionsBreakdown,
        leadsBreakdown,
        pageviewBreakdown,
      ] = await Promise.all([
        // Head-only counts
        supabase
          .from("pageviews")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd),

        supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd),

        windowEntirelyBeforeInstall
          ? Promise.resolve({ count: 0 } as any)
          : supabase
              .from("leads")
              .select("*", { count: "exact", head: true })
              .eq("org_id", orgId)
              .neq("status", "trashed")
              // Anchor on submitted_at so backfilled WP leads (with old
              // submission times but recent created_at) are correctly excluded.
              .gte("submitted_at", leadsLowerBound)
              .lte("submitted_at", dayEnd),

        // Daily aggregates for trend chart
        supabase
          .from("kpi_daily")
          .select("date, metric, value")
          .eq("org_id", orgId)
          .gte("date", startDate)
          .lte("date", endDate)
          .in("metric", ["sessions", "leads", "pageviews"])
          .order("date"),

        // Country data (already aggregated)
        supabase
          .from("traffic_daily")
          .select("dimension, value")
          .eq("org_id", orgId)
          .eq("metric", "sessions_by_country")
          .gte("date", startDate)
          .lte("date", endDate)
          .not("dimension", "is", null),

        // Site domains for self-referral filtering
        supabase.from("sites").select("domain").eq("org_id", orgId),

        // Capped breakdowns — top 500 sessions for source/campaign/page
        supabase
          .from("sessions")
          .select(
            "session_id, started_at, utm_source, utm_campaign, landing_page_path, landing_referrer_domain"
          )
          .eq("org_id", orgId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd)
          .order("started_at", { ascending: false })
          .limit(500),

        // Capped leads for attribution — only fresh leads (since install)
        windowEntirelyBeforeInstall
          ? Promise.resolve({ data: [] } as any)
          : supabase
              .from("leads")
              .select(
                "submitted_at, source, utm_source, utm_campaign, page_path, referrer_domain, session_id"
              )
              .eq("org_id", orgId)
              .neq("status", "trashed")
              .gte("submitted_at", leadsLowerBound)
              .lte("submitted_at", dayEnd)
              .order("submitted_at", { ascending: false })
              .limit(500),

        // Capped pageviews for avg active seconds per page
        supabase
          .from("pageviews")
          .select("page_path, active_seconds")
          .eq("org_id", orgId)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd)
          .order("occurred_at", { ascending: false })
          .limit(500),
      ]);

      const totalPageviews = pvRes.count || 0;
      const totalSessions = sessRes.count || 0;
      const totalLeads = leadRes.count || 0;

      // ── 2. Build daily trend map from kpi_daily ──────────────────────
      const dailyMap: Record<
        string,
        { sessions: number; leads: number; pageviews: number }
      > = {};

      // Pre-populate all dates
      let cursor = parseISO(startDate);
      const rangeEnd = parseISO(endDate);
      while (cursor <= rangeEnd) {
        dailyMap[fnsFormat(cursor, "yyyy-MM-dd")] = {
          sessions: 0,
          leads: 0,
          pageviews: 0,
        };
        cursor = addDays(cursor, 1);
      }

      // Fill from aggregated kpi_daily rows. Leads from days BEFORE install
      // are dropped so the trend chart matches the headline KPIs.
      const kpiRows = kpiRes.data || [];
      const kpiDatesSet = new Set<string>();
      kpiRows.forEach((row: any) => {
        const d = row.date;
        kpiDatesSet.add(d);
        if (!dailyMap[d])
          dailyMap[d] = { sessions: 0, leads: 0, pageviews: 0 };
        if (row.metric === "sessions") dailyMap[d].sessions += Number(row.value);
        if (row.metric === "leads") {
          if (installCutoffDate && d < installCutoffDate) {
            // pre-install day: never count historical leads
          } else {
            dailyMap[d].leads += Number(row.value);
          }
        }
        if (row.metric === "pageviews")
          dailyMap[d].pageviews += Number(row.value);
      });

      // Patch today's data with real-time counts from raw tables
      const todayStr = fnsFormat(new Date(), "yyyy-MM-dd");
      if (dailyMap[todayStr]) {
        const todayStart = `${todayStr}T00:00:00Z`;
        const todayEnd = `${todayStr}T23:59:59.999Z`;
        const [todayPv, todaySess, todayLeads] = await Promise.all([
          supabase.from("pageviews").select("*", { count: "exact", head: true })
            .eq("org_id", orgId).gte("occurred_at", todayStart).lte("occurred_at", todayEnd),
          supabase.from("sessions").select("*", { count: "exact", head: true })
            .eq("org_id", orgId).gte("started_at", todayStart).lte("started_at", todayEnd),
          supabase.from("leads").select("*", { count: "exact", head: true })
            .eq("org_id", orgId).neq("status", "trashed")
            .gte("submitted_at", installCutoffDate && todayStart < leadsLowerBound ? leadsLowerBound : todayStart)
            .lte("submitted_at", todayEnd),
        ]);
        dailyMap[todayStr] = {
          pageviews: todayPv.count || 0,
          sessions: todaySess.count || 0,
          leads: todayLeads.count || 0,
        };
      }

      // Fallback: find days with no kpi_daily data and fill from raw tables
      // kpi_daily may only cover recent dates; raw tables have the full history.
      const missingDays = Object.keys(dailyMap).filter(
        (d) => !kpiDatesSet.has(d) && d !== todayStr
      );

      if (missingDays.length > 0) {
        // Batch-count raw sessions, leads, pageviews for each missing day
        // Group into chunks to avoid too many parallel queries
        const CHUNK = 10;
        for (let i = 0; i < missingDays.length; i += CHUNK) {
          const chunk = missingDays.slice(i, i + CHUNK);
          const results = await Promise.all(
            chunk.flatMap((day) => {
              const ds = `${day}T00:00:00Z`;
              const de = `${day}T23:59:59.999Z`;
              const dayBeforeInstall =
                installCutoffDate && day < installCutoffDate;
              return [
                supabase.from("sessions").select("*", { count: "exact", head: true })
                  .eq("org_id", orgId).gte("started_at", ds).lte("started_at", de),
                dayBeforeInstall
                  ? Promise.resolve({ count: 0 } as any)
                  : supabase.from("leads").select("*", { count: "exact", head: true })
                      .eq("org_id", orgId).neq("status", "trashed")
                      .gte("submitted_at", ds < leadsLowerBound ? leadsLowerBound : ds)
                      .lte("submitted_at", de),
                supabase.from("pageviews").select("*", { count: "exact", head: true })
                  .eq("org_id", orgId).gte("occurred_at", ds).lte("occurred_at", de),
              ];
            })
          );
          chunk.forEach((day, idx) => {
            dailyMap[day] = {
              sessions: results[idx * 3]?.count || 0,
              leads: results[idx * 3 + 1]?.count || 0,
              pageviews: results[idx * 3 + 2]?.count || 0,
            };
          });
        }
      }

      // ── 3. Self-referral filtering ───────────────────────────────────
      // Build the full set of host variants we should treat as "this site"
      // (apex, www., subdomains, registrable root) so referrers like
      // `www.example.com` or `blog.example.com` don't show up as a top
      // traffic source for `example.com`.
      const ownedRoots = expandSiteDomains((sitesRes.data || []).map((s: any) => s.domain));
      let selfReferralSessions = 0;
      let selfReferralLeads = 0;

      // Resolve a raw source/referrer into its canonical display label.
      // Self-referrals collapse into "Direct"; everything else is normalized
      // (e.g. www.google.com + cn.bing.com → Google + Bing).
      const resolveSource = (raw: string, kind: "session" | "lead" = "session") => {
        if (!raw) return "Direct";
        if (isSelfReferral(raw, ownedRoots)) {
          if (kind === "session") selfReferralSessions++;
          else selfReferralLeads++;
          return "Direct";
        }
        return canonicalSource(raw);
      };

      const sessions = sessionsBreakdown.data || [];
      const leads = leadsBreakdown.data || [];

      // ── 4. Source / campaign / page breakdowns ───────────────────────
      // Cache resolved source per session so leads attributed via session_id
      // get the same label (and don't double-count toward self-referral).
      const sessionSourceLookup: Record<string, string> = {};
      sessions.forEach((s: any) => {
        if (s.session_id) {
          sessionSourceLookup[s.session_id] = resolveSource(
            s.utm_source || s.landing_referrer_domain || "direct",
            "session"
          );
        }
      });

      // Source breakdown
      const sourceMap: Record<string, { sessions: number; leads: number }> = {};
      sessions.forEach((s: any) => {
        const src = s.session_id && sessionSourceLookup[s.session_id]
          ? sessionSourceLookup[s.session_id]
          : resolveSource(s.utm_source || s.landing_referrer_domain || "direct", "session");
        if (!sourceMap[src]) sourceMap[src] = { sessions: 0, leads: 0 };
        sourceMap[src].sessions++;
      });
      leads.forEach((l: any) => {
        const raw =
          l.session_id && sessionSourceLookup[l.session_id]
            ? sessionSourceLookup[l.session_id]
            : resolveSource(
                l.source || l.utm_source || l.referrer_domain || "direct",
                "lead"
              );
        if (!sourceMap[raw]) sourceMap[raw] = { sessions: 0, leads: 0 };
        sourceMap[raw].leads++;
      });

      // Campaign breakdown
      const campaignMap: Record<
        string,
        { sessions: number; leads: number }
      > = {};
      sessions.forEach((s: any) => {
        if (s.utm_campaign) {
          if (!campaignMap[s.utm_campaign])
            campaignMap[s.utm_campaign] = { sessions: 0, leads: 0 };
          campaignMap[s.utm_campaign].sessions++;
        }
      });
      leads.forEach((l: any) => {
        if (l.utm_campaign) {
          if (!campaignMap[l.utm_campaign])
            campaignMap[l.utm_campaign] = { sessions: 0, leads: 0 };
          campaignMap[l.utm_campaign].leads++;
        }
      });

      // Page breakdown
      const pageMap: Record<string, { sessions: number; leads: number }> = {};
      sessions.forEach((s: any) => {
        const p = s.landing_page_path || "(unknown)";
        if (!pageMap[p]) pageMap[p] = { sessions: 0, leads: 0 };
        pageMap[p].sessions++;
      });
      leads.forEach((l: any) => {
        const p = l.page_path || "(unknown)";
        if (!pageMap[p]) pageMap[p] = { sessions: 0, leads: 0 };
        pageMap[p].leads++;
      });

      // Avg active seconds per page
      const pageTimeMap: Record<string, { total: number; count: number }> = {};
      (pageviewBreakdown.data || []).forEach((pv: any) => {
        const p = pv.page_path || "(unknown)";
        if (pv.active_seconds != null && pv.active_seconds > 0) {
          if (!pageTimeMap[p]) pageTimeMap[p] = { total: 0, count: 0 };
          pageTimeMap[p].total += pv.active_seconds;
          pageTimeMap[p].count++;
        }
      });

      // ── 5. Country breakdown ─────────────────────────────────────────
      const countryTotals: Record<string, number> = {};
      (countryRes.data || []).forEach((row: any) => {
        const cc = row.dimension || "XX";
        countryTotals[cc] =
          (countryTotals[cc] || 0) + Number(row.value || 0);
      });

      // ── 6. Return ────────────────────────────────────────────────────
      return {
        totalPageviews,
        totalSessions,
        totalLeads,
        dailyMap,
        sources: Object.entries(sourceMap)
          .map(([source, v]) => ({
            source,
            ...v,
            cvr: v.sessions > 0 ? Math.min(1, v.leads / v.sessions) : 0,
          }))
          .sort((a, b) => b.sessions - a.sessions),
        campaigns: Object.entries(campaignMap)
          .map(([campaign, v]) => ({
            campaign,
            ...v,
            cvr: v.sessions > 0 ? Math.min(1, v.leads / v.sessions) : 0,
          }))
          .sort((a, b) => b.sessions - a.sessions),
        pages: Object.entries(pageMap)
          .map(([path, v]) => {
            const timeData = pageTimeMap[path];
            const avgActiveSeconds = timeData
              ? Math.round(timeData.total / timeData.count)
              : null;
            return {
              path,
              ...v,
              cvr: v.sessions > 0 ? Math.min(1, v.leads / v.sessions) : 0,
              avgActiveSeconds,
            };
          })
          .sort((a, b) => b.sessions - a.sessions),
        countries: Object.entries(countryTotals)
          .map(([countryCode, sessions]) => ({ countryCode, sessions }))
          .sort((a, b) => b.sessions - a.sessions),
        selfReferralSessions,
        selfReferralLeads,
      };
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}
