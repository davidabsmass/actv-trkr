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
