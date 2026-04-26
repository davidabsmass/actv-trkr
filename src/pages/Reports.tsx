import { useState } from "react";
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
import ReportTemplateBuilder from "@/components/reports/ReportTemplateBuilder";
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

// ── Monthly Performance Viewer (existing report viewer) ──
function MonthlyPerformanceViewer({ report, onBack }: { report: any; onBack: () => void }) {
  const { t } = useTranslation();
  const { executiveSummary: es, growthEngine: ge, conversionIntelligence: ci, userExperience: ux, actionPlan: ap, siteHealth: sh, formHealth: fh, aiInsights } = report;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {t("reports.backToReports")}
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-1">{t("reports.performanceReport")}</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {format(new Date(report.periodStart), "MMM d")} – {format(new Date(report.periodEnd), "MMM d, yyyy")} · {report.periodDays}-day period
      </p>

      {aiInsights && aiInsights.length > 0 && (
        <Section icon={Sparkles} title={t("reports.aiInsights")}>
          <div className="space-y-3">
            {aiInsights.map((insight: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-primary/5 border border-primary/10">
                <span className="text-xs font-bold text-primary mt-0.5 flex-shrink-0">{i + 1}.</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon={Target} title={t("reports.executiveSummary")}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          {[
            { label: t("reports.leads"), value: es.leads.current, change: es.leads.change },
            { label: t("reports.sessions"), value: es.sessions.current, change: es.sessions.change },
            { label: t("dashboard.pageviews"), value: es.pageviews.current, change: es.pageviews.change },
            { label: t("reports.cvr"), value: `${es.cvr.current}%`, change: es.cvr.change },
            { label: t("reports.weightedLeads"), value: es.weightedLeads, change: null },
          ].map((kpi) => (
            <div key={kpi.label} className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{kpi.label}</p>
              <p className="text-lg font-bold text-foreground">{kpi.value}</p>
              <TrendBadge change={kpi.change} />
            </div>
          ))}
        </div>
        {es.goalTarget && (
          <p className="text-xs text-muted-foreground mb-2">🎯 Monthly goal: {es.goalTarget} leads · {Math.round((es.leads.current / es.goalTarget) * 100)}% achieved</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-success/10 border border-success/20">
            <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">{t("reports.keyWin")}</p>
              <p className="text-xs text-muted-foreground">{es.keyWin}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">{t("reports.keyRisk")}</p>
              <p className="text-xs text-muted-foreground">{es.keyRisk}</p>
            </div>
          </div>
        </div>
      </Section>

      {sh && (
        <Section icon={Activity} title={t("reports.siteHealth")}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: t("reports.uptime"), value: `${sh.uptimePercent}%`, cls: sh.uptimePercent >= 99.5 ? "text-success" : sh.uptimePercent >= 95 ? "text-warning" : "text-destructive" },
              { label: t("reports.downtime"), value: `${sh.totalDowntimeMinutes}m` },
              { label: t("reports.incidents"), value: sh.downtimeIncidents?.length || 0 },
              { label: t("reports.brokenLinks"), value: sh.brokenLinksCount || 0 },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-md bg-muted/50">
                <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{m.label}</p>
                <p className={`text-lg font-bold ${(m as any).cls || "text-foreground"}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {fh && (
        <Section icon={FormInput} title={t("reports.formHealth")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-md bg-muted/50">
             <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{t("reports.totalSubmissions")}</p>
              <p className="text-lg font-bold text-foreground">{fh.totalSubmissions}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{t("reports.failures")}</p>
              <p className={`text-lg font-bold ${fh.totalFailures > 0 ? "text-destructive" : "text-foreground"}`}>{fh.totalFailures}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{t("reports.failureRate")}</p>
              <p className={`text-lg font-bold ${fh.overallFailureRate > 5 ? "text-destructive" : "text-foreground"}`}>{fh.overallFailureRate}%</p>
            </div>
          </div>
        </Section>
      )}

      <Section icon={Globe} title={t("reports.growthEngine")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.trafficBySource")}</p>
            <RankList items={ge.trafficBySource} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.topLandingPages")}</p>
            <RankList items={ge.topLandingPages} />
          </div>
        </div>
      </Section>

      <Section icon={BarChart3} title={t("reports.conversionIntelligence")}>
        {ci.leadsByForm?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("reports.leadsByForm")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">{t("reports.form")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">{t("reports.category")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.weight")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.leads")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.cvr")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.failures")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ci.leadsByForm.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground truncate max-w-[200px]">{f.formName}</td>
                      <td className="py-2 px-3 text-muted-foreground capitalize">{f.formCategory}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{f.weight}x</td>
                      <td className="py-2 px-3 text-right text-foreground">{f.leads}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{f.cvr}%</td>
                      <td className="py-2 px-3 text-right"><span className={f.failures > 0 ? "text-destructive" : "text-muted-foreground"}>{f.failures}</span></td>
                      <td className="py-2 pl-3 text-right text-muted-foreground">${(f.totalValue || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.topConvertingPages")}</p>
            <RankList items={ci.topConvertingPages} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.leadSources")}</p>
            <RankList items={ci.leadSources} />
          </div>
        </div>
      </Section>

      <Section icon={Users} title={t("reports.userExperience")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.deviceBreakdown")}</p>
            <RankList items={ux.deviceBreakdown} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.geography")}</p>
            <RankList items={ux.geoBreakdown} maxItems={10} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.topPages")}</p>
            <RankList items={(ux.topPages || []).slice(0, 10)} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.referrers")}</p>
            <RankList items={ux.referrerBreakdown} />
          </div>
        </div>
      </Section>

      <Section icon={Lightbulb} title={t("reports.actionPlan")}>
        {ap.forecast?.projectedNextMonth > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10 mb-4">
            <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">{t("reports.leadForecast")}</p>
              <p className="text-xs text-muted-foreground">
                Avg. {ap.forecast.avgDailyLeads} leads/day · Projected next month: {Math.round(ap.forecast.projectedNextMonth * 0.9)}–{Math.round(ap.forecast.projectedNextMonth * 1.1)}
              </p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {(ap.recommendations || []).map((a: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
              <p className="text-sm text-foreground">{a}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ReportViewer({ report, onBack }: { report: any; onBack: () => void }) {
  return <MonthlyPerformanceViewer report={report} onBack={onBack} />;
}

// ── Activity Reports Sub-Tab (moved from old Reports page) ──
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
        toast.error("No reports available for this client");
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
      const userId = session?.user?.id;
      const [resp, wlResult, tplResult] = await Promise.all([
        fetch(data.signedUrl),
        orgId ? supabase.from("white_label_settings").select("*").eq("org_id", orgId).maybeSingle() : Promise.resolve({ data: null }),
        orgId && userId ? supabase.from("report_custom_templates" as any).select("sections_config").eq("user_id", userId).eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const report = await resp.json();
      const tplConfig = (tplResult.data as any)?.sections_config || null;
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
          <Button className="sm:ml-auto" onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
            {generateReport.isPending ? t("reports.generatingReport") : t("reports.generateReport")}
          </Button>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSchedule.mutate({ id: s.id, enabled: !s.enabled })}>
                      {s.enabled ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </IconTooltip>
                  <IconTooltip label={t("reports.deleteSchedule", "Delete schedule")}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteSchedule.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewReport(run)}><Eye className="h-4 w-4" /></Button>
                        </IconTooltip>
                        <IconTooltip label={downloadingRunId === run.id ? t("reports.downloading", "Downloading…") : t("reports.downloadReport", "Download report")}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadReport(run)} disabled={downloadingRunId === run.id}>
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
export default function Reports() {
  const { t } = useTranslation();
  const { orgId, orgName } = useOrg();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("reportTab") || "overview";
  const [exportDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [exportDateTo] = useState<Date>(new Date());

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
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold text-foreground">{t("reports.title")}</h1>
          <HowToButton {...HOWTO_REPORTS} />
        </div>
        <AddSiteHeaderButton />
      </div>
      <p className="text-sm text-muted-foreground mb-6">{t("reports.insightsFor", { orgName })}</p>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="flex-shrink-0 text-xs sm:text-sm">{t("reports.overview")}</TabsTrigger>
          <TabsTrigger value="activity" className="flex-shrink-0 text-xs sm:text-sm">{t("reports.activityReports")}</TabsTrigger>
          <TabsTrigger value="customize" className="flex-shrink-0 text-xs sm:text-sm">{t("reports.customize")}</TabsTrigger>
          <TabsTrigger value="archives" className="flex-shrink-0 text-xs sm:text-sm">{t("reports.archives")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="activity"><ActivityReportsTab /></TabsContent>
        <TabsContent value="customize"><ReportTemplateBuilder /></TabsContent>
        <TabsContent value="archives"><ArchivesContent /></TabsContent>
      </Tabs>
    </div>
  );
}
