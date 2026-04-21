import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/hooks/use-org";

/**
 * Friendly heads-up shown to newly-connected orgs (first 24 hours).
 *
 * Lets users know that the first full sync — forms, traffic, SEO, monitoring —
 * happens in the background and may take a few minutes to populate. Dismissible
 * per-org via localStorage so it never nags returning users.
 */
export function FirstSyncBanner() {
  const { orgId, orgCreatedAt } = useOrg();
  const [dismissed, setDismissed] = useState(false);

  const storageKey = orgId ? `firstSyncBanner:dismissed:${orgId}` : null;

  // Hydrate dismissed state from localStorage when the org changes.
  useEffect(() => {
    if (!storageKey) return;
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (!orgId || !orgCreatedAt || dismissed || isSettings) return null;

  // Only show during the first 24 hours after the org was created.
  const ageMs = Date.now() - new Date(orgCreatedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) return null;

  const handleDismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  return (
    <div className="mb-4 rounded-lg border border-info/30 bg-info/5 p-3 sm:p-4 flex items-start gap-3 animate-slide-up">
      <div className="mt-0.5 flex-shrink-0">
        <Info className="h-4 w-4 text-info" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          We're still gathering your data
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Your site just connected — forms, traffic, SEO and monitoring sync in the
          background and can take <strong className="text-foreground">5–15 minutes</strong> to
          fully populate. If something looks empty, give it a few minutes and refresh.
          You can safely keep working while we catch up.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        className="h-7 w-7 flex-shrink-0 -mr-1 -mt-1"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
