import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddSiteModal } from "./AddSiteModal";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";

/**
 * Compact "Add Site" button for use in page headers.
 * Mirrors the placement and styling used on the Dashboard so it sits
 * consistently in the top-right of every primary page.
 */
export function AddSiteHeaderButton() {
  const [open, setOpen] = useState(false);
  const { orgId } = useOrg();
  const { data: sitesData } = useSites(orgId);

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
