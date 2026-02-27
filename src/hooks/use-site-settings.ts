import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";

export type PrimaryGoal = "get_more_leads" | "prove_roi" | "improve_conversion" | "reduce_ad_waste";

export interface SiteSettings {
  id: string;
  org_id: string;
  primary_goal: PrimaryGoal;
  notification_preferences: {
    weekly_summary: boolean;
    break_alerts: boolean;
    daily_digest: boolean;
  };
  onboarding_completed: boolean;
}

export function useSiteSettings() {
  const { orgId } = useOrg();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["site_settings", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SiteSettings | null;
    },
    enabled: !!orgId,
  });

  return { settings, isLoading, needsOnboarding: !isLoading && orgId && !settings?.onboarding_completed };
}

export function useUpdateSiteSettings() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<SiteSettings, "id" | "org_id">>) => {
      if (!orgId) throw new Error("No org");
      
      // Upsert
      const { data, error } = await supabase
        .from("site_settings")
        .upsert({ org_id: orgId, ...updates }, { onConflict: "org_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site_settings", orgId] });
    },
  });
}
