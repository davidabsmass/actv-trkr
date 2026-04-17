import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionState {
  subscribed: boolean;
  billingExempt: boolean;
  subscriptionStatus: string | null;
  shouldForceLogout: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  isLoading: boolean;
}

export function useSubscription(userId?: string | null): SubscriptionState {
  const isAuthenticated = Boolean(userId);

  const { data, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["subscription_status", userId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      return data as {
        subscribed: boolean;
        product_id: string | null;
        subscription_end: string | null;
        subscription_status?: string | null;
        should_force_logout?: boolean;
      };
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: exemptOrgs, isLoading: exemptLoading } = useQuery({
    queryKey: ["billing_exempt", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_users")
        .select("org_id, orgs!inner(billing_exempt)")
        .eq("user_id", userId!);

      if (error) throw error;
      return data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const billingExempt = exemptOrgs?.some((ou: any) => ou.orgs?.billing_exempt === true) ?? false;

  return {
    subscribed: data?.subscribed ?? false,
    billingExempt,
    subscriptionStatus: data?.subscription_status ?? null,
    shouldForceLogout: data?.should_force_logout === true,
    productId: data?.product_id ?? null,
    subscriptionEnd: data?.subscription_end ?? null,
    isLoading: isAuthenticated && (subscriptionLoading || exemptLoading),
  };
}
