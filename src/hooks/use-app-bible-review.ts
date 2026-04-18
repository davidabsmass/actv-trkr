import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pluginManifest } from "@/generated/plugin-manifest";
import { APP_BIBLE_SECTIONS } from "@/data/appBibleSections";

/**
 * Returns the count of un-reviewed App Bible sections for the current app version.
 * Used to surface a release-gate banner on admin surfaces.
 */
export function useAppBibleReviewStatus() {
  const version = pluginManifest.version;

  const { data, isLoading } = useQuery({
    queryKey: ["app_bible_reviews", version],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("app_bible_reviews")
        .select("section_key")
        .eq("app_version", version);
      if (error) throw error;
      return data as { section_key: string }[];
    },
    staleTime: 60_000,
  });

  const reviewedKeys = new Set((data ?? []).map((r) => r.section_key));
  const totalSections = APP_BIBLE_SECTIONS.length;
  const reviewedCount = APP_BIBLE_SECTIONS.filter((s) => reviewedKeys.has(s.key)).length;
  const unreviewedCount = totalSections - reviewedCount;
  const isFullyReviewed = unreviewedCount === 0;

  return {
    version,
    totalSections,
    reviewedCount,
    unreviewedCount,
    isFullyReviewed,
    isLoading,
  };
}
