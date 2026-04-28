import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight dashboard overview hook.
 * Uses head-only COUNT queries for KPIs (no row downloads)
 * and fetches only top-N source/campaign breakdowns.
 *
 * `installCutoff` (ISO string) is applied to the leads count so headline
 * metrics like Form Fills and Conversion Rate only reflect data captured
 * AFTER the plugin was installed. Without this, historical leads imported
 * from WordPress would inflate Form Fills and produce nonsensical CVR
 * (e.g. 4,377 form fills against 72 sessions).
 */
export function useDashboardOverview(
  orgId: string | null,
  startDate: string,
  endDate: string,
  installCutoff?: string | null
) {
  return useQuery({
    queryKey: ["dashboard_overview", orgId, startDate, endDate, installCutoff || null],
    queryFn: async () => {
      if (!orgId) return null;

      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      // Headline KPIs (sessions/leads/pageviews tiles) keep their existing
      // install-cutoff behavior — they represent "what we captured live" since
      // install. Anchored on `submitted_at` for leads to correctly exclude
      // historical WP imports whose `created_at` post-dates install.
      const leadsLowerBound =
        installCutoff && new Date(installCutoff) > new Date(dayStart)
          ? installCutoff
          : dayStart;
      const windowEntirelyBeforeInstall =
        installCutoff && new Date(installCutoff) > new Date(dayEnd);

      // ── Funnel window: the like-for-like comparison window ──────────────
      // Both sessions AND leads in the funnel must use the same effective
      // window so the conversion ratio is fair. We clamp the window start to
      // the install date and only render the funnel if at least 50% of the
      // requested range is post-install — otherwise the comparison is
      // misleading (e.g. 30 days of sessions vs 3 days of leads).
      const funnelStartIso =
        installCutoff && new Date(installCutoff) > new Date(dayStart)
          ? installCutoff
          : dayStart;
      const funnelEndIso = dayEnd;
      const MS_PER_DAY = 86_400_000;
      const requestedDays = Math.max(
        1,
        Math.round((new Date(dayEnd).getTime() - new Date(dayStart).getTime()) / MS_PER_DAY)
      );
      const effectiveDays = Math.max(
        0,
        Math.round((new Date(funnelEndIso).getTime() - new Date(funnelStartIso).getTime()) / MS_PER_DAY)
      );
      const funnelSufficient =
        !windowEntirelyBeforeInstall && effectiveDays >= Math.max(1, Math.ceil(requestedDays * 0.5));

      // All counts in parallel — head-only, zero rows transferred
      const [sessRes, leadRes, pvRes, funnelSessRes, funnelLeadRes] = await Promise.all([
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
              .gte("submitted_at", leadsLowerBound)
              .lte("submitted_at", dayEnd),
        supabase
          .from("pageviews")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd),
        // Funnel-scoped sessions (same window as funnel leads)
        !funnelSufficient
          ? Promise.resolve({ count: 0 } as any)
          : supabase
              .from("sessions")
              .select("*", { count: "exact", head: true })
              .eq("org_id", orgId)
              .gte("started_at", funnelStartIso)
              .lte("started_at", funnelEndIso),
        // Funnel-scoped leads (same window as funnel sessions)
        !funnelSufficient
          ? Promise.resolve({ count: 0 } as any)
          : supabase
              .from("leads")
              .select("*", { count: "exact", head: true })
              .eq("org_id", orgId)
              .neq("status", "trashed")
              .gte("submitted_at", funnelStartIso)
              .lte("submitted_at", funnelEndIso),
      ]);

      const totalSessions = sessRes.count || 0;
      const totalLeads = leadRes.count || 0;
      const totalPageviews = pvRes.count || 0;
      const funnelSessions = funnelSessRes.count || 0;
      const funnelLeads = funnelLeadRes.count || 0;

      // Fetch only the top 10 sources (lightweight — max 10 rows)
      const { data: topSessions } = await supabase
        .from("sessions")
        .select("utm_source, landing_referrer_domain")
        .eq("org_id", orgId)
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd)
        .limit(1000);

      // Build source breakdown from sample
      const sourceMap: Record<string, number> = {};
      (topSessions || []).forEach((s: any) => {
        const src = s.utm_source || s.landing_referrer_domain || "direct";
        sourceMap[src] = (sourceMap[src] || 0) + 1;
      });

      const sources = Object.entries(sourceMap)
        .map(([source, sessions]) => ({ source, sessions, leads: 0 }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 10);

      return { totalSessions, totalLeads, totalPageviews, sources };
    },
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
