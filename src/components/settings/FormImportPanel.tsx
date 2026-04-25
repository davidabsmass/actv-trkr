import { useState, useCallback } from "react";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Download, Play, RotateCcw, CheckCircle2, AlertTriangle,
  Loader2, Pause, RefreshCw, ChevronDown, ChevronUp, XCircle, Shield,
  Activity, Zap,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { callManageImportJob } from "@/lib/manage-import-job";

interface FormIntegration {
  id: string;
  site_id: string;
  builder_type: string;
  external_form_id: string;
  form_name: string;
  status: string;
  total_entries_estimated: number;
  total_entries_imported: number;
  last_synced_at: string | null;
  last_error: string | null;
  form_import_jobs?: ImportJob[];
}

interface ImportJob {
  id: string;
  status: string;
  total_processed: number;
  total_expected: number;
  retry_count: number;
  last_error: string | null;
  last_batch_at: string | null;
  batch_size: number;
  cursor: string | null;
  adaptive_batch_size?: number;
  auto_resume_enabled?: boolean;
  next_run_at?: string | null;
  heartbeat_at?: string | null;
  cancel_reason?: string | null;
  locked_at?: string | null;
}

interface SiteRecord {
  id: string;
  domain: string;
}

function useIntegrations(orgId: string | null) {
  return useQuery({
    queryKey: ["form_integrations", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("form_integrations" as any)
        .select("*, form_import_jobs(*)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FormIntegration[];
    },
    enabled: !!orgId,
    refetchInterval: 10_000,
  });
}

function useSites(orgId: string | null) {
  return useQuery({
    queryKey: ["sites", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("id, domain")
        .eq("org_id", orgId)
        .order("domain");
      if (error) throw error;
      return (data || []) as SiteRecord[];
    },
    enabled: !!orgId,
  });
}

const BUILDER_LABELS: Record<string, string> = {
  gravity_forms: "Gravity Forms",
  avada: "Avada",
  wpforms: "WPForms",
  cf7: "Contact Form 7",
  ninja_forms: "Ninja Forms",
  fluent_forms: "Fluent Forms",
};

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  detected: { color: "bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background", icon: FileText, label: "Detected" },
  importing: { color: "bg-primary/10 text-primary", icon: Loader2, label: "Importing" },
  synced: { color: "bg-green-500/10 text-green-600", icon: CheckCircle2, label: "Synced" },
  error: { color: "bg-destructive/10 text-destructive", icon: AlertTriangle, label: "Error" },
  connected: { color: "bg-blue-500/10 text-blue-600", icon: CheckCircle2, label: "Connected" },
  needs_review: { color: "bg-amber-500/10 text-amber-600", icon: AlertTriangle, label: "Manual review" },
};

function getJobHealth(job: ImportJob): { label: string; color: string; icon: any } {
  if (job.status === "completed") return { label: "Completed", color: "text-green-600", icon: CheckCircle2 };
  // Cancelled is the only true terminal state shown to users.
  if (job.status === "cancelled") return { label: "Cancelled", color: "text-muted-foreground", icon: XCircle };
  if (job.status === "paused") return { label: "Paused", color: "text-muted-foreground", icon: Pause };
  if (job.status === "cancel_requested") return { label: "Cancelling", color: "text-orange-500", icon: XCircle };
  // Anything else (pending, running, stalled, failed-but-auto-recovered)
  // is presented as actively progressing — the backend will not let it die.
  if (job.status === "stalled" || job.status === "failed" || (job.retry_count || 0) > 0) {
    return { label: "Waiting — retrying automatically", color: "text-amber-500", icon: RefreshCw };
  }
  if (job.status === "running" || job.status === "pending") return { label: "Importing", color: "text-green-600", icon: Activity };
  return { label: "Importing", color: "text-green-600", icon: Activity };
}

export default function FormImportPanel() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const { data: integrations, isLoading } = useIntegrations(orgId);
  const { data: sites } = useSites(orgId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescanningSiteId, setRescanningSiteId] = useState<string | null>(null);

  const invokeAction = useCallback((action: string, body: any) => {
    return callManageImportJob(action, { body });
  }, []);

  const invalidate = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] }),
      queryClient.invalidateQueries({ queryKey: ["forms", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["sites", orgId] }),
    ]);
  };

  const rescanSite = async (siteId: string) => {
    try {
      setRescanningSiteId(siteId);
      // Discover forms on this site AND auto-start import jobs for any
      // forms with un-imported entries. The "Re-scan" button is the
      // single-click entry point: discover + import.
      // The discover action falls back to the existing `forms` table when
      // the WP plugin is unreachable so the UI never shows 0 forms.
      const data = await callManageImportJob<{
        discovered?: number;
        auto_started_jobs?: number;
        source?: string;
      }>("discover", { body: { site_id: siteId } });

      invalidate();

      const discovered = data?.discovered ?? 0;
      const autoStarted = data?.auto_started_jobs ?? 0;
      const sourceLabel = data?.source === "forms_table"
        ? " (recovered from previously detected forms — WP plugin was unreachable, so entry counts and import are not available right now)"
        : "";

      let description: string;
      if (discovered === 0) {
        description = "No forms detected on this site yet.";
      } else if (autoStarted > 0) {
        description = `Found ${discovered} form${discovered === 1 ? "" : "s"}. Started importing entries for ${autoStarted} form${autoStarted === 1 ? "" : "s"} in the background — counts will update over the next few minutes.`;
      } else {
        description = `Found ${discovered} form${discovered === 1 ? "" : "s"}${sourceLabel}.`;
      }

      toast({
        title: discovered > 0 ? "Re-scan complete" : "Re-scan complete",
        description,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Re-scan failed",
        description: err?.message || "We couldn’t re-scan this site right now.",
      });
    } finally {
      setRescanningSiteId(null);
    }
  };

  const startImport = async (integration: FormIntegration) => {
    try {
      // Clear any stale terminal-state jobs for this integration so a retry
      // never collides with a leftover failed/cancelled/completed row that
      // could confuse the active-job guard.
      const staleJobs = (integration.form_import_jobs || []).filter(j =>
        ["failed", "cancelled", "stalled"].includes(j.status)
      );
      for (const j of staleJobs) {
        try { await invokeAction("cancel", { job_id: j.id }); } catch { /* best-effort */ }
      }

      await invokeAction("create", { form_integration_id: integration.id, batch_size: 100 });
      toast({ title: "Import started", description: `Background processing will handle ${integration.form_name}. You can close this tab.` });
      invalidate();
    } catch (err: any) {
      const raw = err?.message || "Failed to start import";
      // Surface known server errors in a friendlier way
      const friendly = /already active/i.test(raw)
        ? "An import is already running for this form. Open the form to pause or cancel it first."
        : /Site not found|Access denied/i.test(raw)
          ? "We couldn't access this site. Make sure the WP plugin is connected and try a Re-scan."
          : raw;
      toast({ variant: "destructive", title: "Couldn't start import", description: friendly });
    }
  };

  const pauseJob = async (jobId: string) => {
    try {
      await invokeAction("pause", { job_id: jobId });
      toast({ title: "Import paused" });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      await invokeAction("cancel", { job_id: jobId });
      toast({ title: "Import cancelled" });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    }
  };

  const resumeJob = async (jobId: string) => {
    try {
      await invokeAction("resume", { job_id: jobId });
      toast({ title: "Import resumed", description: "Background processing will continue automatically." });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    }
  };

  const restartJob = async (jobId: string) => {
    try {
      await invokeAction("restart", { job_id: jobId });
      toast({ title: "Import restarted from zero" });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    }
  };

  const allJobs = integrations?.flatMap(i => i.form_import_jobs || []) || [];
  const summary = {
    detected: integrations?.filter(i => i.status === "detected").length || 0,
    importing: integrations?.filter(i => i.status === "importing").length || 0,
    synced: integrations?.filter(i => i.status === "synced").length || 0,
    error: integrations?.filter(i => i.status === "error").length || 0,
    stalled: allJobs.filter(j => j.status === "stalled").length,
    active: allJobs.filter(j => ["pending", "running"].includes(j.status)).length,
  };

  const siteIdsWithIntegrations = new Set((integrations || []).map((integration) => integration.site_id));
  const sitesNeedingRescan = (sites || []).filter((site) => !siteIdsWithIntegrations.has(site.id));

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Loading form integrations...</p>
      </div>
    );
  }

  if (!integrations || integrations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Form Import</h3>
        </div>

        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            No form integrations detected yet. If this site already has forms, run a manual re-scan now.
          </p>
        </div>

        <div className="space-y-2">
          {(sites || []).map((site) => (
            <div key={site.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{site.domain}</p>
                <p className="text-xs text-muted-foreground">Retry WordPress form discovery and background backfill.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rescanSite(site.id)}
                disabled={rescanningSiteId === site.id}
                className="gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rescanningSiteId === site.id ? "animate-spin" : ""}`} />
                {rescanningSiteId === site.id ? "Re-scanning…" : "Re-scan Forms"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Form Import</h3>
        </div>
        <div className="flex gap-2 text-xs flex-wrap">
          {summary.active > 0 && <Badge variant="secondary" className="bg-primary/10 text-primary">{summary.active} active</Badge>}
          {summary.stalled > 0 && <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">{summary.stalled} retrying</Badge>}
          {summary.synced > 0 && <Badge variant="secondary" className="bg-green-500/10 text-green-600">{summary.synced} synced</Badge>}
          {summary.error > 0 && <Badge variant="destructive">{summary.error} errors</Badge>}
          {summary.detected > 0 && <Badge variant="outline">{summary.detected} detected</Badge>}
        </div>
      </div>

      {summary.active > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 p-2.5">
          <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <p className="text-xs text-primary">
            Imports run in the background — you can close this tab safely.
          </p>
        </div>
      )}

      {sitesNeedingRescan.length > 0 && (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-4">
          <p className="text-xs font-medium text-foreground">Missing forms on a live site?</p>
          <p className="text-xs text-muted-foreground">
            Run a manual re-scan for any connected site where auto-discovery missed forms.
          </p>
          <div className="space-y-2 pt-1">
            {sitesNeedingRescan.map((site) => (
              <div key={site.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <p className="text-sm text-foreground truncate">{site.domain}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rescanSite(site.id)}
                  disabled={rescanningSiteId === site.id}
                  className="gap-1"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${rescanningSiteId === site.id ? "animate-spin" : ""}`} />
                  {rescanningSiteId === site.id ? "Re-scanning…" : "Re-scan Forms"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {integrations.map((integration) => {
          const statusCfg = STATUS_CONFIG[integration.status] || STATUS_CONFIG.detected;
          const StatusIcon = statusCfg.icon;
          const isExpanded = expandedId === integration.id;
          const activeJob = integration.form_import_jobs?.find(
            j => ["running", "pending", "stalled", "cancel_requested"].includes(j.status)
          );
          const latestJob = integration.form_import_jobs?.[0];
          const progress = integration.total_entries_estimated > 0
            ? Math.round((integration.total_entries_imported / integration.total_entries_estimated) * 100)
            : 0;

          return (
            <div key={integration.id} className="border border-border rounded-md">
              <button
                onClick={() => setExpandedId(isExpanded ? null : integration.id)}
                className="group w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <StatusIcon className={`h-4 w-4 flex-shrink-0 ${integration.status === "importing" ? "animate-spin" : ""}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{integration.form_name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {BUILDER_LABELS[integration.builder_type] || integration.builder_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{integration.total_entries_imported}/{integration.total_entries_estimated} entries</span>
                    {integration.last_synced_at && (
                      <span>Synced {new Date(integration.last_synced_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <Badge className={`${statusCfg.color} text-[10px]`}>{statusCfg.label}</Badge>
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                  {(integration.status === "importing" || integration.status === "synced") && (
                    <div className="space-y-1">
                      <Progress value={progress} className="h-2" />
                      <p className="text-[10px] text-muted-foreground">{progress}% complete</p>
                    </div>
                  )}

                  {integration.last_error && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded p-2">
                      <p className="text-xs text-destructive">{integration.last_error}</p>
                    </div>
                  )}

                  {latestJob && (
                    <div className="text-xs text-muted-foreground space-y-1.5">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const health = getJobHealth(latestJob);
                          const HealthIcon = health.icon;
                          return (
                            <>
                              <HealthIcon className={`h-3 w-3 ${health.color}`} />
                              <span className={`font-medium ${health.color}`}>{health.label}</span>
                              <span>·</span>
                              <span>Status: {latestJob.status}</span>
                            </>
                          );
                        })()}
                      </div>
                      <p>Processed: <span className="font-medium text-foreground">{latestJob.total_processed}</span> / {latestJob.total_expected}</p>
                      {latestJob.adaptive_batch_size && latestJob.adaptive_batch_size !== latestJob.batch_size && (
                        <p className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Adaptive batch: {latestJob.adaptive_batch_size}
                        </p>
                      )}
                      {(latestJob.retry_count || 0) > 0 && <p>Retries: {latestJob.retry_count}</p>}
                      {latestJob.last_batch_at && <p>Last batch: {new Date(latestJob.last_batch_at).toLocaleString()}</p>}
                      {latestJob.next_run_at && ["pending", "stalled"].includes(latestJob.status) && (
                        <p>Next attempt: {new Date(latestJob.next_run_at).toLocaleString()}</p>
                      )}
                      {latestJob.auto_resume_enabled && (
                        <p className="flex items-center gap-1">
                          <Shield className="h-3 w-3 text-green-600" />
                          <span className="text-green-600">Auto-resume enabled</span>
                        </p>
                      )}
                      {latestJob.cancel_reason && (
                        <p className="text-destructive">Cancelled: {latestJob.cancel_reason}</p>
                      )}
                      {latestJob.last_error && (
                        <p className="text-destructive">Error: {latestJob.last_error}</p>
                      )}
                    </div>
                  )}

                  {integration.builder_type === "cf7" && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2">
                      <p className="text-xs text-amber-600">
                        ⚠️ CF7 requires the Flamingo plugin for entry storage. If entries are missing, confirm Flamingo is installed.
                      </p>
                    </div>
                  )}

                  {integration.status === "needs_review" && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2 space-y-1">
                      <p className="text-xs font-medium text-amber-600">
                        ⚠️ Oversized form — capped import available
                      </p>
                      <p className="text-xs text-amber-600/80">
                        This form reports <strong>{integration.total_entries_estimated.toLocaleString()}</strong> entries, exceeding the 50,000 safety threshold. Click <strong>Import most recent 8,000</strong> to backfill the most recent entries only — viewing and exporting will be limited to that capped set.
                      </p>
                    </div>
                  )}

                  {integration.status === "synced" && integration.total_entries_estimated > 50000 && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2">
                      <p className="text-xs text-blue-600">
                        ℹ️ Capped import — showing most recent <strong>{integration.total_entries_imported.toLocaleString()}</strong> of <strong>{integration.total_entries_estimated.toLocaleString()}</strong> entries.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {integration.status === "detected" && (
                      <Button size="sm" variant="default" onClick={() => startImport(integration)} className="text-xs h-7">
                        <Play className="h-3 w-3 mr-1" /> Start Import
                      </Button>
                    )}

                    {integration.status === "needs_review" && (
                      <Button size="sm" variant="outline" onClick={() => startImport(integration)} className="text-xs h-7 border-amber-500/40 text-amber-600 bg-transparent hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/60">
                        <Play className="h-3 w-3 mr-1" /> Import most recent 8,000
                      </Button>
                    )}

                    {latestJob && ["failed", "stalled"].includes(latestJob.status) && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => resumeJob(latestJob.id)} className="text-xs h-7">
                          <RefreshCw className="h-3 w-3 mr-1" /> Resume
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => restartJob(latestJob.id)} className="text-xs h-7">
                          <RotateCcw className="h-3 w-3 mr-1" /> Restart
                        </Button>
                      </>
                    )}

                    {latestJob && latestJob.status === "paused" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => resumeJob(latestJob.id)} className="text-xs h-7">
                          <Play className="h-3 w-3 mr-1" /> Resume
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelJob(latestJob.id)} className="text-xs h-7 text-destructive">
                          <XCircle className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </>
                    )}

                    {activeJob && ["running", "pending"].includes(activeJob.status) && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => pauseJob(activeJob.id)} className="text-xs h-7">
                          <Pause className="h-3 w-3 mr-1" /> Pause
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelJob(activeJob.id)} className="text-xs h-7 text-destructive">
                          <XCircle className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </>
                    )}

                    {integration.status === "synced" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => latestJob && restartJob(latestJob.id)}
                        className="text-xs h-7"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Re-import
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
