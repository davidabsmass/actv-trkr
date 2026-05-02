import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUp, Check, Download, Loader2 } from "lucide-react";
import pluginThumb from "@/assets/actv-trkr-plugin-thumb.jpg";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { downloadPlugin, getLatestPluginVersion, PluginDownloadError } from "@/lib/plugin-download";
import { reportDownloadFailure } from "@/lib/report-download-failure";

type SitePluginStatus = {
  id: string;
  domain: string | null;
  plugin_version: string | null;
  last_heartbeat_at: string | null;
  plugin_status: string | null;
  created_at: string;
  tracker_status?: string | null;
  last_event_at?: string | null;
  last_page_view_at?: string | null;
  status_last_heartbeat_at?: string | null;
  verifier_last_status?: string | null;
  verifier_last_checked_at?: string | null;
};

function compareVersions(a: string, b: string) {
  const aParts = a.split(".").map((part) => Number(part) || 0);
  const bParts = b.split(".").map((part) => Number(part) || 0);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const aPart = aParts[i] ?? 0;
    const bPart = bParts[i] ?? 0;

    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }

  return 0;
}

function getMostRecentActivityAt(site: SitePluginStatus) {
  const timestamps = [
    site.last_heartbeat_at,
    site.status_last_heartbeat_at,
    site.last_event_at,
    site.last_page_view_at,
  ].filter(Boolean) as string[];

  if (!timestamps.length) return null;
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function formatAge(timestamp: string | null) {
  if (!timestamp) return null;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isFresh(timestamp: string | null, minutes = 30) {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < minutes * 60 * 1000;
}

export default function PluginSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const [downloading, setDownloading] = useState(false);
  // Use a security-definer RPC so non-admin members (e.g. managers) can
  // see whether their org has a working API key, without granting them
  // RLS access to the api_keys.key_hash column. RLS-restricted direct
  // SELECT on api_keys would otherwise return null for managers and
  // make the panel falsely report "No active key".
  const { data: activeKey } = useQuery({
    queryKey: ["active_api_key_status", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("org_active_api_key_status", { _org_id: orgId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.has_active_key) return null;
      return {
        label: row.label as string | null,
        created_at: row.created_at as string,
      };
    },
    enabled: !!orgId,
    refetchInterval: 30 * 1000,
  });

  const { data: latestVersion, refetch: refetchLatestVersion } = useQuery({
    queryKey: ["latest_plugin_version", "plugin_info", "settings_live"],
    queryFn: getLatestPluginVersion,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  });

  const { data: latestReportedSite } = useQuery({
    queryKey: ["site_plugin_status", orgId],
    queryFn: async () => {
      if (!orgId) return null;

      const { data: sites, error } = await supabase
        .from("sites")
        .select("id, domain, plugin_version, last_heartbeat_at, plugin_status, created_at")
        .eq("org_id", orgId);

      if (error) throw error;

      const siteIds = (sites ?? []).map((site) => site.id);
      const { data: statuses, error: statusError } = siteIds.length
        ? await supabase
            .from("site_tracking_status")
            .select("site_id, tracker_status, last_event_at, last_page_view_at, last_heartbeat_at, verifier_last_status, verifier_last_checked_at")
            .in("site_id", siteIds)
        : { data: [], error: null };

      if (statusError) throw statusError;

      const statusBySiteId = new Map((statuses ?? []).map((status) => [status.site_id, status]));
      const hydratedSites: SitePluginStatus[] = (sites ?? []).map((site) => {
        const status = statusBySiteId.get(site.id);
        return {
          ...site,
          tracker_status: status?.tracker_status ?? null,
          last_event_at: status?.last_event_at ?? null,
          last_page_view_at: status?.last_page_view_at ?? null,
          status_last_heartbeat_at: status?.last_heartbeat_at ?? null,
          verifier_last_status: status?.verifier_last_status ?? null,
          verifier_last_checked_at: status?.verifier_last_checked_at ?? null,
        };
      });

      return hydratedSites
        .filter((site) => Boolean(site.plugin_version))
        .sort((a, b) => {
          const aSignal = getMostRecentActivityAt(a) ? new Date(getMostRecentActivityAt(a)!).getTime() : 0;
          const bSignal = getMostRecentActivityAt(b) ? new Date(getMostRecentActivityAt(b)!).getTime() : 0;

          if (bSignal !== aSignal) return bSignal - aSignal;

          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })[0] ?? null;
    },
    enabled: !!orgId,
  });

  const siteVersion = latestReportedSite?.plugin_version ?? null;
  const siteDomain = latestReportedSite?.domain ?? null;
  const lastSignalAt = latestReportedSite?.last_heartbeat_at ?? null;
  const lastActivityAt = latestReportedSite ? getMostRecentActivityAt(latestReportedSite) : null;
  const verifierConfirmsInstalled = latestReportedSite?.verifier_last_status === "ok" && isFresh(latestReportedSite.verifier_last_checked_at ?? null, 120);

  const activityAgeLabel = formatAge(lastActivityAt) ?? "recently";
  const pluginSignalAgeLabel = formatAge(lastSignalAt);
  const heartbeatIsFresh = isFresh(lastSignalAt);
  const connectionLooksHealthy = isFresh(lastActivityAt) || verifierConfirmsInstalled || latestReportedSite?.tracker_status === "active";

  const pluginIsConfirmedHealthy = latestReportedSite?.plugin_status === "healthy" && heartbeatIsFresh;

  // Only show update badge from a fresh, healthy signal. Old/disconnected rows
  // are historical and must not imply the customer's current WP install is old.
  const needsUpdate = Boolean(
    pluginIsConfirmedHealthy && siteVersion && latestVersion && compareVersions(siteVersion, latestVersion) < 0,
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (!orgId) {
        await downloadPlugin();
      } else {
        const { data, error } = await supabase.functions.invoke("create-api-key", {
          body: { org_id: orgId, label: "Plugin download key" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        await downloadPlugin(data.key);
      }
      await refetchLatestVersion();
      toast.success(`Plugin v${latestVersion || "latest"} download started.`);
    } catch (e: any) {
      const isStructured = e instanceof PluginDownloadError;
      await reportDownloadFailure({
        stage: isStructured ? e.stage : "unknown",
        error: e,
        httpStatus: isStructured ? e.httpStatus : null,
        downloadUrl: isStructured ? e.downloadUrl : undefined,
        surface: "settings",
        orgId,
      });
      toast.error("Download failed — our team has been notified.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <img src={pluginThumb} alt="ACTV TRKR Plugin" className="h-10 w-10 rounded-lg object-cover" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.wordpressPlugin")}</h3>
        </div>
        <div className="flex items-center gap-2">
          {siteVersion && (
            <span className="text-xs text-muted-foreground font-mono">
              {siteDomain ? `${siteDomain} · ` : ""}v{siteVersion}
            </span>
          )}
          {needsUpdate && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
              <ArrowUp className="h-3 w-3" />
              v{latestVersion} available
            </span>
          )}
          {!siteVersion && (
            <span className="text-xs text-muted-foreground font-mono">v{latestVersion || "—"}</span>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? t("settings.downloadingPlugin") : `${t("settings.downloadPlugin")}${latestVersion ? ` v${latestVersion}` : ""}`}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {t("settings.pluginDownloadDesc")}
      </p>

      {siteDomain && (
        <div className="mb-3 rounded-md border border-border bg-background/40 px-3 py-2 text-xs">
          {!connectionLooksHealthy ? (
            <span className="text-warning">
              ⚠️ {siteDomain} hasn't sent a signal in {activityAgeLabel}. Current plugin version cannot be verified from this stale record.
            </span>
          ) : (
            <span className="text-muted-foreground">
              ✓ {siteDomain} is connected. Last activity {activityAgeLabel}.{!heartbeatIsFresh && pluginSignalAgeLabel ? ` Plugin version signal last checked in ${pluginSignalAgeLabel}.` : ""}
            </span>
          )}
        </div>
      )}
      {!siteDomain && activeKey && (
        <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
          API key is active. Once the plugin is installed and activated, this site will appear here within a few minutes.
        </div>
      )}

      {needsUpdate && (
        <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 mb-5">
          <ArrowUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-foreground">
              Plugin update available: v{siteVersion} → v{latestVersion}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {siteDomain
                ? `${siteDomain} is still reporting v${siteVersion}. Once the updated plugin checks in, this badge will clear automatically.`
                : "Download the latest version and re-install it on your WordPress site to get the newest features and fixes."}
            </p>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t("settings.apiKeyStatus")}
        </label>
        <div className="mt-1">
          {activeKey ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-success/10 text-success border border-success/20">
                <Check className="h-3 w-3" />
                {t("settings.active")}
              </span>
              <span className="text-xs text-muted-foreground">
                {activeKey.label} · {t("settings.created").toLowerCase()} {new Date(activeKey.created_at).toLocaleDateString()}
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-destructive/10 text-destructive border border-destructive/20">
              {t("settings.noActiveKey")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}