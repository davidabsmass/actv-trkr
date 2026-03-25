import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";

const PREVIEW_ORG_ID = "00000000-0000-0000-0000-000000000000";
function isPreviewOrg(orgId: string | null) {
  return orgId === PREVIEW_ORG_ID;
}

export type PrimaryFocus = "lead_volume" | "marketing_impact" | "conversion_performance" | "paid_optimization";

// Keep old type for backward compat
export type PrimaryGoal = "get_more_leads" | "prove_roi" | "improve_conversion" | "reduce_ad_waste";

export interface SiteSettings {
  id: string;
  org_id: string;
  primary_goal: PrimaryGoal;
  primary_focus: PrimaryFocus;
  notification_preferences: {
    weekly_summary: boolean;
    daily_digest: boolean;
    lead_realtime_email?: boolean;
    lead_email_digest?: boolean;
    lead_browser_push?: boolean;
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

/** Log a user input event for audit trail */
export async function logUserInputEvent(
  orgId: string,
  eventType: string,
  eventPayload: Record<string, any>
) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("user_input_events").insert({
    org_id: orgId,
    user_id: user?.id || null,
    event_type: eventType,
    event_payload: eventPayload,
  });
}
