import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddSiteModal } from "./AddSiteModal";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/use-org-id";

/**
 * Compact "Add Site" button for use in page headers.
 * Mirrors the placement and styling used on the Dashboard so it sits
 * consistently in the top-right of every primary page.
 */
export function AddSiteHeaderButton() {
  const [open, setOpen] = useState(false);
  const { orgId } = useOrgId();

  const { data: sitesData } = useQuery({
    queryKey: ["sites-count-header", orgId],
    queryFn: async () => {
      if (!orgId) return [] as { id: string }[];
      const { data, error } = await supabase
        .from("sites")
        .select("id")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 gap-1 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Site
      </Button>
      <AddSiteModal
        open={open}
        onOpenChange={setOpen}
        isFirstSite={!sitesData || sitesData.length === 0}
      />
    </>
  );
}
