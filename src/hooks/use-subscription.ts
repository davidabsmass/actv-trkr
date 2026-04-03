import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface SubscriptionState {
  subscribed: boolean;
  billingExempt: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  isLoading: boolean;
}

export function useSubscription(): SubscriptionState {
  const { session } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["subscription_status", session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      return data as { subscribed: boolean; product_id: string | null; subscription_end: string | null };
    },
    enabled: !!session?.user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Check if user belongs to any billing-exempt org
  const { data: exemptOrgs } = useQuery({
    queryKey: ["billing_exempt", session?.user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("org_users")
        .select("org_id, orgs!inner(billing_exempt)")
        .eq("user_id", session!.user.id);
      return data ?? [];
    },
    enabled: !!session?.user,
    staleTime: 5 * 60_000,
  });

  const billingExempt = exemptOrgs?.some((ou: any) => ou.orgs?.billing_exempt === true) ?? false;

  return {
    subscribed: data?.subscribed ?? false,
    billingExempt,
    productId: data?.product_id ?? null,
    subscriptionEnd: data?.subscription_end ?? null,
    isLoading,
  };
}
