import { useMemo, useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, Clock, Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { callManageImportJob } from "@/lib/manage-import-job";

type Site = {
  id: string;
  domain: string;
  last_heartbeat_at: string | null;
  last_form_discovery_at: string | null;
  created_at: string;
};

type AreaKey = "forms" | "seo" | "monitoring";

const AREA_LABEL: Record<AreaKey, string> = {
  forms: "Forms",
  seo: "SEO",
  monitoring: "Monitoring & tracking",
};

const AREA_DESC: Record<AreaKey, string> = {
  forms: "Discover & import form entries from this site.",
  seo: "Re-scan pages for SEO issues and recommendations.",
  monitoring: "Re-check uptime, tracking signal, and SSL/domain health.",
};

// Freshness budgets (ms). Per App Bible §19.
const FRESHNESS_BUDGET: Record<AreaKey, number> = {
  forms: 24 * 60 * 60 * 1000, // 24 h — form definitions rarely change
  seo: 14 * 24 * 60 * 60 * 1000, // 14 d
  monitoring: 5 * 60 * 1000, // 5 min
};

function formatAge(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function freshnessState(lastAt: string | null, budgetMs: number, signalReceived: boolean) {
  if (!signalReceived) return "waiting" as const;
  if (!lastAt) return "pending" as const;
  const age = Date.now() - new Date(lastAt).getTime();
  if (age <= budgetMs) return "fresh" as const;
  return "stale" as const;
}

export default function SyncStatusCard() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<Record<string, AreaKey | null>>({});

  const { data: sites } = useQuery({
    queryKey: ["sync_status_sites", orgId],
    queryFn: async () => {
      if (!orgId) return [] as Site[];
      const { data, error } = await supabase
        .from("sites")
        .select("id, domain, last_heartbeat_at, last_form_discovery_at, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Site[];
    },
    enabled: !!orgId,
    refetchInterval: 30 * 1000,
  });

  const siteIds = useMemo(() => (sites ?? []).map((s) => s.id), [sites]);

  const { data: seoByLatest } = useQuery({
    queryKey: ["sync_status_seo", siteIds],
    queryFn: async () => {
      if (siteIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("seo_scans")
        .select("site_id, scanned_at")
        .in("site_id", siteIds)
        .order("scanned_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        if (row.site_id && !map[row.site_id]) map[row.site_id] = row.scanned_at as string;
      }
      return map;
    },
    enabled: siteIds.length > 0,
    refetchInterval: 60 * 1000,
  });

  const { data: trackingBySite } = useQuery({
    queryKey: ["sync_status_tracking", siteIds],
    queryFn: async () => {
      if (siteIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("site_tracking_status")
        .select("site_id, verifier_last_checked_at, updated_at")
        .in("site_id", siteIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const stamp = (row.verifier_last_checked_at as string | null) ?? (row.updated_at as string | null);
        if (row.site_id && stamp) map[row.site_id] = stamp;
      }
      return map;
    },
    enabled: siteIds.length > 0,
    refetchInterval: 60 * 1000,
  });

  const handleResync = async (siteId: string, area: AreaKey) => {
    setBusy((prev) => ({ ...prev, [siteId]: area }));
    try {
      if (area === "forms") {
        await callManageImportJob("discover", { body: { site_id: siteId } });
      } else if (area === "seo") {
        const { error } = await supabase.functions.invoke("seo-scan", {
          body: { site_id: siteId, force: true },
        });
        if (error) throw error;
      } else if (area === "monitoring") {
        const results = await Promise.allSettled([
          supabase.functions.invoke("check-tracking-health", { body: { site_id: siteId } }),
          supabase.functions.invoke("check-site-status", { body: { site_id: siteId } }),
          supabase.functions.invoke("check-domain-ssl", { body: { site_id: siteId } }),
        ]);
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length === results.length) throw new Error("All monitoring checks failed");
      }
      toast.success(`${AREA_LABEL[area]} resync started.`);
      // Refresh queries shortly after to pick up new timestamps
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["sync_status_sites"] });
        qc.invalidateQueries({ queryKey: ["sync_status_seo"] });
        qc.invalidateQueries({ queryKey: ["sync_status_tracking"] });
      }, 1500);
    } catch (e: any) {
      toast.error(`Resync failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBusy((prev) => ({ ...prev, [siteId]: null }));
    }
  };

  if (!orgId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Sync Status
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            We auto-sync each area in the background. Use Resync if something looks off.
          </p>
        </div>
      </div>

      {!sites || sites.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          No sites yet. Once your WordPress plugin sends its first signal, this panel will populate within a few minutes.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {sites.map((site) => {
            const signalReceived = Boolean(site.last_heartbeat_at);
            const seoLast = seoByLatest?.[site.id] ?? null;
            const trackingLast = trackingBySite?.[site.id] ?? null;
            const formsLast = site.last_form_discovery_at;

            const areas: { key: AreaKey; lastAt: string | null }[] = [
              { key: "forms", lastAt: formsLast },
              { key: "seo", lastAt: seoLast },
              { key: "monitoring", lastAt: trackingLast },
            ];

            return (
              <div key={site.id} className="rounded-md border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{site.domain}</span>
                    {signalReceived ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected · signal {formatAge(site.last_heartbeat_at)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                        <Clock className="h-3 w-3" />
                        Waiting for first signal
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {areas.map(({ key, lastAt }) => {
                    const state = freshnessState(lastAt, FRESHNESS_BUDGET[key], signalReceived);
                    const isBusy = busy[site.id] === key;

                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-1.5 rounded border border-border bg-card/60 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">{AREA_LABEL[key]}</span>
                          {state === "fresh" && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Fresh" />
                          )}
                          {state === "stale" && (
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label="Stale" />
                          )}
                          {(state === "waiting" || state === "pending") && (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Waiting" />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {AREA_DESC[key]}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {state === "waiting"
                              ? "Waiting"
                              : state === "pending"
                                ? "Syncing…"
                                : `Last: ${formatAge(lastAt)}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleResync(site.id, key)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Resync
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
