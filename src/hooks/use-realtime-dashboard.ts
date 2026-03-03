import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Real-time dashboard data — queries raw tables directly for live metrics.
 * No dependency on nightly aggregation.
 */
export function useRealtimeDashboard(orgId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["realtime_dashboard", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return null;

      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      // Parallel queries for all metrics
      const [pvRes, sessRes, leadRes, sessDetail, leadDetail, pvCountry] = await Promise.all([
        // Pageview count
        supabase.from("pageviews").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd),

        // Session count
        supabase.from("sessions").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd),

        // Lead count
        supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd),

        // Session details for source/campaign/page breakdowns
        supabase.from("sessions")
          .select("session_id, started_at, utm_source, utm_campaign, landing_page_path, landing_referrer_domain")
          .eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd),

        // Lead details for source/campaign breakdowns
        supabase.from("leads")
          .select("submitted_at, source, utm_source, utm_campaign, page_path, referrer_domain, session_id")
          .eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd),

        // Pageview country data
        supabase.from("pageviews")
          .select("country_code, session_id")
          .eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd)
          .not("country_code", "is", null),
      ]);

      const totalPageviews = pvRes.count || 0;
      const totalSessions = sessRes.count || 0;
      const totalLeads = leadRes.count || 0;
      const sessions = sessDetail.data || [];
      const leads = leadDetail.data || [];
      const pvCountryData = pvCountry.data || [];

      // Daily breakdown
      const dailyMap: Record<string, { sessions: number; leads: number; pageviews: number }> = {};

      sessions.forEach((s: any) => {
        const d = s.started_at?.split("T")[0];
        if (!d) return;
        if (!dailyMap[d]) dailyMap[d] = { sessions: 0, leads: 0, pageviews: 0 };
        dailyMap[d].sessions++;
      });

      leads.forEach((l: any) => {
        const d = l.submitted_at?.split("T")[0];
        if (!d) return;
        if (!dailyMap[d]) dailyMap[d] = { sessions: 0, leads: 0, pageviews: 0 };
        dailyMap[d].leads++;
      });

      // Build session_id → source lookup for lead attribution
      const sessionSourceLookup: Record<string, string> = {};
      sessions.forEach((s: any) => {
        if (s.session_id) {
          sessionSourceLookup[s.session_id] = s.utm_source || s.landing_referrer_domain || "direct";
        }
      });

      // Source breakdown
      const sourceMap: Record<string, { sessions: number; leads: number }> = {};
      sessions.forEach((s: any) => {
        const src = s.utm_source || s.landing_referrer_domain || "direct";
        if (!sourceMap[src]) sourceMap[src] = { sessions: 0, leads: 0 };
        sourceMap[src].sessions++;
      });
      leads.forEach((l: any) => {
        // Use the session's source when available, otherwise fall back to lead's own fields
        const src = (l.session_id && sessionSourceLookup[l.session_id])
          ? sessionSourceLookup[l.session_id]
          : (l.source || l.utm_source || l.referrer_domain || "direct");
        if (!sourceMap[src]) sourceMap[src] = { sessions: 0, leads: 0 };
        sourceMap[src].leads++;
      });

      // Campaign breakdown
      const campaignMap: Record<string, { sessions: number; leads: number }> = {};
      sessions.forEach((s: any) => {
        if (s.utm_campaign) {
          if (!campaignMap[s.utm_campaign]) campaignMap[s.utm_campaign] = { sessions: 0, leads: 0 };
          campaignMap[s.utm_campaign].sessions++;
        }
      });
      leads.forEach((l: any) => {
        if (l.utm_campaign) {
          if (!campaignMap[l.utm_campaign]) campaignMap[l.utm_campaign] = { sessions: 0, leads: 0 };
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

      // Country breakdown
      const countrySessionMap: Record<string, Set<string>> = {};
      pvCountryData.forEach((pv: any) => {
        const cc = pv.country_code || "XX";
        const sid = pv.session_id || cc;
        if (!countrySessionMap[cc]) countrySessionMap[cc] = new Set();
        countrySessionMap[cc].add(sid);
      });

      return {
        totalPageviews,
        totalSessions,
        totalLeads,
        dailyMap,
        sources: Object.entries(sourceMap)
          .map(([source, v]) => ({ source, ...v, cvr: v.sessions > 0 ? v.leads / v.sessions : 0 }))
          .sort((a, b) => b.sessions - a.sessions),
        campaigns: Object.entries(campaignMap)
          .map(([campaign, v]) => ({ campaign, ...v, cvr: v.sessions > 0 ? v.leads / v.sessions : 0 }))
          .sort((a, b) => b.sessions - a.sessions),
        pages: Object.entries(pageMap)
          .map(([path, v]) => ({ path, ...v, cvr: v.sessions > 0 ? v.leads / v.sessions : 0 }))
          .sort((a, b) => b.sessions - a.sessions),
        countries: Object.entries(countrySessionMap)
          .map(([countryCode, s]) => ({ countryCode, sessions: s.size }))
          .sort((a, b) => b.sessions - a.sessions),
      };
    },
    enabled: !!orgId,
    refetchInterval: 15_000, // auto-refresh every 15 seconds
  });
}
