import { useState, useEffect, useCallback } from "react";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Download, Play, RotateCcw, CheckCircle2, AlertTriangle,
  Loader2, Pause, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
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
    refetchInterval: 15_000,
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

export default function FormImportPanel() {
  const { t } = useTranslation();
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

  const startImport = async (integration: FormIntegration) => {
    try {
      const result = await invokeAction("create", {
        form_integration_id: integration.id,
        batch_size: 100,
      });
      toast({ title: "Import started", description: `Importing entries for ${integration.form_name}` });
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });

      // Auto-process first batch
      if (result?.job?.id) {
        processNextBatch(result.job.id);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Failed to start import" });
    }
  };

  const processNextBatch = async (jobId: string) => {
    setProcessingJobId(jobId);
    try {
      const result = await invokeAction("process", { job_id: jobId });
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });

      if (result?.has_more) {
        // Continue processing
        setTimeout(() => processNextBatch(jobId), 1000);
      } else {
        setProcessingJobId(null);
        toast({ title: "Import complete", description: `Processed ${result?.total_processed || 0} entries` });
      }
    } catch (err: any) {
      setProcessingJobId(null);
      toast({ variant: "destructive", title: "Batch error", description: err?.message });
    }
  };

  const resumeJob = async (jobId: string) => {
    try {
      await invokeAction("resume", { job_id: jobId });
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
      processNextBatch(jobId);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    }
  };

  const restartJob = async (jobId: string) => {
    try {
      await invokeAction("restart", { job_id: jobId });
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
      processNextBatch(jobId);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    }
  };

  // Summaries
  const summary = {
    detected: integrations?.filter(i => i.status === "detected").length || 0,
    importing: integrations?.filter(i => i.status === "importing").length || 0,
    synced: integrations?.filter(i => i.status === "synced").length || 0,
    error: integrations?.filter(i => i.status === "error").length || 0,
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
        <div className="flex gap-2 text-xs">
          {summary.synced > 0 && <Badge variant="secondary" className="bg-green-500/10 text-green-600">{summary.synced} synced</Badge>}
          {summary.importing > 0 && <Badge variant="secondary" className="bg-primary/10 text-primary">{summary.importing} importing</Badge>}
          {summary.error > 0 && <Badge variant="destructive">{summary.error} errors</Badge>}
          {summary.detected > 0 && <Badge variant="outline">{summary.detected} detected</Badge>}
        </div>
      </div>

      <div className="space-y-2">
        {integrations.map((integration) => {
          const statusCfg = STATUS_CONFIG[integration.status] || STATUS_CONFIG.detected;
          const StatusIcon = statusCfg.icon;
          const isExpanded = expandedId === integration.id;
          const activeJob = integration.form_import_jobs?.find(
            j => j.status === "running" || j.status === "pending"
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
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Job status: <span className="font-medium text-foreground">{latestJob.status}</span></p>
                      <p>Processed: <span className="font-medium text-foreground">{latestJob.total_processed}</span> / {latestJob.total_expected}</p>
                      {latestJob.retry_count > 0 && <p>Retries: {latestJob.retry_count}</p>}
                      {latestJob.last_batch_at && <p>Last batch: {new Date(latestJob.last_batch_at).toLocaleString()}</p>}
                      {latestJob.last_error && (
                        <p className="text-destructive">Error: {latestJob.last_error}</p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {integration.status === "detected" && (
                      <Button size="sm" variant="default" onClick={() => startImport(integration)} className="text-xs h-7">
                        <Play className="h-3 w-3 mr-1" /> Start Import
                      </Button>
                    )}

                    {latestJob?.status === "failed" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => resumeJob(latestJob.id)} className="text-xs h-7">
                          <RefreshCw className="h-3 w-3 mr-1" /> Resume
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => restartJob(latestJob.id)} className="text-xs h-7">
                          <RotateCcw className="h-3 w-3 mr-1" /> Restart
                        </Button>
                      </>
                    )}

                    {activeJob && processingJobId !== activeJob.id && (
                      <Button size="sm" variant="outline" onClick={() => processNextBatch(activeJob.id)} className="text-xs h-7">
                        <Play className="h-3 w-3 mr-1" /> Continue
                      </Button>
                    )}

                    {processingJobId === activeJob?.id && (
                      <div className="flex items-center gap-1 text-xs text-primary">
                        <Loader2 className="h-3 w-3 animate-spin" /> Processing...
                      </div>
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
