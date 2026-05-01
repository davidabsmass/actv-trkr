import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { format, subDays, differenceInDays } from "date-fns";
import {
  FileText, Play, Clock, CheckCircle, AlertCircle, Download,
  CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight,
  ArrowLeft, TrendingUp, TrendingDown, Minus, Eye,
  Target, BarChart3, Users, Lightbulb, Globe, CalendarIcon,
  Activity, Shield, Link2, AlertTriangle,
  Sparkles, DollarSign, FormInput,
} from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import OverviewTab from "@/components/reports/OverviewTab";
import ArchivesContent from "@/components/archives/ArchivesContent";
import WhiteLabelSection from "@/components/settings/WhiteLabelSection";
import { PerformanceReportView } from "@/components/reports/PerformanceReportView";
import { HowToButton } from "@/components/HowToButton";
import { HOWTO_REPORTS } from "@/components/howto/page-content";
import { AddSiteHeaderButton } from "@/components/sites/AddSiteHeaderButton";

// ── Shared sub-components ──
const TrendBadge = ({ change }: { change: number | null }) => {
  if (change === null || change === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}{change}%
    </span>
  );
};

const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-card p-5 mb-4">
    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      {title}
    </h3>
    {children}
  </div>
);

const RankList = ({ items, maxItems = 8 }: { items: Array<{ label: string; count: number }>; maxItems?: number }) => {
  const top = (items || []).slice(0, maxItems);
  const maxCount = top[0]?.count || 1;
  return (
    <div className="space-y-3">
      {top.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0 relative h-6 rounded bg-muted/30 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary/15 rounded"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
            <span className="relative z-10 px-2 text-xs font-medium text-foreground truncate block leading-6">
              {item.label}
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground shrink-0 w-10 text-right">{item.count}</span>
        </div>
      ))}
    </div>
  );
};

// ── Report viewer (uses shared PerformanceReportView) ──
function ReportViewer({ report, onBack }: { report: any; onBack: () => void }) {
  return <PerformanceReportView report={report} onBack={onBack} />;
}

// ── Activity Reports Sub-Tab (moved from old Reports page) ──
const ACTIVE_TPL_KEY = (orgId: string) => `actv:activeReportTemplateId:${orgId}`;

function ActivityReportsTab() {
  const { t } = useTranslation();
  const { orgId, orgName } = useOrg();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ frequency: "monthly", runDayOfMonth: 1 });
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [dateRangeMode, setDateRangeMode] = useState<"monthly" | "custom">("monthly");
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const userId = session?.user?.id;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => {
    if (typeof window === "undefined" || !orgId) return null;
    return localStorage.getItem(ACTIVE_TPL_KEY(orgId));
  });

  const { data: templates } = useQuery({
    queryKey: ["report_custom_templates_list", orgId, userId],
    queryFn: async () => {
      if (!orgId || !userId) return [] as any[];
      const { data } = await supabase
        .from("report_custom_templates" as any)
        .select("id, name, sections_config, created_at")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!orgId && !!userId,
  });

  // Sync selection with available templates
  useEffect(() => {
    if (!templates || !orgId) return;
    const stored = localStorage.getItem(ACTIVE_TPL_KEY(orgId));
    if (stored && templates.some((tt: any) => tt.id === stored)) {
      setSelectedTemplateId(stored);
    } else if (templates.length > 0) {
      setSelectedTemplateId(templates[templates.length - 1].id);
    } else {
      setSelectedTemplateId(null);
    }
  }, [templates, orgId]);

  const onPickTemplate = (id: string) => {
    const next = id || null;
    setSelectedTemplateId(next);
    if (orgId) {
      if (next) localStorage.setItem(ACTIVE_TPL_KEY(orgId), next);
      else localStorage.removeItem(ACTIVE_TPL_KEY(orgId));
    }
  };

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["report_runs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("report_runs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      return data?.some((r) => r.status === "queued" || r.status === "running") ? 3000 : false;
    },
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ["report_schedules", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("report_schedules").select("*").eq("org_id", orgId).order("frequency", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const generateReport = useMutation({
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const periodDays = differenceInDays(dateTo, dateFrom) || 30;
      const params = { period_days: periodDays, start_date: format(dateFrom, "yyyy-MM-dd"), end_date: format(dateTo, "yyyy-MM-dd"), compare_mode: "none" };
      const { data: inserted, error } = await supabase.from("report_runs").insert({ org_id: orgId, template_slug: "monthly_performance", created_by: session.user.id, params, status: "queued" }).select("id").single();
      if (error) throw error;
      supabase.functions.invoke("process-report", { body: { run_id: inserted.id } }).catch(() => {});
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["report_runs"] }); toast.success("Report generation started"); },
    onError: (err: any) => {
      if (err.message?.includes("row-level security") || err.code === "42501") {
        toast.error("You don't have permission to generate reports for this client. Ask an admin to grant access.");
      } else {
        toast.error(err.message || "Failed");
      }
    },
  });

  const viewReport = async (run: any) => {
    if (!run.file_path) return;
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(run.file_path, 60);
      if (error) throw error;
      const resp = await fetch(data.signedUrl);
      setViewingReport(await resp.json());
    } catch { toast.error("Failed to load report"); }
  };

  const downloadReport = async (run: any) => {
    if (!run.file_path) return;
    setDownloadingRunId(run.id);
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(run.file_path, 60);
      if (error) throw error;
      const tplPromise = (orgId && userId && selectedTemplateId)
        ? supabase.from("report_custom_templates" as any).select("sections_config").eq("id", selectedTemplateId).maybeSingle()
        : Promise.resolve({ data: null });
      const [resp, wlResult, tplResult] = await Promise.all([
        fetch(data.signedUrl),
        orgId ? supabase.from("white_label_settings").select("*").eq("org_id", orgId).maybeSingle() : Promise.resolve({ data: null }),
        tplPromise,
      ]);
      const report = await resp.json();
      const tplConfig = (tplResult.data as any)?.sections_config ?? null;
      const { buildReportPdf } = await import("@/lib/report-pdf");
      const doc = await buildReportPdf(report, run, wlResult.data, tplConfig);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${format(new Date(run.created_at), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("PDF downloaded");
    } catch { toast.error("Failed to download"); } finally {
      setDownloadingRunId(null);
    }
  };

  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const freq = newSchedule.frequency === "monthly_today" ? "monthly" : newSchedule.frequency;
      const day = newSchedule.frequency === "monthly_today" ? new Date().getDate() : (newSchedule.frequency === "monthly" ? newSchedule.runDayOfMonth : 1);
      const { error } = await supabase.from("report_schedules").insert({ org_id: orgId, template_slug: "monthly_performance", frequency: freq, run_day_of_month: day });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["report_schedules"] }); toast.success("Schedule created"); setScheduleOpen(false); },
    onError: (err: any) => toast.error(err.message || "Failed"),
  });

  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editRunDay, setEditRunDay] = useState<number>(1);
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);

  const toggleSchedule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("report_schedules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report_schedules"] }),
  });

  const updateScheduleDay = useMutation({
    mutationFn: async ({ id, day }: { id: string; day: number }) => {
      const { error } = await supabase.from("report_schedules").update({ run_day_of_month: day }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["report_schedules"] }); setEditingScheduleId(null); toast.success("Updated"); },
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["report_schedules"] }); toast.success("Deleted"); },
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case "running": return <Play className="h-3.5 w-3.5 text-primary animate-pulse" />;
      case "succeeded": case "completed": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case "failed": case "error": return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const dayLabel = (d: number) => d === 0 ? "First day" : d === -1 ? "Last day" : d === 1 ? "1st" : d === 2 ? "2nd" : d === 3 ? "3rd" : `${d}th`;
  const dayOptions = [{ value: "0", label: t("reports.firstDayOfMonth") }, { value: "-1", label: t("reports.lastDayOfMonth") }, ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: dayLabel(i + 1) }))];

  if (viewingReport) return <ReportViewer report={viewingReport} onBack={() => setViewingReport(null)} />;

  return (
    <div className="space-y-6">
      {/* Generate */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> {t("reports.generateAReport")}</h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">{t("reports.dateRange")}:</label>
            <div className="flex items-center gap-1">
              {(["monthly", "custom"] as const).map((mode) => (
                <Button key={mode} variant={dateRangeMode === mode ? "default" : "outline"} size="sm" className="text-xs h-7 px-3 capitalize"
                  onClick={() => { setDateRangeMode(mode); if (mode === "monthly") { setDateFrom(subDays(new Date(), 30)); setDateTo(new Date()); } }}>
                  {mode === "monthly" ? t("reports.last30Days") : t("reports.customRange")}
                </Button>
              ))}
            </div>
          </div>
          {dateRangeMode === "custom" ? (
            <div className="flex items-center gap-2">
              <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} defaultMonth={dateFrom} onSelect={(d) => d && setDateFrom(d)} disabled={(d) => d > dateTo || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} /></PopoverContent></Popover>
              <span className="text-xs text-muted-foreground">to</span>
              <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateTo ? format(dateTo, "MMM d, yyyy") : "End"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} defaultMonth={dateTo} onSelect={(d) => d && setDateTo(d)} disabled={(d) => d < dateFrom || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} /></PopoverContent></Popover>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium text-muted-foreground">Template:</label>
            <Select
              value={selectedTemplateId ?? "__default__"}
              onValueChange={(v) => onPickTemplate(v === "__default__" ? "" : v)}
            >
              <SelectTrigger className="h-8 w-[240px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Default (all sections)</SelectItem>
                {(templates || []).map((tt: any) => (
                  <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Used for PDF exports.</span>
            <Button className="sm:ml-auto" onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
              {generateReport.isPending ? t("reports.generatingReport") : t("reports.generateReport")}
            </Button>
          </div>
        </div>
      </div>

      {/* Schedules */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> {t("reports.scheduledReports")}</h3>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> {t("reports.addSchedule")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("reports.newReportSchedule")}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("reports.frequency")}</label>
                  <Select value={newSchedule.frequency} onValueChange={(v) => setNewSchedule((s) => ({ ...s, frequency: v, ...(v === "monthly_today" ? { runDayOfMonth: new Date().getDate() } : {}) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">{t("reports.weeklyFreq")}</SelectItem><SelectItem value="monthly">{t("reports.monthlyFreq")}</SelectItem><SelectItem value="monthly_today">{t("reports.thisDayEachMonth", { day: dayLabel(new Date().getDate()) })}</SelectItem></SelectContent></Select>
                </div>
                {(newSchedule.frequency === "monthly") && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">{t("reports.dayOfMonth")}</label>
                    <Select value={String(newSchedule.runDayOfMonth)} onValueChange={(v) => setNewSchedule((s) => ({ ...s, runDayOfMonth: parseInt(v) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{dayOptions.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent></Select>
                  </div>
                )}
                {newSchedule.frequency === "monthly_today" && (
                  <p className="text-xs text-muted-foreground">Report will generate on the {dayLabel(new Date().getDate())} of every month.</p>
                )}
                <Button className="w-full" disabled={createSchedule.isPending} onClick={() => createSchedule.mutate()}>{createSchedule.isPending ? t("reports.creatingSchedule") : t("reports.createSchedule")}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {!schedules?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t("reports.noSchedules")}</div>
        ) : (
          <div className="divide-y divide-border">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className={`h-4 w-4 ${s.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("reports.performanceReport")}</p>
                    <p className="text-xs text-muted-foreground">{s.frequency === "weekly" ? t("reports.everyWeek") : `${t("reports.monthlyFreq")} · ${dayLabel(s.run_day_of_month)}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs uppercase">{s.frequency}</Badge>
                  <IconTooltip label={s.enabled ? t("reports.disableSchedule", "Disable schedule") : t("reports.enableSchedule", "Enable schedule")}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSchedule.mutate({ id: s.id, enabled: !s.enabled })} aria-label={s.enabled ? t("reports.disableSchedule", "Disable schedule") : t("reports.enableSchedule", "Enable schedule")}>
                      {s.enabled ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </IconTooltip>
                  <IconTooltip label={t("reports.deleteSchedule", "Delete schedule")}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteSchedule.mutate(s.id)} aria-label={t("reports.deleteSchedule", "Delete schedule")}><Trash2 className="h-4 w-4" /></Button>
                  </IconTooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border"><h3 className="text-sm font-semibold text-foreground">{t("reports.reportHistory")}</h3></div>
        {!runs?.length ? (
          <div className="p-12 text-center text-muted-foreground text-sm">{t("reports.noReports")}</div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => {
              const params = run.params as Record<string, any> | null;
              return (
                <div key={run.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    {statusIcon(run.status)}
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("reports.performanceReport")}</p>
                      <p className="text-xs text-muted-foreground">
                        {params?.start_date && params?.end_date ? `${format(new Date(params.start_date), "MMM d")} – ${format(new Date(params.end_date), "MMM d, yyyy")}` : format(new Date(run.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs uppercase ${run.status === "succeeded" || run.status === "completed" ? "text-success border-success/20" : run.status === "failed" || run.status === "error" ? "text-destructive border-destructive/20" : "text-muted-foreground"}`}>
                      {run.status === "succeeded" ? "completed" : run.status}
                    </Badge>
                    {(run.status === "succeeded" || run.status === "completed") && run.file_path && (
                      <>
                        <IconTooltip label={t("reports.viewReport", "View report")}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewReport(run)} aria-label={t("reports.viewReport", "View report")}><Eye className="h-4 w-4" /></Button>
                        </IconTooltip>
                        <IconTooltip label={downloadingRunId === run.id ? t("reports.downloading", "Downloading…") : t("reports.downloadReport", "Download report")}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadReport(run)} disabled={downloadingRunId === run.id} aria-label={downloadingRunId === run.id ? t("reports.downloading", "Downloading…") : t("reports.downloadReport", "Download report")}>
                            {downloadingRunId === run.id ? <Download className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
                          </Button>
                        </IconTooltip>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Reports Page ──
export default function Reports({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const { orgId, orgName } = useOrg();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedTab = searchParams.get("reportTab") || "overview";
  const activeTab = requestedTab === "customize" ? "overview" : requestedTab;
  const [exportDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [exportDateTo] = useState<Date>(new Date());

  // Customize moved to Exports — redirect any legacy links.
  useEffect(() => {
    if (requestedTab === "customize") {
      navigate("/exports?tab=customize", { replace: true });
    }
  }, [requestedTab, navigate]);

  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("reportTab", value);
    setSearchParams(newParams, { replace: true });
  };

  const generateQuickReport = useMutation({
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const periodDays = differenceInDays(exportDateTo, exportDateFrom) || 30;
      const params = { period_days: periodDays, start_date: format(exportDateFrom, "yyyy-MM-dd"), end_date: format(exportDateTo, "yyyy-MM-dd"), compare_mode: "none" };
      const { data: inserted, error } = await supabase.from("report_runs").insert({ org_id: orgId, template_slug: "monthly_performance", created_by: session.user.id, params, status: "queued" }).select("id").single();
      if (error) throw error;
      supabase.functions.invoke("process-report", { body: { run_id: inserted.id } }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_runs"] });
      toast.success(t("reports.reportGenStarted"));
      const newParams = new URLSearchParams(searchParams);
      newParams.set("reportTab", "activity");
      setSearchParams(newParams, { replace: true });
    },
    onError: (err: any) => toast.error(err.message || "Failed to generate report"),
  });

  return (
    <div>
      {!embedded && (
        <>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl font-bold text-foreground">{t("reports.title")}</h1>
              <HowToButton {...HOWTO_REPORTS} />
            </div>
            <AddSiteHeaderButton />
          </div>
          <p className="text-sm text-muted-foreground mb-6">{t("reports.insightsFor", { orgName })}</p>
        </>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="flex-shrink-0 text-xs sm:text-sm">{t("reports.overview")}</TabsTrigger>
          <TabsTrigger value="activity" className="flex-shrink-0 text-xs sm:text-sm">{t("reports.activityReports")}</TabsTrigger>
          <TabsTrigger value="white-label" className="flex-shrink-0 text-xs sm:text-sm">White Label</TabsTrigger>
          <TabsTrigger value="archives" className="flex-shrink-0 text-xs sm:text-sm">{t("reports.archives")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="activity"><ActivityReportsTab /></TabsContent>
        <TabsContent value="white-label"><WhiteLabelSection /></TabsContent>
        <TabsContent value="archives"><ArchivesContent /></TabsContent>
      </Tabs>
    </div>
  );
}
