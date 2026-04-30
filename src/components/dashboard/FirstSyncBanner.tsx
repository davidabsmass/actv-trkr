import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";

/**
 * Friendly heads-up shown to newly-connected orgs during the first ~15 minute
 * sync window.
 *
 * Visibility rules (any one hides it):
 *   - No org yet, or user dismissed it.
 *   - We're on the Settings page (it has its own connecting notice).
 *   - More than 15 minutes have passed since the site first heart-beated
 *     (falls back to org creation time if no site exists yet). The copy
 *     itself promises "5–15 minutes", so the banner must not linger past
 *     that window.
 *   - Real data has already arrived (any session or pageview), at which
 *     point the message is just noise.
 */
export function FirstSyncBanner() {
  const { orgId, orgCreatedAt } = useOrg();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const isSettings = pathname.startsWith("/settings");
  const storageKey = orgId ? `firstSyncBanner:dismissed:${orgId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  // Pull the earliest site heartbeat + a quick "do we have any data yet?" probe.
  // Cheap query — limited to 1 row each. Refetches every 30s so the banner
  // disappears on its own as soon as data starts flowing.
  const { data: syncState } = useQuery({
    queryKey: ["first-sync-banner-state", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const [siteRes, sessRes, pvRes] = await Promise.all([
        // Anchor to the EARLIEST site connection for this org. `last_heartbeat_at`
        // is updated every ping, so ordering by it would constantly slide the
        // 15-minute window forward and re-show the banner forever.
        supabase
          .from("sites")
          .select("created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from("sessions").select("id", { head: true, count: "exact" }).eq("org_id", orgId).limit(1),
        supabase.from("pageviews").select("id", { head: true, count: "exact" }).eq("org_id", orgId).limit(1),
      ]);
      return {
        firstHeartbeatAt: siteRes.data?.created_at ?? null,
        hasData: (sessRes.count ?? 0) > 0 || (pvRes.count ?? 0) > 0,
      };
    },
    enabled: !!orgId && !dismissed && !isSettings,
    refetchInterval: 30_000,
  });

  if (!orgId || !orgCreatedAt || dismissed || isSettings) return null;

  // Anchor the 15-minute window to the site's first heartbeat when available,
  // otherwise to org creation. This matches the "5–15 minutes after your site
  // connected" promise in the copy.
  const anchorIso = syncState?.firstHeartbeatAt || orgCreatedAt;
  const ageMs = Date.now() - new Date(anchorIso).getTime();
  const FIFTEEN_MIN = 15 * 60 * 1000;
  if (Number.isNaN(ageMs) || ageMs < 0 || ageMs > FIFTEEN_MIN) return null;

  // Once data is flowing the banner has done its job.
  if (syncState?.hasData) return null;

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
