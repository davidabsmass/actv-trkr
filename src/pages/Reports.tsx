import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Report Viewer Component ──
function ReportViewer({ report, onBack }: { report: any; onBack: () => void }) {
  const { executiveSummary: es, growthEngine: ge, conversionIntelligence: ci, userExperience: ux, actionPlan: ap } = report;

  const TrendBadge = ({ change }: { change: number }) => (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}{change}%
    </span>
  );

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

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Reports
      </button>

      <h1 className="text-2xl font-bold text-foreground mb-1">Monthly Performance Report</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {format(new Date(report.periodStart), "MMM d")} – {format(new Date(report.periodEnd), "MMM d, yyyy")} · {report.periodDays}-day period
      </p>

      {/* 1) Executive Summary */}
      <Section icon={Target} title="Executive Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Leads", value: es.leads.current, change: es.leads.change },
            { label: "Sessions", value: es.sessions.current, change: es.sessions.change },
            { label: "Pageviews", value: es.pageviews.current, change: es.pageviews.change },
            { label: "CVR", value: `${es.cvr.current}%`, change: es.cvr.change },
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

      {/* 2) Growth Engine */}
      <Section icon={BarChart3} title="Growth Engine">
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

      {/* 3) Conversion Intelligence */}
      <Section icon={TrendingUp} title="Conversion Intelligence">
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Leads by Form</p>
          <div className="space-y-2">
            {(ci.leadsByForm || []).map((f: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{f.formName}</p>
                  <p className="text-xs text-muted-foreground">{f.formCategory} · {f.weight}× weight</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{f.leads}</p>
                  <TrendBadge change={f.change} />
                </div>
              </div>
            ))}
          </div>
        </div>
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

      {/* 4) User Experience Signals */}
      <Section icon={Users} title="User Experience Signals">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Device Breakdown</p>
            <RankList items={ux.deviceBreakdown} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Geography</p>
            <RankList items={ux.geoBreakdown} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top Pages</p>
            <RankList items={ux.topPages} maxItems={10} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Referrers</p>
            <RankList items={ux.referrerBreakdown} />
          </div>
        </div>
      </Section>

      {/* 5) Action Plan */}
      <Section icon={Lightbulb} title="Action Plan & Forecast">
        {ap.forecast?.projectedNextMonth > 0 && (
          <div className="p-3 rounded-md bg-primary/10 border border-primary/20 mb-4">
            <p className="text-xs font-medium text-foreground">📈 Lead Forecast</p>
            <p className="text-sm text-foreground mt-1">
              Avg. <strong>{ap.forecast.avgDailyLeads}</strong> leads/day → Projected next month: <strong>{Math.round(ap.forecast.projectedNextMonth * 0.9)}–{Math.round(ap.forecast.projectedNextMonth * 1.1)}</strong>
            </p>
          </div>
        )}
        <div className="space-y-3">
          {(ap.recommendations || []).map((rec: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
              <p className="text-sm text-foreground">{rec}</p>
            </div>
          ))}
        </div>
        {ap.contentOpportunities?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Content Opportunities (High Traffic, No Conversions)</p>
            <div className="space-y-1">
              {ap.contentOpportunities.map((o: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs py-1">
                  <span className="text-foreground truncate">{o.page}</span>
                  <span className="text-muted-foreground ml-2">{o.views} views</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Main Reports Page ──
export default function Reports() {
  const { orgId, orgName } = useOrg();
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ template: "", frequency: "weekly", runDayOfMonth: 1 });
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());

  const { data: templates } = useQuery({
    queryKey: ["report_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["report_runs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("report_runs").select("*").eq("org_id", orgId)
        .order("created_at", { ascending: false }).limit(20);
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
      const { data, error } = await supabase
        .from("report_schedules").select("*").eq("org_id", orgId)
        .order("frequency", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const generateReport = useMutation({
    mutationFn: async (templateSlug: string) => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const periodDays = differenceInDays(dateTo, dateFrom) || 30;
      const params = {
        period_days: periodDays,
        start_date: format(dateFrom, "yyyy-MM-dd"),
        end_date: format(dateTo, "yyyy-MM-dd"),
      };
      const { data: inserted, error } = await supabase.from("report_runs").insert({
        org_id: orgId, template_slug: templateSlug, created_by: session.user.id,
        params, status: "queued",
      }).select("id").single();
      if (error) throw error;

      // Trigger the processor
      supabase.functions.invoke("process-report", {
        body: { run_id: inserted.id },
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_runs"] });
      toast.success("Report generation started");
    },
    onError: (err: any) => toast.error(err.message || "Failed to generate report"),
  });

  const viewReport = async (run: any) => {
    if (!run.file_path) return;
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(run.file_path, 60);
      if (error) throw error;
      const resp = await fetch(data.signedUrl);
      const report = await resp.json();
      setViewingReport(report);
    } catch {
      toast.error("Failed to load report");
    }
  };

  const downloadReport = async (run: any) => {
    if (!run.file_path) return;
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(run.file_path, 60);
      if (error) throw error;
      const resp = await fetch(data.signedUrl);
      const report = await resp.json();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${format(new Date(run.created_at), "yyyy-MM-dd")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download report");
    }
  };

  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.from("report_schedules").insert({
        org_id: orgId, template_slug: newSchedule.template, frequency: newSchedule.frequency,
        run_day_of_month: newSchedule.frequency === "monthly" ? newSchedule.runDayOfMonth : 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_schedules"] });
      toast.success("Schedule created");
      setScheduleOpen(false);
      setNewSchedule({ template: "", frequency: "weekly", runDayOfMonth: 1 });
    },
    onError: (err: any) => toast.error(err.message || "Failed to create schedule"),
  });

  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editRunDay, setEditRunDay] = useState<number>(1);

  const toggleSchedule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("report_schedules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report_schedules"] }),
    onError: (err: any) => toast.error(err.message || "Failed to update schedule"),
  });

  const updateScheduleDay = useMutation({
    mutationFn: async ({ id, day }: { id: string; day: number }) => {
      const { error } = await supabase.from("report_schedules").update({ run_day_of_month: day }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_schedules"] });
      setEditingScheduleId(null);
      toast.success("Schedule updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update schedule"),
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_schedules"] });
      toast.success("Schedule deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete schedule"),
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case "running": return <Play className="h-3.5 w-3.5 text-primary animate-pulse" />;
      case "succeeded":
      case "completed": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case "failed":
      case "error": return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const templateName = (slug: string) => templates?.find((t) => t.slug === slug)?.name || slug;

  const dayLabel = (d: number) => {
    if (d === 0) return "First day of month";
    if (d === -1) return "Last day of month";
    return d === 1 ? "1st" : d === 2 ? "2nd" : d === 3 ? "3rd" : d === 21 ? "21st" : d === 22 ? "22nd" : d === 23 ? "23rd" : `${d}th`;
  };

  const dayOptions = [
    { value: "0", label: "First day of month" },
    { value: "-1", label: "Last day of month" },
    ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: dayLabel(i + 1) })),
  ];

  // ── Report Viewer ──
  if (viewingReport) {
    return <ReportViewer report={viewingReport} onBack={() => setViewingReport(null)} />;
  }

  return (
    <div>
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-6">Generate reports for {orgName}</p>

      {/* Generate Report */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Generate a Report
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a report template" />
              </SelectTrigger>
              <SelectContent>
                {(templates || []).map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} disabled={(d) => d > dateTo || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} disabled={(d) => d < dateFrom || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              {[7, 14, 30, 60, 90].map((days) => (
                <Button key={days} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => { setDateFrom(subDays(new Date(), days)); setDateTo(new Date()); }}>
                  {days}d
                </Button>
              ))}
            </div>
            <Button
              className="sm:ml-auto"
              onClick={() => selectedTemplate && generateReport.mutate(selectedTemplate)}
              disabled={!selectedTemplate || generateReport.isPending}
            >
              {generateReport.isPending ? "Generating…" : "Generate Report"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Analyzing {differenceInDays(dateTo, dateFrom)} days: {format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")}
          </p>
        </div>
      </div>

      {/* Scheduled Reports */}
      <div className="rounded-lg border border-border bg-card overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Scheduled Reports
          </h3>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Report Schedule</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Frequency</label>
                  <Select value={newSchedule.frequency} onValueChange={(v) => {
                    const autoTemplate = v === "monthly"
                      ? (templates || []).find((t) => t.slug.includes("monthly") || t.name.toLowerCase().includes("monthly"))?.slug || newSchedule.template
                      : (templates || []).find((t) => t.slug.includes("weekly") || t.name.toLowerCase().includes("weekly"))?.slug || newSchedule.template;
                    setNewSchedule((s) => ({ ...s, frequency: v, template: autoTemplate }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Template</label>
                  <Select value={newSchedule.template} onValueChange={(v) => setNewSchedule((s) => ({ ...s, template: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>
                      {(templates || []).map((t) => (
                        <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newSchedule.frequency === "monthly" && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Day of Month</label>
                    <Select value={String(newSchedule.runDayOfMonth)} onValueChange={(v) => setNewSchedule((s) => ({ ...s, runDayOfMonth: parseInt(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dayOptions.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Report will run on this day each month</p>
                  </div>
                )}
                <Button className="w-full" disabled={!newSchedule.template || createSchedule.isPending} onClick={() => createSchedule.mutate()}>
                  {createSchedule.isPending ? "Creating…" : "Create Schedule"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {schedulesLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading schedules…</div>
        ) : !schedules || schedules.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No scheduled reports yet. Click "Add Schedule" to set up weekly or monthly reports.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className={`h-4 w-4 ${s.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{templateName(s.template_slug)}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.frequency === "weekly" ? "Every week" : `Every month · ${dayLabel(s.run_day_of_month)}`} at {s.run_at_local_time} ({s.timezone})
                      {s.last_run_at && ` · Last run ${format(new Date(s.last_run_at), "MMM d")}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.frequency === "monthly" && editingScheduleId === s.id ? (
                    <div className="flex items-center gap-2">
                      <Select value={String(editRunDay)} onValueChange={(v) => setEditRunDay(parseInt(v))}>
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dayOptions.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 text-xs" disabled={updateScheduleDay.isPending} onClick={() => updateScheduleDay.mutate({ id: s.id, day: editRunDay })}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditingScheduleId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Badge variant="outline" className={`text-[10px] uppercase ${s.frequency === "weekly" ? "text-info border-info/20" : "text-primary border-primary/20"}`}>
                        {s.frequency}
                      </Badge>
                      {s.frequency === "monthly" && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setEditingScheduleId(s.id); setEditRunDay(s.run_day_of_month); }}>
                          <CalendarIcon className="h-3 w-3" /> Edit Day
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSchedule.mutate({ id: s.id, enabled: !s.enabled })} title={s.enabled ? "Disable" : "Enable"}>
                    {s.enabled ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteSchedule.mutate(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report History */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Report History</h3>
        </div>
        {runsLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading reports…</div>
        ) : !runs || runs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No reports generated yet. Select a template above to create your first report.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {statusIcon(run.status)}
                  <div>
                    <p className="text-sm font-medium text-foreground">{templateName(run.template_slug)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(run.created_at), "MMM d, yyyy 'at' HH:mm")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase ${
                      run.status === "succeeded" || run.status === "completed" ? "text-success border-success/20" :
                      run.status === "running" ? "text-primary border-primary/20" :
                      run.status === "failed" || run.status === "error" ? "text-destructive border-destructive/20" :
                      "text-muted-foreground"
                    }`}
                  >
                    {run.status === "succeeded" ? "completed" : run.status}
                  </Badge>
                  {(run.status === "succeeded" || run.status === "completed") && run.file_path && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewReport(run)} title="View Report">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadReport(run)} title="Download Report">
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {(run.status === "failed" || run.status === "error") && run.error && (
                    <span className="text-xs text-destructive max-w-[200px] truncate" title={run.error}>{run.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
