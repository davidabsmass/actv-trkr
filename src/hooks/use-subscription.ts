import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface SubscriptionState {
  subscribed: boolean;
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
    refetchInterval: 60_000, // refresh every minute
    staleTime: 30_000,
  });

  return {
    subscribed: data?.subscribed ?? false,
    productId: data?.product_id ?? null,
    subscriptionEnd: data?.subscription_end ?? null,
    isLoading,
  };
}
