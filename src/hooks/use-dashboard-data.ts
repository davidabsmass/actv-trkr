import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useOrgs() {
  return useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTrafficDaily(orgId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["traffic_daily", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("traffic_daily")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

export function useKpiDaily(orgId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["kpi_daily", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("kpi_daily")
        .select("*")
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

export function useAlerts(orgId: string | null) {
  return useQuery({
    queryKey: ["alerts", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("org_id", orgId)
        .order("date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

export function useLeads(orgId: string | null, limit = 50) {
  return useQuery({
    queryKey: ["leads", orgId, limit],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("org_id", orgId)
        .order("submitted_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

export function useSites(orgId: string | null) {
  return useQuery({
    queryKey: ["sites", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

export function useForms(orgId: string | null) {
  return useQuery({
    queryKey: ["forms", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

export function useCountryData(orgId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["country_data", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("traffic_daily")
        .select("*")
        .eq("org_id", orgId)
        .eq("metric", "sessions_by_country")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("value", { ascending: false });
      if (error) throw error;
      // Aggregate across dates
      const map: Record<string, number> = {};
      data?.forEach((row) => {
        const cc = row.dimension || "XX";
        map[cc] = (map[cc] || 0) + Number(row.value);
      });
      return Object.entries(map)
        .map(([countryCode, sessions]) => ({ countryCode, sessions }))
        .sort((a, b) => b.sessions - a.sessions);
    },
    enabled: !!orgId,
  });
}

/** Fallback: count raw pageviews + sessions when aggregated tables are empty */
export function useRawCounts(orgId: string | null, startDate: string, endDate: string, hasAggregatedData: boolean) {
  return useQuery({
    queryKey: ["raw_counts", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return null;
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      const [pvRes, sessRes, leadRes] = await Promise.all([
        supabase.from("pageviews").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd),
        supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", dayStart).lte("submitted_at", dayEnd),
      ]);

      return {
        pageviews: pvRes.count || 0,
        sessions: sessRes.count || 0,
        leads: leadRes.count || 0,
      };
    },
    enabled: !!orgId && !hasAggregatedData,
  });
}
