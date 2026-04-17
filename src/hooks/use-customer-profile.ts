import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useSites } from "@/hooks/use-dashboard-data";

interface CustomerProfile {
  id: string;
  org_id: string;
  customer_type: string | null;
  website_count_range: string | null;
  acquisition_source: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  dismissed_count: number;
  last_prompted_at: string | null;
}

const MAX_DISMISSALS = 3;
const RE_PROMPT_DAYS = 7;

export function useCustomerProfile() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["customer_profile", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("customer_profiles" as any)
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CustomerProfile | null;
    },
    enabled: !!orgId,
  });

  const shouldShowPrompt = (() => {
    if (isLoading) return false;
    if (!profile) return true; // No record yet — show prompt
    if (profile.completed_at) return false; // Already completed
    if (profile.dismissed_count >= MAX_DISMISSALS) return false; // Too many dismissals
    if (profile.skipped_at || profile.last_prompted_at) {
      // Re-prompt after RE_PROMPT_DAYS
      const lastInteraction = profile.skipped_at || profile.last_prompted_at;
      if (lastInteraction) {
        const daysSince = (Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince >= RE_PROMPT_DAYS;
      }
    }
    return true;
  })();

  const trackEvent = async (eventType: string, extra?: Record<string, any>) => {
    if (!orgId || !user?.id) return;
    await supabase.from("user_activity_log" as any).insert({
      user_id: user.id,
      org_id: orgId,
      activity_type: eventType,
      page_path: window.location.pathname,
      page_title: "Customer Profile Prompt",
      details: {
        ...extra,
        customer_type: profile?.customer_type,
        website_count_range: profile?.website_count_range,
        acquisition_source: profile?.acquisition_source,
      },
    });
  };

  const upsertProfile = async (updates: Record<string, any>) => {
    if (!orgId) throw new Error("No org");
    const { error } = await supabase
      .from("customer_profiles" as any)
      .upsert({ org_id: orgId, ...updates }, { onConflict: "org_id" });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["customer_profile", orgId] });
  };

  const completeProfile = useMutation({
    mutationFn: async (data: {
      customer_type: string;
      website_count_range: string;
      acquisition_source?: string;
    }) => {
      await upsertProfile({
        ...data,
        completed_at: new Date().toISOString(),
        skipped_at: null,
      });
      await trackEvent("customer_profile_completed", data);
    },
  });

  const skipProfile = useMutation({
    mutationFn: async () => {
      await upsertProfile({
        skipped_at: new Date().toISOString(),
        last_prompted_at: new Date().toISOString(),
      });
      await trackEvent("customer_profile_skipped");
    },
  });

  const dismissProfile = useMutation({
    mutationFn: async () => {
      const newCount = (profile?.dismissed_count ?? 0) + 1;
      await upsertProfile({
        dismissed_count: newCount,
        last_prompted_at: new Date().toISOString(),
      });
      await trackEvent("customer_profile_dismissed", { dismissed_count: newCount });
    },
  });

  const markPromptShown = async () => {
    await upsertProfile({ last_prompted_at: new Date().toISOString() });
    await trackEvent("customer_profile_prompt_shown");
  };

  return {
    profile,
    isLoading,
    shouldShowPrompt,
    completeProfile,
    skipProfile,
    dismissProfile,
    markPromptShown,
  };
}
