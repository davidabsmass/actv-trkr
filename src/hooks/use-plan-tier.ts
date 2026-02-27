import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";

export type PlanTier = "core" | "performance" | "growth";

const FEATURES: Record<string, PlanTier[]> = {
  dashboard: ["core", "performance", "growth"],
  entries: ["core", "performance", "growth"],
  reports: ["core", "performance", "growth"],
  exports: ["core", "performance", "growth"],
  attribution: ["performance", "growth"],
  revenue_estimation: ["performance", "growth"],
  ai_insights: ["performance", "growth"],
  funnel_view: ["growth"],
  multi_location_map: ["growth"],
  white_label_exports: ["growth"],
  agency_benchmark: ["growth"],
};

export function usePlanTier() {
  const { orgId } = useOrg();

  const { data: sites } = useQuery({
    queryKey: ["sites_plan", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("plan_tier")
        .eq("org_id", orgId);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Use the highest tier across all sites for this org
  const tierOrder: PlanTier[] = ["core", "performance", "growth"];
  const activeTier: PlanTier = sites?.reduce<PlanTier>((max, s) => {
    const tier = (s.plan_tier as PlanTier) || "core";
    return tierOrder.indexOf(tier) > tierOrder.indexOf(max) ? tier : max;
  }, "core") ?? "core";

  const hasFeature = (feature: string): boolean => {
    const allowed = FEATURES[feature];
    if (!allowed) return true;
    return allowed.includes(activeTier);
  };

  return { activeTier, hasFeature };
}
