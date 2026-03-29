import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useUserRole } from "@/hooks/use-user-role";

export type SeoVisibilityLevel = "hidden" | "summary" | "advanced";

/**
 * Returns the effective SEO visibility for the current user + org.
 * Internal admins always get "advanced" regardless of org setting.
 * Client users get whatever the org's seo_visibility_level is set to.
 */
export function useSeoVisibility() {
  const { orgId } = useOrg();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const { data: orgLevel, isLoading: orgLoading } = useQuery({
    queryKey: ["seo_visibility_level", orgId],
    queryFn: async () => {
      if (!orgId) return "hidden" as SeoVisibilityLevel;
      const { data, error } = await supabase
        .from("orgs")
        .select("seo_visibility_level")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data?.seo_visibility_level as SeoVisibilityLevel) || "hidden";
    },
    enabled: !!orgId,
  });

  const loading = roleLoading || orgLoading;

  // Internal admins always see full (advanced) SEO
  const effectiveLevel: SeoVisibilityLevel = isAdmin
    ? "advanced"
    : (orgLevel ?? "hidden");

  // Whether SEO should be visible at all for the current user
  const seoVisible = effectiveLevel !== "hidden";

  // Whether the user can see full advanced SEO
  const seoAdvanced = effectiveLevel === "advanced";

  // Whether the user only sees summary
  const seoSummaryOnly = effectiveLevel === "summary";

  return {
    /** The org-level setting (raw) */
    orgSeoLevel: orgLevel ?? "hidden",
    /** The effective level for the current user (admin override applied) */
    effectiveLevel,
    seoVisible,
    seoAdvanced,
    seoSummaryOnly,
    /** Whether the current user is an internal admin */
    isInternalAdmin: isAdmin,
    loading,
  };
}
