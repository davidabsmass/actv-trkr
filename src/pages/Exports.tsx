import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useOrgRole, useUserRole } from "@/hooks/use-user-role";
import { useForms } from "@/hooks/use-dashboard-data";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Download, FileSpreadsheet, Clock, CheckCircle, AlertCircle,
  ChevronRight, ArrowLeft, CalendarIcon, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ExportConfirmDialog } from "@/components/exports/ExportConfirmDialog";
import { logExportAudit, resolveExportRole } from "@/lib/export-audit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ReportTemplateBuilder from "@/components/reports/ReportTemplateBuilder";
import { useSearchParams } from "react-router-dom";

type ExportFormat = "csv" | "xlsx";

export default function Exports() {
  const { orgId, orgName } = useOrg();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { data: forms, isLoading: formsLoading } = useForms(orgId);
  const { orgRole } = useOrgRole(orgId);
  const { isAdmin: isPlatformAdmin } = useUserRole();

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [pendingExport, setPendingExport] = useState<
    | { kind: "all" }
    | { kind: "form"; formId: string; from?: Date; to?: Date }
    | null
  >(null);

  const selectedForm = forms?.find((f) => f.id === selectedFormId);

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["export_jobs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("export_jobs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      return data?.some((j) => j.status === "queued" || j.status === "running") ? 3000 : false;
    },
  });

  // Count leads per form (matches export filter — excludes trashed)
  const { data: leadCounts } = useQuery({
    queryKey: ["lead_counts_by_form", orgId],
    queryFn: async () => {
      if (!orgId || !forms) return {};
      const counts: Record<string, number> = {};
      for (const form of forms) {
        const { count, error } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("form_id", form.id)
          .neq("status", "trashed");
        if (!error) counts[form.id] = count || 0;
      }
      return counts;
    },
    enabled: !!orgId && !!forms && forms.length > 0,
  });

  // 7d / 30d counts for the currently selected form, so users see what
  // window will actually have data before they pick a date range.
  const { data: selectedFormCounts } = useQuery({
    queryKey: ["selected_form_window_counts", orgId, selectedFormId],
    queryFn: async () => {
      if (!orgId || !selectedFormId) return null;
      const now = new Date();
      const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const base = () =>
        supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).eq("form_id", selectedFormId).neq("status", "trashed");
      const [r7, r30, r90] = await Promise.all([
        base().gte("submitted_at", d7),
        base().gte("submitted_at", d30),
        base().gte("submitted_at", d90),
      ]);
      return { d7: r7.count || 0, d30: r30.count || 0, d90: r90.count || 0 };
    },
    enabled: !!orgId && !!selectedFormId,
  });

  const createExport = useMutation({
    mutationFn: async ({ formId, from, to }: { formId?: string; from?: Date; to?: Date }) => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const { data: inserted, error } = await supabase.from("export_jobs").insert({
        org_id: orgId,
        created_by: session.user.id,
        format: exportFormat,
        status: "queued",
        start_date: from ? format(from, "yyyy-MM-dd") : null,
        end_date: to ? format(to, "yyyy-MM-dd") : null,
        filters_json: formId ? { form_id: formId } : {},
      }).select("id").single();
      if (error) throw error;

      // Trigger the processor and await result. If invocation fails, mark
      // the job failed in the DB so it doesn't sit "queued" forever.
      const { error: fnError } = await supabase.functions.invoke("process-export", {
        body: { job_id: inserted.id },
      });
      if (fnError) {
        console.error("Export function error:", fnError);
        await supabase.from("export_jobs").update({
          status: "failed",
          error: `Processor invocation failed: ${fnError.message ?? "unknown error"}`,
          completed_at: new Date().toISOString(),
        }).eq("id", inserted.id);
        queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
        throw new Error("Export processing failed — please retry.");
      }

      // Fetch the completed job to get file_path
      const { data: completedJob } = await supabase
        .from("export_jobs")
        .select("file_path, status, row_count")
        .eq("id", inserted.id)
        .single();

      // Audit log (best-effort, never blocks)
      const scope = formId
        ? `form:${formId}${from ? `:from=${format(from, "yyyy-MM-dd")}` : ""}${to ? `:to=${format(to, "yyyy-MM-dd")}` : ""}`
        : `all_forms${from ? `:from=${format(from, "yyyy-MM-dd")}` : ""}${to ? `:to=${format(to, "yyyy-MM-dd")}` : ""}`;
      await logExportAudit({
        orgId,
        userId: session.user.id,
        roleAtExport: resolveExportRole({ orgRole, isPlatformAdmin }),
        exportType: `leads_${exportFormat}`,
        exportScope: scope,
        exportJobId: inserted.id,
        metadata: { source: "Exports", form_id: formId ?? null },
      });

      return { job: completedJob, formId, from, to };
    },
    onSuccess: ({ job, formId, from, to }) => {
      queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
      if (job?.file_path) {
        toast.success(`Export ready — ${job.row_count ?? 0} rows. Downloading now…`);
        handleDownload(job.file_path);
      } else if (job?.status === "succeeded" && !job?.file_path) {
        // Empty result — explain *why* and what window does have data.
        const formName = formId ? forms?.find((f) => f.id === formId)?.name : null;
        const rangeLabel = from && to
          ? `between ${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`
          : from ? `from ${format(from, "MMM d, yyyy")}`
          : to ? `up to ${format(to, "MMM d, yyyy")}`
          : "for the selected filters";
        const total = formId ? leadCounts?.[formId] : null;
        const hint = total != null && total > 0
          ? ` This form has ${total} total entries — try widening the date range.`
          : "";
        toast.info(`No submissions${formName ? ` for ${formName}` : ""} ${rangeLabel}.${hint}`);
      } else {
        toast.success("Export completed");
      }
    },
    onError: (err: any) => toast.error(err.message || "Failed to create export"),
  });

  // Retry a stuck/failed job by re-invoking the processor with its existing job_id.
  const retryJob = async (jobId: string) => {
    try {
      // Reset to queued so the processor will pick it up.
      await supabase.from("export_jobs").update({
        status: "queued", error: null, completed_at: null,
      }).eq("id", jobId);
      queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
      const { error: fnError } = await supabase.functions.invoke("process-export", {
        body: { job_id: jobId },
      });
      if (fnError) {
        await supabase.from("export_jobs").update({
          status: "failed",
          error: `Retry failed: ${fnError.message ?? "unknown error"}`,
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
        toast.error("Retry failed. Please try again.");
      } else {
        toast.success("Retry queued.");
      }
      queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
    } catch (err: any) {
      toast.error(err.message || "Retry failed");
    }
  };

  const runPendingExport = () => {
    if (!pendingExport) return;
    if (pendingExport.kind === "all") {
      createExport.mutate({});
    } else {
      createExport.mutate({ formId: pendingExport.formId, from: pendingExport.from, to: pendingExport.to });
    }
  };

  const handleDownload = async (filePath: string) => {
    const { data, error } = await supabase.storage.from("exports").createSignedUrl(filePath, 60);
    if (error) { toast.error("Failed to generate download link"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": case "running": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case "succeeded": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case "failed": return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  // ── Form detail view ──
  if (selectedForm) {
    const dateLabel = dateFrom && dateTo
      ? `${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`
      : dateFrom
        ? `From ${format(dateFrom, "MMM d, yyyy")}`
        : dateTo
          ? `Until ${format(dateTo, "MMM d, yyyy")}`
          : "All time";

    return (
      <div>
        <button
          onClick={() => { setSelectedFormId(null); setDateFrom(undefined); setDateTo(undefined); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Forms
        </button>

        <h1 className="text-2xl font-bold text-foreground mb-1">{selectedForm.name}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {selectedForm.provider} · {leadCounts?.[selectedForm.id] ?? "—"} total leads
          {selectedFormCounts && (
            <> · <span className="text-foreground/80">{selectedFormCounts.d7}</span> last 7d
              · <span className="text-foreground/80">{selectedFormCounts.d30}</span> last 30d
              · <span className="text-foreground/80">{selectedFormCounts.d90}</span> last 90d</>
          )}
        </p>

        <div className="rounded-lg border border-border bg-card p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Export Leads
          </h3>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { label: "Last 7 days", days: 7 },
              { label: "Last 30 days", days: 30 },
              { label: "Last 90 days", days: 90 },
            ].map((p) => (
              <Button
                key={p.days}
                variant="outline"
                size="sm"
                onClick={() => {
                  const to = new Date();
                  const from = new Date();
                  from.setDate(from.getDate() - p.days);
                  setDateFrom(from);
                  setDateTo(to);
                }}
              >
                {p.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}
            >
              All time
            </Button>
          </div>

          {/* Date range pickers */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                Clear dates
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">XLSX</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => setPendingExport({ kind: "form", formId: selectedForm.id, from: dateFrom, to: dateTo })}
              disabled={createExport.isPending}
            >
              {createExport.isPending ? "Queuing…" : `Export ${dateLabel}`}
            </Button>
          </div>
        </div>

        {/* Export history for this form */}
        <ExportHistory jobs={jobs} jobsLoading={jobsLoading} statusIcon={statusIcon} handleDownload={handleDownload} retryJob={retryJob} />

        <ExportConfirmDialog
          open={!!pendingExport}
          onOpenChange={(open) => { if (!open) setPendingExport(null); }}
          onConfirm={runPendingExport}
        />
      </div>
    );
  }

  // ── Form list view ──
  return (
    <div>
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <ExportsTabs
        orgName={orgName}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        setPendingExport={setPendingExport}
        createPending={createExport.isPending}
        forms={forms}
        formsLoading={formsLoading}
        leadCounts={leadCounts}
        setSelectedFormId={setSelectedFormId}
        jobs={jobs}
        jobsLoading={jobsLoading}
        statusIcon={statusIcon}
        handleDownload={handleDownload}
        retryJob={retryJob}
        t={t}
      />

      <ExportConfirmDialog
        open={!!pendingExport}
        onOpenChange={(open) => { if (!open) setPendingExport(null); }}
        onConfirm={runPendingExport}
      />
    </div>
  );
}

function ExportsTabs({
  orgName, exportFormat, setExportFormat, setPendingExport, createPending,
  forms, formsLoading, leadCounts, setSelectedFormId, jobs, jobsLoading,
  statusIcon, handleDownload, retryJob, t,
}: any) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "customize" ? "customize" : "data";
  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "data") next.delete("tab"); else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-foreground mb-1">Exports</h1>
      <p className="text-sm text-muted-foreground mb-4">Export data and customize report templates for {orgName}</p>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="data" className="flex-shrink-0 text-xs sm:text-sm">Export Data</TabsTrigger>
          <TabsTrigger value="customize" className="flex-shrink-0 text-xs sm:text-sm">Customize Report</TabsTrigger>
        </TabsList>

        <TabsContent value="data">
          {/* Export All */}
          <div className="rounded-lg border border-border bg-card p-5 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Quick Export — All Forms
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Export all leads across every form as a single file.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={exportFormat} onValueChange={(v: any) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setPendingExport({ kind: "all" })} disabled={createPending}>
                {createPending ? "Queuing…" : "Export All"}
              </Button>
            </div>
          </div>

          {/* Forms List */}
          <div className="rounded-lg border border-border bg-card overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Export by Form</h3>
            </div>
            {formsLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading forms…</div>
            ) : !forms || forms.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {`${t("forms.noFormsYet")} ${t("forms.noFormsSyncedDesc")}`}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {forms.filter((f: any) => !f.archived).map((form: any) => (
                  <button
                    key={form.id}
                    onClick={() => setSelectedFormId(form.id)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{form.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {form.provider} · {leadCounts?.[form.id] ?? "—"} leads
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export History */}
          <ExportHistory jobs={jobs} jobsLoading={jobsLoading} statusIcon={statusIcon} handleDownload={handleDownload} retryJob={retryJob} />
        </TabsContent>

        <TabsContent value="customize">
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm text-foreground font-medium mb-1">Customize the Performance Report</p>
            <p className="text-xs text-muted-foreground">
              Choose which sections and metrics appear in your generated report PDFs. The active template is used by all exports and scheduled reports.
            </p>
          </div>
          <ReportTemplateBuilder />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ExportHistory({
  jobs,
  jobsLoading,
  statusIcon,
  handleDownload,
  retryJob,
}: {
  jobs: any[] | undefined;
  jobsLoading: boolean;
  statusIcon: (s: string) => React.ReactNode;
  handleDownload: (path: string) => void;
  retryJob?: (jobId: string) => void | Promise<void>;
}) {
  const isStuck = (job: any) => {
    if (job.status !== "queued" && job.status !== "running") return false;
    const ageMs = Date.now() - new Date(job.created_at).getTime();
    return ageMs > 2 * 60 * 1000; // older than 2 minutes
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Export History</h3>
      </div>
      {jobsLoading ? (
        <div className="p-12 text-center text-muted-foreground text-sm">Loading exports…</div>
      ) : !jobs || jobs.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground text-sm">
          No exports yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {jobs.map((job) => {
            const stuck = isStuck(job);
            return (
              <div key={job.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {statusIcon(job.status)}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {job.format.toUpperCase()} Export
                      {job.row_count != null && <span className="text-muted-foreground font-normal"> · {job.row_count} rows</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(job.created_at), "MMM d, yyyy 'at' HH:mm")}
                      {stuck && <span className="ml-2 text-warning">· stuck — retry below</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs uppercase ${
                      job.status === "succeeded" ? "text-success border-success/20" :
                      job.status === "failed" ? "text-destructive border-destructive/20" :
                      stuck ? "text-warning border-warning/30" :
                      "text-muted-foreground"
                    }`}
                  >
                    {stuck ? "stuck" : job.status}
                  </Badge>
                  {job.status === "succeeded" && job.file_path && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Download export" onClick={() => handleDownload(job.file_path!)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {(stuck || job.status === "failed") && retryJob && (
                    <Button variant="outline" size="sm" onClick={() => retryJob(job.id)}>
                      Retry
                    </Button>
                  )}
                  {job.status === "failed" && job.error && !stuck && (
                    <span className="text-xs text-destructive max-w-[200px] truncate" title={job.error}>{job.error}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
