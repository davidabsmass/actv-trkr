import { useState, useMemo, useEffect } from "react";
import { buildFieldColumns } from "@/lib/form-field-display";

import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useForms } from "@/hooks/use-dashboard-data";
import { format, subDays, startOfDay } from "date-fns";
import { Search, ChevronRight, ArrowLeft, FileText, BarChart3, Settings2, Download, CalendarIcon, Archive, ArchiveRestore, AlertCircle, RefreshCw, Upload, ArrowUpCircle, Trash2, PowerOff, Loader2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { FormLeaderboard } from "@/components/dashboard/FormLeaderboard";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { downloadPlugin, getLatestPluginVersion } from "@/lib/plugin-download";
import { callManageImportJob } from "@/lib/manage-import-job";
import { HowToButton } from "@/components/HowToButton";
import { AddSiteHeaderButton } from "@/components/sites/AddSiteHeaderButton";
import { HOWTO_FORMS } from "@/components/howto/page-content";


const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-info/10 text-info border-info/20",
  qualified: "bg-success/10 text-success border-success/20",
  converted: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

const categoryColors: Record<string, string> = {
  lead: "text-primary border-primary/20",
  newsletter: "text-info border-info/20",
  survey: "text-warning border-warning/20",
  other: "text-muted-foreground border-border",
};

const weightLabels: Record<string, string> = {
  "0": "Excluded (0×)",
  "0.25": "Low (0.25×)",
  "0.5": "Half (0.5×)",
  "0.75": "Medium (0.75×)",
  "1": "Full (1×)",
};

/* ─── Summary Row ─── */
function FormsSummary({ orgId, days }: { orgId: string | null; days: number }) {
  const { t } = useTranslation();
  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  const { data: submissionCounts } = useQuery({
    queryKey: ["total_submissions", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return { allTime: 0, recent: 0 };
      const [allRes, recentRes] = await Promise.all([
        supabase
          .from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed"),
        supabase
          .from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", `${startDate}T00:00:00Z`)
          .lte("submitted_at", `${endDate}T23:59:59.999Z`),
      ]);
      if (allRes.error) throw allRes.error;
      if (recentRes.error) throw recentRes.error;
      return { allTime: allRes.count || 0, recent: recentRes.count || 0 };
    },
    enabled: !!orgId,
  });

  const { data: failureCount } = useQuery({
    queryKey: ["form_failures", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count, error } = await supabase
        .from("form_submission_logs").select("*", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "fail")
        .gte("occurred_at", `${startDate}T00:00:00Z`)
        .lte("occurred_at", `${endDate}T23:59:59.999Z`);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!orgId,
  });

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="glass-card p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">{t("forms.totalSubmissions")}</p>
        <p className="text-2xl font-bold font-mono-data text-foreground">{submissionCounts?.allTime ?? "—"}</p>
        <p className="text-xs text-muted-foreground">
          {submissionCounts ? `${submissionCounts.recent.toLocaleString()} ` : "— "}
          {t("forms.lastDays", { days })}
        </p>
      </div>
      <div className="glass-card p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("forms.failures")}</p>
          {(failureCount ?? 0) > 0 && <AlertCircle className="h-3 w-3 text-destructive" />}
        </div>
        <p className={`text-2xl font-bold font-mono-data ${(failureCount ?? 0) > 0 ? "text-destructive" : "text-foreground"}`}>
          {failureCount ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground">{t("forms.lastDays", { days })}</p>
      </div>
    </div>
  );
}

/* ─── Plugin Update Banner ─── */
function PluginUpdateBanner({ orgId, siteIds }: { orgId: string | null; siteIds: string[] }) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const relevantSiteIds = useMemo(() => new Set(siteIds), [siteIds]);

  const { data: siteVersions } = useQuery({
    queryKey: ["site_plugin_versions", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("id, domain, plugin_version, last_heartbeat_at")
        .eq("org_id", orgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: latestVersion } = useQuery({
    queryKey: ["latest_plugin_version", "plugin_info"],
    queryFn: getLatestPluginVersion,
    staleTime: 1000 * 60 * 60,
  });

  if (relevantSiteIds.size === 0) return null;

  const ACTIVE_SIGNAL_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;
  const scopedSiteVersions = (siteVersions || []).filter((s) => relevantSiteIds.has(s.id));
  const outdatedSites = scopedSiteVersions.filter((s) => {
    if (!s.plugin_version || !latestVersion || !s.last_heartbeat_at) return false;
    const lastSignalMs = new Date(s.last_heartbeat_at).getTime();
    if (!Number.isFinite(lastSignalMs)) return false;
    const hasRecentSignal = Date.now() - lastSignalMs <= ACTIVE_SIGNAL_WINDOW_MS;
    if (!hasRecentSignal) return false;
    return compareVersions(latestVersion, s.plugin_version) > 0;
  });

  if (outdatedSites.length === 0) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPlugin();
      toast.success(`Plugin v${latestVersion} downloaded! Upload via WordPress → Plugins → Add New → Upload.`);
    } catch {
      toast.error("Failed to download plugin");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <ArrowUpCircle className="h-4 w-4 text-warning flex-shrink-0" />
        <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("forms.pluginUpdateAvailable", { version: latestVersion })}</p>
          <p className="text-xs text-muted-foreground truncate">
              {outdatedSites.map((s) => `${s.domain} (v${s.plugin_version})`).join(", ")} — {t("forms.syncMayBeIncomplete")}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 flex-shrink-0 border-warning/30 text-warning hover:bg-warning/10 hover:text-warning"
        onClick={handleDownload}
        disabled={downloading}
      >
        <Download className="h-3.5 w-3.5" />
        {downloading ? t("forms.downloading") : t("forms.downloadUpdate")}
      </Button>
    </div>
  );
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function getBlockedSyncMessage(runtimeVersion: string | null | undefined): string {
  const minimumVersion = "1.3.12";
  if (!runtimeVersion || compareVersions(runtimeVersion, minimumVersion) < 0) {
    return `Sync blocked — Avada entry discovery failed. Update the plugin to v${minimumVersion}+ and re-sync.`;
  }
  return `Sync blocked — Avada entry discovery failed on v${runtimeVersion}. Run “Sync Forms” in WordPress, then sync entries again.`;
}

/* ─── Avada Reset Banner ─── */
function AvadaResetBanner({ orgId, forms, queryClient, syncBlocked }: { orgId: string | null; forms: any[]; queryClient: any; syncBlocked: boolean }) {
  const [resetting, setResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const avadaForms = forms.filter((f) => f.provider === "avada" && !f.archived);

  // Only show if there are Avada forms AND sync is blocked (deadlock detected)
  if (avadaForms.length === 0 || !syncBlocked) return null;

  const siteIds = [...new Set(avadaForms.map((f) => f.site_id))] as string[];

  const handleReset = async () => {
    setShowConfirm(false);
    setResetting(true);
    try {
      let totalLeads = 0;
      let totalRaw = 0;
      let totalFlat = 0;
      let totalForms = 0;
      for (const siteId of siteIds) {
        const { data, error } = await supabase.functions.invoke("reset-avada-entries", {
          body: { org_id: orgId, site_id: siteId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        totalLeads += data?.deleted_leads || 0;
        totalRaw += data?.deleted_raw_events || 0;
        totalFlat += data?.deleted_flat_fields || 0;
        totalForms += data?.forms_affected || 0;
      }

      const parts: string[] = [];
      if (totalLeads) parts.push(`${totalLeads} leads`);
      if (totalRaw) parts.push(`${totalRaw} raw events`);
      if (totalFlat) parts.push(`${totalFlat} field records`);
      toast.success(`Reset complete — removed ${parts.join(", ")} across ${totalForms} form(s). Click "Sync Entries" to reimport.`);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["leads_by_form"] }),
        queryClient.invalidateQueries({ queryKey: ["lead_fields_flat"] }),
        queryClient.invalidateQueries({ queryKey: ["lead_counts_by_form_entries"] }),
        queryClient.invalidateQueries({ queryKey: ["total_submissions"] }),
        queryClient.invalidateQueries({ queryKey: ["leads_for_forms_page"] }),
        queryClient.invalidateQueries({ queryKey: ["forms"] }),
      ]);
    } catch (err: any) {
      toast.error(err.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Avada sync blocked — legacy ID mismatch</p>
            <p className="text-xs text-muted-foreground">
              Existing entries use old IDs that can't match the plugin's current format. Reset to allow a clean reimport.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 flex-shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowConfirm(true)}
          disabled={resetting}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {resetting ? "Resetting…" : "Reset Avada Entries"}
        </Button>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground mb-2">Reset Avada Entries?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete all existing Avada lead data ({avadaForms.length} form{avadaForms.length !== 1 ? "s" : ""}) and allow a clean reimport. This cannot be undone.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              After resetting, click <strong>"Sync Entries"</strong> to reimport from WordPress with the correct ID format.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleReset}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete &amp; Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
export default function Forms() {
  const { orgId, orgName } = useOrg();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: forms, isLoading: formsLoading } = useForms(orgId);
  const formSiteIds = useMemo(
    () => [...new Set((forms || []).map((f) => f.site_id).filter(Boolean))] as string[],
    [forms]
  );
  const selectedFormId = searchParams.get("selected") || null;
  // Deep-link from Settings → Forms "Export entries" button. Consumed once
  // by FormEntries, then cleared so refresh/back doesn't re-open the panel.
  const exportRequested = searchParams.get("export") === "1";
  const setSelectedFormId = (id: string | null) => {
    if (id) {
      setSearchParams({ selected: id }, { replace: true });
    } else {
      searchParams.delete("selected");
      searchParams.delete("export");
      setSearchParams(searchParams, { replace: true });
    }
  };
  const consumeExportFlag = () => {
    if (!searchParams.has("export")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("export");
    setSearchParams(next, { replace: true });
  };
  const [listTab, setListTab] = useState<"active" | "disabled" | "archived">("active");
  const [days, setDays] = useState<number | null>(30);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);

  const endDate = customRange
    ? format(startOfDay(customRange.to), "yyyy-MM-dd")
    : format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = customRange
    ? format(startOfDay(customRange.from), "yyyy-MM-dd")
    : format(subDays(startOfDay(new Date()), days ?? 30), "yyyy-MM-dd");

  const { data: realtimeData } = useRealtimeDashboard(orgId, startDate, endDate);

  const { data: leadsData } = useQuery({
    queryKey: ["leads_for_forms_page", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      // Fetch all leads (paginate past 1000 limit) excluding trashed
      const PAGE_SIZE = 1000;
      let allLeads: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("leads")
          .select("form_id, submitted_at, source, session_id")
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", `${startDate}T00:00:00Z`)
          .lte("submitted_at", `${endDate}T23:59:59.999Z`)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allLeads = allLeads.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return allLeads;
    },
    enabled: !!orgId,
  });

  // Query device data from pageviews joined via session_id from leads
  const { data: deviceData } = useQuery({
    queryKey: ["form_device_splits", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId || !leadsData || leadsData.length === 0) return {};
      // Get unique session_ids from leads, grouped by form_id
      const formSessions: Record<string, Set<string>> = {};
      leadsData.forEach((l) => {
        if (l.session_id) {
          if (!formSessions[l.form_id]) formSessions[l.form_id] = new Set();
          formSessions[l.form_id].add(l.session_id);
        }
      });

      const allSessionIds = [...new Set(leadsData.map((l) => l.session_id).filter(Boolean))] as string[];
      if (allSessionIds.length === 0) return {};

      // Query pageviews for these sessions to get device info
      const { data: pvData, error } = await supabase
        .from("pageviews")
        .select("session_id, device")
        .eq("org_id", orgId)
        .in("session_id", allSessionIds.slice(0, 500));
      if (error) throw error;

      // Build session -> device map (use first pageview's device per session)
      const sessionDevice: Record<string, string> = {};
      (pvData || []).forEach((pv) => {
        if (pv.session_id && pv.device && !sessionDevice[pv.session_id]) {
          sessionDevice[pv.session_id] = pv.device;
        }
      });

      // Aggregate per form
      const result: Record<string, { desktop: number; mobile: number; tablet: number }> = {};
      Object.entries(formSessions).forEach(([formId, sessions]) => {
        const counts = { desktop: 0, mobile: 0, tablet: 0 };
        sessions.forEach((sid) => {
          const d = sessionDevice[sid] || "desktop";
          if (d === "mobile") counts.mobile++;
          else if (d === "tablet") counts.tablet++;
          else counts.desktop++;
        });
        result[formId] = counts;
      });
      return result;
    },
    enabled: !!orgId && !!leadsData && leadsData.length > 0,
  });

  const [syncing, setSyncing] = useState(false);
  const [syncElapsed, setSyncElapsed] = useState(0);
  const [avadaSyncBlocked, setAvadaSyncBlocked] = useState(false);

  // Elapsed timer for sync
  useEffect(() => {
    if (!syncing) { setSyncElapsed(0); return; }
    const start = Date.now();
    const interval = setInterval(() => setSyncElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [syncing]);

  const handleSyncAll = async () => {
    if (!orgId || !forms || forms.length === 0) return;

    const siteIds = [...new Set(forms.map((f) => f.site_id).filter(Boolean))] as string[];
    if (siteIds.length === 0) return;

    setSyncing(true);

    // 60s client-side timeout (sync involves WP round-trip + DB queries)
    const timeoutId = setTimeout(() => {
      toast.warning("Sync is taking longer than expected. The operation will continue in the background.");
    }, 60000);
    try {
      const results = await Promise.allSettled(
        siteIds.map(async (siteId) => {
          const [siteSyncResult, discoverResult] = await Promise.all([
            supabase.functions.invoke("trigger-site-sync", {
              body: { site_id: siteId, force_backfill: true },
            }),
            callManageImportJob<{
              discovered?: number;
              auto_started_jobs?: number;
              source?: string;
              wp_plugin_error?: string | null;
            }>("discover", {
              body: { site_id: siteId },
            }),
          ]);

          if (siteSyncResult.error) throw siteSyncResult.error;
          if (siteSyncResult.data?.error) throw new Error(siteSyncResult.data.error);
          return {
            data: {
              ...siteSyncResult.data,
              import_discovered: discoverResult?.discovered ?? 0,
              auto_started_jobs: discoverResult?.auto_started_jobs ?? 0,
              import_source: discoverResult?.source,
              import_wp_plugin_error: discoverResult?.wp_plugin_error,
              backfill_in_progress: Boolean(siteSyncResult.data?.backfill_in_progress || discoverResult?.auto_started_jobs > 0),
            },
            error: null,
          };
        })
      );

      let successCount = 0;
      let synced = 0;
      let trashed = 0;
      let restored = 0;
      let checked = 0;
      const warnings: string[] = [];
      const errors: string[] = [];
      let worstStatus: "ok" | "partial" | "blocked" = "ok";
      let blockedRuntimeVersion: string | null = null;

      for (const res of results) {
        if (res.status === "rejected") {
          errors.push(res.reason?.message || "Request failed");
          continue;
        }

        const { data, error } = res.value;
        if (error) {
          errors.push(error.message || "Sync failed");
          continue;
        }
        if (data?.error) {
          errors.push(data.error);
          continue;
        }
        // Detect WP plugin crash (fallback mode with wp_error)
        if (data?.fallback && data?.wp_error) {
          const wpErrorText = typeof data.wp_error === 'string' ? data.wp_error : JSON.stringify(data.wp_error);
          const isFatal = wpErrorText.includes('syntax error') || wpErrorText.includes('Fatal error') || wpErrorText.includes('500');
          if (isFatal) {
            errors.push("WordPress plugin crashed — please update the plugin to the latest version from Settings → Plugin.");
            continue;
          }
        }

        successCount += 1;

        const wpResult = data?.wp_result?.result;
        const runtimePluginVersion = (data?.runtime_plugin_version || wpResult?.plugin_version || null) as string | null;

        // Track worst sync_status across all sites
        const siteStatus = data?.sync_status as string | undefined;
        if (siteStatus === "blocked") {
          worstStatus = "blocked";
          if (!blockedRuntimeVersion && runtimePluginVersion) blockedRuntimeVersion = runtimePluginVersion;
        } else if (siteStatus === "partial" && worstStatus !== "blocked") {
          worstStatus = "partial";
        }

        // Detect legacy ID deadlock requiring reset
        if (data?.requires_avada_reset) {
          setAvadaSyncBlocked(true);
        }

        if (data?.plugin_warning) {
          warnings.push(data.plugin_warning);
        }

        if (wpResult?.synced) synced += Number(wpResult.synced) || 0;
        if (wpResult?.trashed) trashed += Number(wpResult.trashed) || 0;
        if (wpResult?.restored) restored += Number(wpResult.restored) || 0;

        // Surface warnings from sync-entries backend (e.g. safety guards)
        const syncWarnings = (data?.warnings || wpResult?.warnings) as string[] | undefined;
        if (syncWarnings && Array.isArray(syncWarnings)) {
          warnings.push(...syncWarnings);
        }

        if (data?.checked) checked += Number(data.checked) || 0;
      }

      if (successCount === 0) {
        throw new Error(errors[0] || "Sync failed");
      }

      const parts: string[] = [];
      if (synced) parts.push(`${synced} form(s) synced`);
      if (trashed) parts.push(`${trashed} entry/entries trashed`);
      if (restored) parts.push(`${restored} entry/entries restored`);
      if (checked) parts.push(`${checked} form check(s) completed`);

      // Check if any site triggered a background backfill
      let anyBackfillInProgress = false;
      for (const res of results) {
        if (res.status === "fulfilled" && res.value?.data?.backfill_in_progress) {
          anyBackfillInProgress = true;
          break;
        }
      }

      if (worstStatus === "blocked") {
        toast.error(getBlockedSyncMessage(blockedRuntimeVersion));
      } else if (worstStatus === "partial") {
        toast.warning(parts.length > 0 ? `Sync partially completed — ${parts.join(", ")}` : "Sync partially completed — some forms were skipped");
      } else {
        toast.success(parts.length > 0 ? `Sync complete — ${parts.join(", ")}` : "Sync complete — everything up to date");
      }

      if (anyBackfillInProgress) {
        toast.info("Import started in the background. Small forms finish in minutes; forms with thousands of entries can take an hour or more. You can leave this page — counts will update automatically.");
      }

      if (warnings.length > 0 && worstStatus !== "blocked") {
        toast.warning(warnings[0]);
      }
      if (errors.length > 0) {
        toast.warning(`Some sites failed to sync (${errors.length})`);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["leads_by_form"] }),
        queryClient.invalidateQueries({ queryKey: ["lead_fields_flat"] }),
        queryClient.invalidateQueries({ queryKey: ["lead_counts_by_form_entries"] }),
        queryClient.invalidateQueries({ queryKey: ["total_submissions"] }),
        queryClient.invalidateQueries({ queryKey: ["forms"] }),
        queryClient.invalidateQueries({ queryKey: ["leads_for_forms_page"] }),
      ]);

      await queryClient.refetchQueries({ queryKey: ["leads_by_form"], type: "active" });
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      clearTimeout(timeoutId);
      setSyncing(false);
    }
  };

  const selectedForm = forms?.find((f) => f.id === selectedFormId);
  const activeForms = forms?.filter((f) => !f.archived && f.is_active !== false) || [];
  const inactiveForms = forms?.filter((f) => !f.archived && f.is_active === false) || [];
  const archivedForms = forms?.filter((f) => f.archived) || [];
  const displayedForms = listTab === "active" ? activeForms : listTab === "disabled" ? inactiveForms : archivedForms;

  // Single-call grouped count via RPC. Replaces the previous per-form
  // exact-COUNT loop, which was the main source of slow Forms page loads on
  // accounts with many forms.
  const { data: leadCounts, isLoading: leadCountsLoading } = useQuery({
    queryKey: ["lead_counts_by_form_entries", orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const { data, error } = await (supabase as any).rpc("get_lead_counts_by_form", {
        p_org_id: orgId,
      });
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: { form_id: string; lead_count: number }) => {
        counts[row.form_id] = Number(row.lead_count) || 0;
      });
      return counts;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // Active import jobs — used to surface per-form progress and the global
  // "backfill running" banner so users know historical sync is still working
  // and didn't silently fail.
  const { data: activeJobs } = useQuery({
    queryKey: ["active_form_import_jobs", orgId],
    queryFn: async () => {
      if (!orgId) return [] as any[];
      const { data, error } = await (supabase as any)
        .from("form_import_jobs")
        .select("form_integration_id, status, total_processed, total_expected, last_batch_at, site_id")
        .eq("org_id", orgId)
        // Include `stalled` and `failed` because the backend watchdog
        // automatically resurrects them — there is no terminal "stuck" state
        // for normal historical imports anymore.
        .in("status", ["pending", "running", "importing", "stalled", "failed"]);
      if (error) return [];
      return data || [];
    },
    enabled: !!orgId,
    refetchInterval: 5000, // poll while jobs are visible
  });

  // Map form_integration_id -> form.id via provider/external_form_id/site_id
  // so we can show progress badges next to each form row.
  const { data: integrationsForJobs } = useQuery({
    queryKey: ["form_integrations_for_jobs", orgId],
    queryFn: async () => {
      if (!orgId) return [] as any[];
      const { data, error } = await (supabase as any)
        .from("form_integrations")
        .select("id, site_id, builder_type, external_form_id");
      if (error) return [];
      return data || [];
    },
    enabled: !!orgId && (activeJobs?.length || 0) > 0,
    staleTime: 60_000,
  });

  // Build a lookup: form.id -> active job progress (if any)
  const jobProgressByFormId = useMemo(() => {
    const out: Record<string, { processed: number; expected: number; status: string }> = {};
    if (!activeJobs?.length || !forms?.length) return out;
    const integrationLookup = new Map<string, any>();
    (integrationsForJobs || []).forEach((i: any) => integrationLookup.set(i.id, i));
    activeJobs.forEach((job: any) => {
      const integ = integrationLookup.get(job.form_integration_id);
      if (!integ) return;
      const matchingForm = forms.find(
        (f: any) =>
          f.site_id === integ.site_id &&
          f.provider === integ.builder_type &&
          String(f.external_form_id) === String(integ.external_form_id),
      );
      if (matchingForm) {
        out[matchingForm.id] = {
          processed: Number(job.total_processed) || 0,
          expected: Number(job.total_expected) || 0,
          status: job.status,
        };
      }
    });
    return out;
  }, [activeJobs, integrationsForJobs, forms]);

  const backfillInProgress = (activeJobs?.length || 0) > 0;

  if (selectedForm) {
    return (
      <FormDetail
        form={selectedForm}
        orgId={orgId}
        leadCount={leadCounts?.[selectedForm.id] ?? 0}
        onBack={() => setSelectedFormId(null)}
        autoOpenExport={exportRequested}
        onAutoOpenConsumed={consumeExportFlag}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold text-foreground">{t("forms.formsTitle")}</h1>
            <HowToButton {...HOWTO_FORMS} />
          </div>
          <p className="text-sm text-muted-foreground">{t("forms.leadSubmissions", { orgName })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSyncAll} disabled={syncing || !forms || forms.length === 0}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("forms.syncingElapsed", { elapsed: syncElapsed }) : t("forms.syncEntries")}
          </Button>
          <DateRangeSelector
            selectedDays={days}
            onDaysChange={(d) => { setDays(d); setCustomRange(null); }}
            customRange={customRange}
            onCustomRangeChange={(r) => { setCustomRange(r); setDays(null); }}
          />
          <AddSiteHeaderButton />
        </div>
      </div>

      {/* Plugin Update Banner */}
      <PluginUpdateBanner orgId={orgId} siteIds={formSiteIds} />

      {/* Avada Reset Banner */}
      <AvadaResetBanner orgId={orgId} forms={forms || []} queryClient={queryClient} syncBlocked={avadaSyncBlocked} />

      {/* Persistent backfill banner — keep users informed that historical
          import is still working and didn't silently fail. */}
      {backfillInProgress && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-3">
          <Loader2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5 animate-spin" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Importing historical entries — {activeJobs?.length} form{(activeJobs?.length || 0) === 1 ? "" : "s"} still syncing
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Smaller forms (under ~500 entries) usually finish within a few minutes. Larger forms can take <strong>30 minutes to several hours</strong> — we throttle the import so it doesn't overload your WordPress site. Counts below update automatically as entries arrive; you can safely leave this page and come back. Smaller forms appear first.
            </p>
          </div>
        </div>
      )}

      {/* Summary Row */}
      <FormsSummary orgId={orgId} days={days} />

      {/* Form List */}
      <div className="rounded-lg border border-border bg-card overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t("forms.formsTitle")}</h3>
          <Tabs value={listTab} onValueChange={(value) => setListTab(value as "active" | "disabled" | "archived")}>
            <TabsList className="h-9">
              <TabsTrigger value="active" className="text-xs">Active ({activeForms.length})</TabsTrigger>
              <TabsTrigger value="disabled" className="text-xs">Disabled ({inactiveForms.length})</TabsTrigger>
              <TabsTrigger value="archived" className="text-xs">Archived ({archivedForms.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {formsLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t("forms.loadingForms")}</div>
        ) : displayedForms.length === 0 ? (
           <div className="p-8 text-center text-muted-foreground text-sm">
            {listTab === "archived"
              ? t("forms.noArchivedForms")
              : listTab === "disabled"
                ? "No disabled forms in WordPress."
                : !forms || forms.length === 0
                  ? `${t("forms.noFormsYet")} ${t("forms.noFormsSyncedDesc")}`
                  : "No active forms available."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* While a backfill is running, show smallest forms first so users
                see progress immediately instead of staring at a single form
                that's still loading. */}
            {[...displayedForms].sort((a, b) => {
              if (!backfillInProgress) return 0;
              const ca = leadCounts?.[a.id] ?? 0;
              const cb = leadCounts?.[b.id] ?? 0;
              return ca - cb;
            }).map((form) => {
              const job = jobProgressByFormId[form.id];
              const count = leadCounts?.[form.id];
              return (
              <button
                key={form.id}
                onClick={() => setSelectedFormId(form.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {form.is_active === false && !form.archived ? (
                    <PowerOff className="h-4 w-4 flex-shrink-0 text-warning" />
                  ) : (
                    <FileText className={`h-4 w-4 flex-shrink-0 ${form.archived ? "text-muted-foreground" : "text-primary"}`} />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${form.archived ? "text-muted-foreground" : "text-foreground"}`}>{form.name}</p>
                      <Badge variant="outline" className={`text-xs uppercase ${categoryColors[form.form_category] || categoryColors.other}`}>
                        {form.form_category}
                      </Badge>
                      {form.archived && (
                        <Badge variant="outline" className="text-xs uppercase text-muted-foreground border-border">Archived</Badge>
                      )}
                      {!form.archived && form.is_active === false && (
                        <Badge variant="outline" className="text-xs uppercase text-warning border-warning/40">Disabled in WP</Badge>
                      )}
                      {job && (
                        <Badge
                          variant="outline"
                          className="text-xs uppercase text-primary border-primary/40 gap-1"
                          title="Importing historical entries from WordPress. Large forms (1,000+ entries) can take 30 minutes to several hours. Progress updates automatically — safe to leave this page."
                        >
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Importing{job.expected > 0 ? ` ${job.processed.toLocaleString()} / ${job.expected.toLocaleString()}` : `… ${job.processed.toLocaleString()}`}
                        </Badge>
                      )}
                      {form.lead_weight < 1 && (
                        <span className="text-xs text-muted-foreground font-mono-data">{form.lead_weight}×</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>{form.provider}</span>
                      <span>·</span>
                      {leadCountsLoading && count === undefined ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> loading leads…
                        </span>
                      ) : (
                        <span>{(count ?? 0).toLocaleString()} leads</span>
                      )}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Form Leaderboard */}
      {forms && forms.length > 0 && (
        <FormLeaderboard forms={forms} leads={leadsData || []} sessions={realtimeData?.totalSessions || 0} deviceData={deviceData} leadCounts={leadCounts} />
      )}
    </div>
  );
}

/* ─── Form Detail (with Sync button) ─── */
function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  // Parse header — handle quoted fields
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/^\uFEFF/, ""));
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (vals[i] !== undefined) obj[h] = vals[i]; });
    return obj;
  });
}

function FormDetail({ form, orgId, leadCount, onBack, autoOpenExport = false, onAutoOpenConsumed }: { form: any; orgId: string | null; leadCount: number; onBack: () => void; autoOpenExport?: boolean; onAutoOpenConsumed?: () => void }) {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset input

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (parsed.length === 0) { toast.error("No rows found in CSV"); return; }

      // Find the date column (usually "Date Time" or similar)
      const dateCol = Object.keys(parsed[0]).find(k =>
        k.toLowerCase().includes("date") || k.toLowerCase().includes("time")
      );
      const idCol = Object.keys(parsed[0]).find(k =>
        k.toLowerCase().includes("submission id") || k.toLowerCase() === "id" || k.toLowerCase().includes("entry id")
      );

      // Skip metadata columns from the field data
      const skipCols = new Set([dateCol, idCol, "Submission ID", "Entry ID"].filter(Boolean) as string[]);

      const rows = parsed.map((row, i) => {
        const fields: Record<string, string> = {};
        Object.entries(row).forEach(([key, val]) => {
          if (!skipCols.has(key) && val && val.trim()) fields[key] = val;
        });
        return {
          fields,
          submitted_at: dateCol && row[dateCol] ? new Date(row[dateCol]).toISOString() : null,
          external_entry_id: idCol && row[idCol] ? `csv_${row[idCol]}` : `csv_import_${i}`,
        };
      }).filter(r => r.submitted_at);

      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("import-csv-entries", {
        body: { form_id: form.id, rows },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Imported ${data.imported} entries (${data.skipped} skipped/duplicates)`);
      queryClient.invalidateQueries({ queryKey: ["leads_by_form"] });
      queryClient.invalidateQueries({ queryKey: ["lead_counts_by_form_entries"] });
      queryClient.invalidateQueries({ queryKey: ["total_submissions"] });
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Forms
      </button>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{form.name}</h1>
          <Badge variant="outline" className={`text-xs uppercase ${categoryColors[form.form_category] || categoryColors.other}`}>
            {form.form_category}
          </Badge>
          {form.lead_weight < 1 && (
            <span className="text-xs text-muted-foreground font-mono-data">{form.lead_weight}× weight</span>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {form.provider} · {leadCount ?? "—"} total leads
      </p>

      <Tabs defaultValue="entries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entries" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Entries
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entries">
          <FormEntries orgId={orgId} formId={form.id} autoOpenExport={exportRequested} onAutoOpenConsumed={consumeExportFlag} />
        </TabsContent>
        <TabsContent value="analytics">
          <FormAnalytics orgId={orgId} formId={form.id} />
        </TabsContent>
        <TabsContent value="settings">
          <FormSettings form={form} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Settings Tab ─── */
function FormSettings({ form }: { form: any }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(form.form_category || "lead");
  const [weight, setWeight] = useState([form.lead_weight ?? 1]);
  const [estimatedValue, setEstimatedValue] = useState<string>(String(form.estimated_value ?? 0));

  const updateForm = useMutation({
    mutationFn: async () => {
      const parsedValue = parseFloat(estimatedValue) || 0;
      const { error } = await supabase
        .from("forms")
        .update({ form_category: category, lead_weight: weight[0], estimated_value: parsedValue })
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast.success("Form settings saved");
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  });

  const closestLabel = () => {
    const w = weight[0];
    const closest = Object.keys(weightLabels)
      .map(Number)
      .reduce((prev, curr) => Math.abs(curr - w) < Math.abs(prev - w) ? curr : prev);
    return weightLabels[String(closest)] || `${w}×`;
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Form Category</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Categorize this form so you can differentiate lead types in your dashboard.
        </p>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lead">Lead (Contact, Quote, etc.)</SelectItem>
            <SelectItem value="newsletter">Newsletter Signup</SelectItem>
            <SelectItem value="survey">Survey / Feedback</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Estimated Lead Value</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Set the estimated dollar value of each lead from this form. Used for lead scoring and weighted reporting.
        </p>
        <div className="relative w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            min="0"
            step="1"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            className="pl-7"
            placeholder="0"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Lead Weight</h4>
        <p className="text-xs text-muted-foreground mb-4">
          Control how much this form contributes to your overall lead count and conversion rate.
          A weight of 1× means full contribution. Set to 0× to exclude entirely.
        </p>
        <div className="space-y-3">
          <Slider
            value={weight}
            onValueChange={setWeight}
            min={0} max={1} step={0.25}
            className="w-full"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Excluded</span>
            <span className="font-medium text-foreground">{closestLabel()}</span>
            <span>Full lead</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => updateForm.mutate()} disabled={updateForm.isPending}>
          {updateForm.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-2">Archive Form</h4>
        <p className="text-xs text-muted-foreground mb-4">
          {form.archived
            ? "This form is archived. It won't appear in dashboards or leaderboards. Unarchive it to restore."
            : "Archiving hides this form from your dashboard and leaderboards. Existing data is preserved."}
        </p>
        <Button
          variant={form.archived ? "outline" : "destructive"}
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const newVal = !form.archived;
            supabase.from("forms").update({ archived: newVal }).eq("id", form.id).then(({ error }) => {
              if (error) { toast.error(error.message); return; }
              queryClient.invalidateQueries({ queryKey: ["forms"] });
              toast.success(newVal ? "Form archived" : "Form restored");
            });
          }}
        >
          {form.archived ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive Form</> : <><Archive className="h-3.5 w-3.5" /> Archive Form</>}
        </Button>
      </div>
    </div>
  );
}

/* ─── Entries Tab ─── */
function FormEntries({
  orgId,
  formId,
  autoOpenExport = false,
  onAutoOpenConsumed,
}: {
  orgId: string | null;
  formId: string;
  autoOpenExport?: boolean;
  onAutoOpenConsumed?: () => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showExport, setShowExport] = useState(autoOpenExport);

  // Clear the URL flag after first consumption so refresh doesn't re-open.
  useEffect(() => {
    if (autoOpenExport) onAutoOpenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["leads_by_form", orgId, formId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads").select("id, submitted_at, status, source, data, site_id")
        .eq("org_id", orgId).eq("form_id", formId).neq("status", "trashed")
        .order("submitted_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const sortedLeads = useMemo(() => (leads || []).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()), [leads]);

  // Get site domain to detect self-referral sources
  const siteId = sortedLeads?.[0]?.site_id;
  const { data: siteData } = useQuery({
    queryKey: ["site_domain", siteId],
    queryFn: async () => {
      if (!siteId) return null;
      const { data } = await supabase.from("sites").select("domain").eq("id", siteId).single();
      return data;
    },
    enabled: !!siteId,
  });

  const leadIds = useMemo(() => sortedLeads.map((l) => l.id), [sortedLeads]);
  const leadIdsKey = useMemo(() => [...leadIds].sort().join("|"), [leadIds]);

  const { data: fieldsRaw, isLoading: fieldsLoading } = useQuery({
    queryKey: ["lead_fields_flat", orgId, formId, leadIdsKey],
    queryFn: async () => {
      if (!orgId || leadIds.length === 0) return [];
      const results: any[] = [];
      for (let i = 0; i < leadIds.length; i += 50) {
        const batch = leadIds.slice(i, i + 50);
        const { data, error } = await supabase
          .from("lead_fields_flat")
          .select("lead_id, field_key, field_label, field_type, value_text, value_number, value_bool, value_date")
          .eq("org_id", orgId)
          .in("lead_id", batch);
        if (error) throw error;
        if (data) results.push(...data);
      }
      return results;
    },
    enabled: !!orgId && leadIds.length > 0,
  });

  const { fieldColumns, leadFieldMap } = useMemo(
    () => buildFieldColumns(fieldsRaw, sortedLeads),
    [fieldsRaw, sortedLeads],
  );

  const filtered = sortedLeads.filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (search) {
      const fields = leadFieldMap.get(lead.id);
      const q = search.toLowerCase();
      const searchable = [lead.source, lead.status, ...Object.values(fields || {})].filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const statuses = [...new Set(sortedLeads.map((l) => l.status))].sort();

  const createExport = useMutation({
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const { data: inserted, error } = await supabase.from("export_jobs").insert({
        org_id: orgId,
        created_by: session.user.id,
        format: exportFormat,
        status: "queued",
        start_date: dateFrom ? format(dateFrom, "yyyy-MM-dd") : null,
        end_date: dateTo ? format(dateTo, "yyyy-MM-dd") : null,
        filters_json: { form_id: formId },
      }).select("id").single();
      if (error) throw error;

      const { error: fnError } = await supabase.functions.invoke("process-export", {
        body: { job_id: inserted.id },
      });
      if (fnError) throw new Error("Export processing failed");

      // Poll for completion (edge function may finish after response)
      let completedJob = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data: job } = await supabase
          .from("export_jobs")
          .select("file_path, status, row_count")
          .eq("id", inserted.id)
          .single();
        if (job?.status === "succeeded" || job?.status === "failed") {
          completedJob = job;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      return completedJob;
    },
    onSuccess: async (job) => {
      queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
      setShowExport(false);
      if (job?.file_path) {
        toast.success(`Export ready — ${job.row_count ?? 0} rows. Downloading…`);
        const { data, error } = await supabase.storage.from("exports").createSignedUrl(job.file_path, 120);
        if (!error && data?.signedUrl) {
          const a = document.createElement("a");
          a.href = data.signedUrl;
          a.download = `export.${exportFormat}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          toast.error("Could not generate download link.");
        }
      } else if (job?.status === "succeeded") {
        toast.info("No leads found for the selected filters.");
      }
    },
    onError: (err: any) => toast.error(err.message || "Failed to create export"),
  });

  const dateLabel = dateFrom && dateTo
    ? `${format(dateFrom, "MMM d")} – ${format(dateTo, "MMM d")}`
    : dateFrom ? `From ${format(dateFrom, "MMM d")}` : dateTo ? `Until ${format(dateTo, "MMM d")}` : "All time";

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {statuses.length > 1 && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowExport(!showExport)}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {showExport && (
        <div className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Export Entries</h4>
          <div className="flex flex-wrap gap-3 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>Clear</Button>
            )}
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as "csv" | "xlsx")}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">XLSX</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => createExport.mutate()} disabled={createExport.isPending}>
              {createExport.isPending ? "Queuing…" : `Export ${dateLabel}`}
            </Button>
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground mb-3">
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"}{statusFilter !== "all" || search ? " (filtered)" : ""}
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {leadsLoading || fieldsLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading entries…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {sortedLeads.length === 0 ? "No leads for this form yet." : "No entries match your filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Date</TableHead>
                  <TableHead>Source</TableHead>
                  {fieldColumns.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => {
                  const fields = leadFieldMap.get(lead.id) || {};
                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {format(new Date(lead.submitted_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(!lead.source || lead.source === siteData?.domain) ? "direct" : lead.source}
                      </TableCell>
                      {fieldColumns.map((col) => (
                        <TableCell key={col.key} className="text-sm max-w-[200px] truncate">
                          {fields[col.key] || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Analytics Tab ─── */
function FormAnalytics({ orgId, formId }: { orgId: string | null; formId: string }) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => new Date());

  const startDate = dateFrom ? format(startOfDay(dateFrom), "yyyy-MM-dd") : format(subDays(startOfDay(new Date()), 30), "yyyy-MM-dd");
  const endDate = dateTo ? format(startOfDay(dateTo), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd");
  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);

  const { data: leads } = useQuery({
    queryKey: ["leads_analytics", orgId, formId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads").select("submitted_at, status, source")
        .eq("org_id", orgId).eq("form_id", formId).neq("status", "trashed")
        .gte("submitted_at", `${startDate}T00:00:00Z`)
        .lte("submitted_at", `${endDate}T23:59:59.999Z`)
        .order("submitted_at");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { dailyData, sourceData, statusData, totalLeads } = useMemo(() => {
    const byDay: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    // Pre-fill every day in the selected range with 0
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      byDay[format(d, "yyyy-MM-dd")] = 0;
    }

    if (leads) {
      for (const l of leads) {
        const day = format(new Date(l.submitted_at), "yyyy-MM-dd");
        byDay[day] = (byDay[day] || 0) + 1;
        const src = l.source || "direct";
        bySource[src] = (bySource[src] || 0) + 1;
        byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      }
    }

    return {
      dailyData: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, dateLabel: format(new Date(date), "MMM d"), leads: count })),
      sourceData: Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count })),
      statusData: Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count })),
      totalLeads: leads?.length ?? 0,
    };
  }, [leads, startDate, endDate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">to</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => { setDateFrom(subDays(new Date(), d)); setDateTo(new Date()); }}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: `${days} Day${days !== 1 ? "s" : ""}`, value: totalLeads, sub: "leads" },
          { label: "Daily Avg", value: days > 0 ? (totalLeads / days).toFixed(1) : "0", sub: "leads/day" },
          { label: "Top Source", value: sourceData[0]?.source || "—", sub: `${sourceData[0]?.count ?? 0} leads`, small: true },
          { label: "Sources", value: sourceData.length, sub: "unique" },
        ].map((kpi, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`font-bold font-mono-data text-foreground ${kpi.small ? "text-sm truncate" : "text-2xl"}`} title={typeof kpi.value === 'string' ? kpi.value : undefined}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Leads Over Time</h4>
        {dailyData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No data for this period.</p>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="leads" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#leadsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">By Source</h4>
          {sourceData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data.</p>
          ) : (
            <div className="space-y-2">
              {sourceData.map((s) => (
                <div key={s.source} className="flex items-center justify-between">
                  <span className="text-sm text-foreground truncate max-w-[60%]">{s.source}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${totalLeads > 0 ? (s.count / totalLeads) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-mono-data text-muted-foreground w-8 text-right">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">By Status</h4>
          {statusData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data.</p>
          ) : (
            <div className="space-y-2">
              {statusData.map((s) => (
                <div key={s.status} className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-xs uppercase ${statusColors[s.status] || ""}`}>{s.status}</Badge>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-chart-2" style={{ width: `${totalLeads > 0 ? (s.count / totalLeads) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-mono-data text-muted-foreground w-8 text-right">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
