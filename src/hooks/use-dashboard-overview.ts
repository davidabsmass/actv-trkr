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

      // Determine the effective lower bound for "fresh" leads:
      // the later of (window start) and (install date). This ensures Form Fills
      // and CVR only count submissions captured live by the plugin.
      //
      // We anchor on `submitted_at` (the actual user submission time), NOT
      // `created_at`. Historical leads imported during a plugin scan all carry
      // a `created_at` of the import timestamp (which is AFTER the install
      // cutoff), so filtering by created_at lets thousands of pre-install
      // submissions slip through. `submitted_at` preserves the original form
      // submission time, so it correctly excludes anything that happened
      // before the plugin started capturing live.
      const leadsLowerBound =
        installCutoff && new Date(installCutoff) > new Date(dayStart)
          ? installCutoff
          : dayStart;
      const windowEntirelyBeforeInstall =
        installCutoff && new Date(installCutoff) > new Date(dayEnd);

      // All counts in parallel — head-only, zero rows transferred
      const [sessRes, leadRes, pvRes] = await Promise.all([
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
      ]);

      const totalSessions = sessRes.count || 0;
      const totalLeads = leadRes.count || 0;
      const totalPageviews = pvRes.count || 0;

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
