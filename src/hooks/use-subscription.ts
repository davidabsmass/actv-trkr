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

  // Pull both billing_exempt AND lifecycle status for every org the user belongs to.
  // Invited team members do NOT have their own Stripe subscription — the org
  // owner pays. So if any of the user's orgs is `active` (or `billing_exempt`),
  // the user has access. Without this, invited members would be stuck in a
  // redirect loop (ProtectedRoute → "/" → AuthRoute → /dashboard → ...).
  const { data: memberOrgs, isLoading: exemptLoading } = useQuery({
    queryKey: ["member_orgs_billing", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_users")
        .select("org_id, orgs!inner(billing_exempt, status)")
        .eq("user_id", userId!);

      if (error) throw error;
      return data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const billingExempt = memberOrgs?.some((ou: any) => ou.orgs?.billing_exempt === true) ?? false;
  const hasActiveOrg = memberOrgs?.some((ou: any) => ou.orgs?.status === "active") ?? false;

  // The user is "subscribed" if either:
  //  (a) their own email has an active Stripe sub (org owner / single-user case), OR
  //  (b) they're a member of an org whose lifecycle status is `active`
  //      (the owner is paying — invited team members ride along).
  const subscribed = (data?.subscribed ?? false) || hasActiveOrg;

  return {
    subscribed,
    billingExempt,
    subscriptionStatus: data?.subscription_status ?? null,
    shouldForceLogout: data?.should_force_logout === true,
    productId: data?.product_id ?? null,
    subscriptionEnd: data?.subscription_end ?? null,
    isLoading: isAuthenticated && (subscriptionLoading || exemptLoading),
  };
}
