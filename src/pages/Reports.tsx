import { useState } from "react";
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
import WeeklyTab from "@/components/reports/WeeklyTab";
import MonthlyTab from "@/components/reports/MonthlyTab";
import SeoTab from "@/components/reports/SeoTab";

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
    <div className="space-y-2">
      {top.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-foreground truncate">{item.label}</span>
              <span className="text-xs text-muted-foreground ml-2">{item.count}</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Monthly Performance Viewer (existing report viewer) ──
function MonthlyPerformanceViewer({ report, onBack }: { report: any; onBack: () => void }) {
  const { executiveSummary: es, growthEngine: ge, conversionIntelligence: ci, userExperience: ux, actionPlan: ap, siteHealth: sh, formHealth: fh, aiInsights } = report;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Reports
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-1">Performance Report</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {format(new Date(report.periodStart), "MMM d")} – {format(new Date(report.periodEnd), "MMM d, yyyy")} · {report.periodDays}-day period
      </p>

      {aiInsights && aiInsights.length > 0 && (
        <Section icon={Sparkles} title="AI Insights">
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

      <Section icon={Target} title="Executive Summary">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          {[
            { label: "Leads", value: es.leads.current, change: es.leads.change },
            { label: "Sessions", value: es.sessions.current, change: es.sessions.change },
            { label: "Pageviews", value: es.pageviews.current, change: es.pageviews.change },
            { label: "CVR", value: `${es.cvr.current}%`, change: es.cvr.change },
            { label: "Weighted Leads", value: es.weightedLeads, change: null },
          ].map((kpi) => (
            <div key={kpi.label} className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{kpi.label}</p>
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
              <p className="text-xs font-medium text-foreground">Key Win</p>
              <p className="text-xs text-muted-foreground">{es.keyWin}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Key Risk</p>
              <p className="text-xs text-muted-foreground">{es.keyRisk}</p>
            </div>
          </div>
        </div>
      </Section>

      {sh && (
        <Section icon={Activity} title="Site Health & Uptime">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Uptime", value: `${sh.uptimePercent}%`, cls: sh.uptimePercent >= 99.5 ? "text-success" : sh.uptimePercent >= 95 ? "text-warning" : "text-destructive" },
              { label: "Downtime", value: `${sh.totalDowntimeMinutes}m` },
              { label: "Incidents", value: sh.downtimeIncidents?.length || 0 },
              { label: "Broken Links", value: sh.brokenLinksCount || 0 },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-md bg-muted/50">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{m.label}</p>
                <p className={`text-lg font-bold ${(m as any).cls || "text-foreground"}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {fh && (
        <Section icon={FormInput} title="Form Health">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Total Submissions</p>
              <p className="text-lg font-bold text-foreground">{fh.totalSubmissions}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Failures</p>
              <p className={`text-lg font-bold ${fh.totalFailures > 0 ? "text-destructive" : "text-foreground"}`}>{fh.totalFailures}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Failure Rate</p>
              <p className={`text-lg font-bold ${fh.overallFailureRate > 5 ? "text-destructive" : "text-foreground"}`}>{fh.overallFailureRate}%</p>
            </div>
          </div>
        </Section>
      )}

      <Section icon={Globe} title="Growth Engine">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Traffic by Source</p>
            <RankList items={ge.trafficBySource} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top Landing Pages</p>
            <RankList items={ge.topLandingPages} />
          </div>
        </div>
      </Section>

      <Section icon={BarChart3} title="Conversion Intelligence">
        {ci.leadsByForm?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Leads by Form</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Form</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Category</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Weight</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Leads</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">CVR</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Failures</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Value</th>
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top Converting Pages</p>
            <RankList items={ci.topConvertingPages} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Lead Sources</p>
            <RankList items={ci.leadSources} />
          </div>
        </div>
      </Section>

      <Section icon={Users} title="User Experience Signals">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Device Breakdown</p>
            <RankList items={ux.deviceBreakdown} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Geography</p>
            <RankList items={ux.geoBreakdown} maxItems={10} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top Pages</p>
            <RankList items={(ux.topPages || []).slice(0, 10)} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Referrers</p>
            <RankList items={ux.referrerBreakdown} />
          </div>
        </div>
      </Section>

      <Section icon={Lightbulb} title="Action Plan & Forecast">
        {ap.forecast?.projectedNextMonth > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10 mb-4">
            <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Lead Forecast</p>
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
    onError: (err: any) => toast.error(err.message || "Failed"),
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
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(run.file_path, 60);
      if (error) throw error;
      const resp = await fetch(data.signedUrl);
      const report = await resp.json();
      const { buildReportPdf } = await import("@/lib/report-pdf");
      const doc = await buildReportPdf(report, run);
      doc.save(`report-${format(new Date(run.created_at), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF downloaded");
    } catch { toast.error("Failed to download"); }
  };

  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.from("report_schedules").insert({ org_id: orgId, template_slug: "monthly_performance", frequency: newSchedule.frequency, run_day_of_month: newSchedule.frequency === "monthly" ? newSchedule.runDayOfMonth : 1 });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["report_schedules"] }); toast.success("Schedule created"); setScheduleOpen(false); },
    onError: (err: any) => toast.error(err.message || "Failed"),
  });

  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editRunDay, setEditRunDay] = useState<number>(1);

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
  const dayOptions = [{ value: "0", label: "First day of month" }, { value: "-1", label: "Last day of month" }, ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: dayLabel(i + 1) }))];

  if (viewingReport) return <ReportViewer report={viewingReport} onBack={() => setViewingReport(null)} />;

  return (
    <div className="space-y-6">
      {/* Generate */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Generate a Report</h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Date Range:</label>
            <div className="flex items-center gap-1">
              {(["monthly", "custom"] as const).map((mode) => (
                <Button key={mode} variant={dateRangeMode === mode ? "default" : "outline"} size="sm" className="text-xs h-7 px-3 capitalize"
                  onClick={() => { setDateRangeMode(mode); if (mode === "monthly") { setDateFrom(subDays(new Date(), 30)); setDateTo(new Date()); } }}>
                  {mode === "monthly" ? "Last 30 Days" : "Custom Range"}
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
            {generateReport.isPending ? "Generating…" : "Generate Report"}
          </Button>
        </div>
      </div>

      {/* Schedules */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Scheduled Reports</h3>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Schedule</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Report Schedule</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Frequency</label>
                  <Select value={newSchedule.frequency} onValueChange={(v) => setNewSchedule((s) => ({ ...s, frequency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select>
                </div>
                {newSchedule.frequency === "monthly" && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Day of Month</label>
                    <Select value={String(newSchedule.runDayOfMonth)} onValueChange={(v) => setNewSchedule((s) => ({ ...s, runDayOfMonth: parseInt(v) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{dayOptions.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent></Select>
                  </div>
                )}
                <Button className="w-full" disabled={createSchedule.isPending} onClick={() => createSchedule.mutate()}>{createSchedule.isPending ? "Creating…" : "Create Schedule"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {!schedules?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No scheduled reports yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className={`h-4 w-4 ${s.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Performance Report</p>
                    <p className="text-xs text-muted-foreground">{s.frequency === "weekly" ? "Every week" : `Monthly · ${dayLabel(s.run_day_of_month)}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">{s.frequency}</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSchedule.mutate({ id: s.id, enabled: !s.enabled })}>
                    {s.enabled ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteSchedule.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border"><h3 className="text-sm font-semibold text-foreground">Report History</h3></div>
        {!runs?.length ? (
          <div className="p-12 text-center text-muted-foreground text-sm">No reports generated yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => {
              const params = run.params as Record<string, any> | null;
              return (
                <div key={run.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    {statusIcon(run.status)}
                    <div>
                      <p className="text-sm font-medium text-foreground">Performance Report</p>
                      <p className="text-xs text-muted-foreground">
                        {params?.start_date && params?.end_date ? `${format(new Date(params.start_date), "MMM d")} – ${format(new Date(params.end_date), "MMM d, yyyy")}` : format(new Date(run.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] uppercase ${run.status === "succeeded" || run.status === "completed" ? "text-success border-success/20" : run.status === "failed" || run.status === "error" ? "text-destructive border-destructive/20" : "text-muted-foreground"}`}>
                      {run.status === "succeeded" ? "completed" : run.status}
                    </Badge>
                    {(run.status === "succeeded" || run.status === "completed") && run.file_path && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewReport(run)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadReport(run)}><Download className="h-4 w-4" /></Button>
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
  const { orgName } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-6">Insights and summaries for {orgName}</p>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Summary</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
          <TabsTrigger value="seo" className="gap-1.5">
            SEO Insights
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider px-1.5 py-0 h-4 text-primary border-primary/30 ml-1">Beta</Badge>
          </TabsTrigger>
          <TabsTrigger value="activity">Activity Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="weekly"><WeeklyTab /></TabsContent>
        <TabsContent value="monthly"><MonthlyTab /></TabsContent>
        <TabsContent value="seo"><SeoTab /></TabsContent>
        <TabsContent value="activity"><ActivityReportsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
