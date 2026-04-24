import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns the current user's app-level role (admin, moderator, user)
 * and their org-level role for the active org.
 */
export function useUserRole() {
  const { user, loading: authLoading } = useAuth();

  const { data: appRoles, isLoading: appLoading } = useQuery({
    queryKey: ["user_roles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return data.map((r) => r.role);
    },
    enabled: !!user?.id,
  });

  const isAdmin = appRoles?.includes("admin") ?? false;
  const loading = authLoading || appLoading || (!authLoading && !!user?.id && appRoles === undefined);

  return {
    appRoles: appRoles ?? [],
    isAdmin,
    loading,
  };
}

export function useOrgRole(orgId: string | null) {
  const { user } = useAuth();

  const { data: orgRole, isLoading } = useQuery({
    queryKey: ["org_role", orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user?.id) return null;
      const { data, error } = await supabase
        .from("org_users")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.role ?? null;
    },
    enabled: !!orgId && !!user?.id,
  });

  return {
    orgRole: orgRole ?? null,
    isOrgAdmin: orgRole === "admin",
    loading: isLoading,
  };
}
