import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTrafficDaily(clientId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["traffic_daily", clientId, startDate, endDate],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("traffic_daily")
        .select("*")
        .eq("client_id", clientId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useKpiDaily(clientId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["kpi_daily", clientId, startDate, endDate],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("kpi_daily")
        .select("*")
        .eq("client_id", clientId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useAlerts(clientId: string | null) {
  return useQuery({
    queryKey: ["alerts", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("client_id", clientId)
        .eq("dismissed", false)
        .order("date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useForecasts(clientId: string | null) {
  return useQuery({
    queryKey: ["forecasts", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("forecasts")
        .select("*")
        .eq("client_id", clientId)
        .order("run_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}
