import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

function isPreviewEnvironment() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.includes("lovableproject.com") || host.includes("id-preview--");
}

/**
 * Returns the current user's app-level role (admin, moderator, user)
 * and their org-level role for the active org.
 */
export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const previewBypass = isPreviewEnvironment();

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
    enabled: !!user?.id && !previewBypass,
  });

  const isAdmin = previewBypass || (appRoles?.includes("admin") ?? false);

  // Still loading if auth hasn't resolved OR query is in flight OR query hasn't run yet
  const loading =
    previewBypass
      ? false
      : authLoading || appLoading || (!authLoading && !!user?.id && appRoles === undefined);

  return {
    appRoles: previewBypass ? ["admin"] : appRoles ?? [],
    isAdmin,
    loading,
  };
}

export function useOrgRole(orgId: string | null) {
  const { user } = useAuth();
  const previewBypass = isPreviewEnvironment();

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
    enabled: !!orgId && !!user?.id && !previewBypass,
  });

  return {
    orgRole: previewBypass ? "admin" : orgRole ?? null,
    isOrgAdmin: previewBypass || orgRole === "admin",
    loading: previewBypass ? false : isLoading,
  };
}
