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

const BUILDER_LABELS: Record<string, string> = {
  gravity_forms: "Gravity Forms",
  avada: "Avada",
  wpforms: "WPForms",
  cf7: "Contact Form 7",
  ninja_forms: "Ninja Forms",
  fluent_forms: "Fluent Forms",
};

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  detected: { color: "bg-muted text-muted-foreground", icon: FileText, label: "Detected" },
  importing: { color: "bg-primary/10 text-primary", icon: Loader2, label: "Importing" },
  synced: { color: "bg-green-500/10 text-green-600", icon: CheckCircle2, label: "Synced" },
  error: { color: "bg-destructive/10 text-destructive", icon: AlertTriangle, label: "Error" },
  connected: { color: "bg-blue-500/10 text-blue-600", icon: CheckCircle2, label: "Connected" },
};

function getJobHealth(job: ImportJob): { label: string; color: string; icon: any } {
  if (job.status === "completed") return { label: "Completed", color: "text-green-600", icon: CheckCircle2 };
  if (job.status === "failed" || job.status === "cancelled") return { label: "Failed", color: "text-destructive", icon: XCircle };
  if (job.status === "stalled") return { label: "Stalled", color: "text-orange-500", icon: AlertTriangle };
  if (job.status === "paused") return { label: "Paused", color: "text-muted-foreground", icon: Pause };
  if (job.status === "cancel_requested") return { label: "Cancelling", color: "text-orange-500", icon: XCircle };
  if ((job.retry_count || 0) > 0) return { label: "Retrying", color: "text-amber-500", icon: RefreshCw };
  if (job.status === "running" || job.status === "pending") return { label: "Healthy", color: "text-green-600", icon: Activity };
  return { label: "Unknown", color: "text-muted-foreground", icon: FileText };
}

export default function FormImportPanel() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const { data: integrations, isLoading } = useIntegrations(orgId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);

  const invokeAction = useCallback(async (action: string, body: any) => {
    const { data, error } = await supabase.functions.invoke(
      `manage-import-job?action=${action}`,
      { body }
    );
    if (error) throw error;
    return data;
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["form_integrations"] });

  const startImport = async (integration: FormIntegration) => {
    try {
      await invokeAction("create", { form_integration_id: integration.id, batch_size: 100 });
      toast({ title: "Import started", description: `Background processing will handle ${integration.form_name}. You can close this tab.` });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Failed to start import" });
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

  // Summaries
  const allJobs = integrations?.flatMap(i => i.form_import_jobs || []) || [];
  const summary = {
    detected: integrations?.filter(i => i.status === "detected").length || 0,
    importing: integrations?.filter(i => i.status === "importing").length || 0,
    synced: integrations?.filter(i => i.status === "synced").length || 0,
    error: integrations?.filter(i => i.status === "error").length || 0,
    stalled: allJobs.filter(j => j.status === "stalled").length,
    active: allJobs.filter(j => ["pending", "running"].includes(j.status)).length,
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Loading form integrations...</p>
      </div>
    );
  }

  if (!integrations || integrations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Form Import</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          No form integrations detected yet. Forms are discovered automatically when your WordPress plugin syncs.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Form Import</h3>
        </div>
        <div className="flex gap-2 text-xs flex-wrap">
          {summary.active > 0 && <Badge variant="secondary" className="bg-primary/10 text-primary">{summary.active} active</Badge>}
          {summary.stalled > 0 && <Badge variant="secondary" className="bg-orange-500/10 text-orange-600">{summary.stalled} stalled</Badge>}
          {summary.synced > 0 && <Badge variant="secondary" className="bg-green-500/10 text-green-600">{summary.synced} synced</Badge>}
          {summary.error > 0 && <Badge variant="destructive">{summary.error} errors</Badge>}
          {summary.detected > 0 && <Badge variant="outline">{summary.detected} detected</Badge>}
        </div>
      </div>

      {/* Background processing notice */}
      {summary.active > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 p-2.5">
          <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <p className="text-xs text-primary">
            Imports run in the background — you can close this tab safely.
          </p>
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
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
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
                  {/* Progress bar */}
                  {(integration.status === "importing" || integration.status === "synced") && (
                    <div className="space-y-1">
                      <Progress value={progress} className="h-2" />
                      <p className="text-[10px] text-muted-foreground">{progress}% complete</p>
                    </div>
                  )}

                  {/* Error display */}
                  {integration.last_error && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded p-2">
                      <p className="text-xs text-destructive">{integration.last_error}</p>
                    </div>
                  )}

                  {/* Job details */}
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

                  {/* CF7 warning */}
                  {integration.builder_type === "cf7" && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2">
                      <p className="text-xs text-amber-600">
                        ⚠️ CF7 requires the Flamingo plugin for entry storage. If entries are missing, confirm Flamingo is installed.
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {integration.status === "detected" && (
                      <Button size="sm" variant="default" onClick={() => startImport(integration)} className="text-xs h-7">
                        <Play className="h-3 w-3 mr-1" /> Start Import
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
