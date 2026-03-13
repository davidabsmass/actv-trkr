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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

// ── Monthly Performance Viewer ──
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

      {/* AI Insights */}
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

      {/* Executive Summary */}
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

      {/* Site Health & Uptime */}
      {sh && (
        <Section icon={Activity} title="Site Health & Uptime">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Uptime</p>
              <p className={`text-lg font-bold ${sh.uptimePercent >= 99.5 ? "text-success" : sh.uptimePercent >= 95 ? "text-warning" : "text-destructive"}`}>
                {sh.uptimePercent}%
              </p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Downtime</p>
              <p className="text-lg font-bold text-foreground">{sh.totalDowntimeMinutes}m</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Incidents</p>
              <p className="text-lg font-bold text-foreground">{sh.downtimeIncidents?.length || 0}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Broken Links</p>
              <p className="text-lg font-bold text-foreground">{sh.brokenLinksCount || 0}</p>
            </div>
          </div>

          {sh.sites?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Current Status</p>
              <div className="flex flex-wrap gap-2">
                {sh.sites.map((s: any, i: number) => (
                  <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.status === "UP" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.status === "UP" ? "bg-success" : "bg-destructive"}`} />
                    {s.domain}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sh.downtimeIncidents?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Downtime Incidents</p>
              <div className="space-y-2">
                {sh.downtimeIncidents.map((inc: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-xs text-foreground">{inc.domain || "Site"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {inc.durationMinutes}m · {format(new Date(inc.startedAt), "MMM d HH:mm")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sh.sslExpiry && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">SSL & Domain</p>
              <div className="flex flex-wrap gap-3">
                {sh.sslExpiry.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-foreground">{s.domain}</span>
                    <span className={`text-xs ${s.daysLeft <= 14 ? "text-destructive" : s.daysLeft <= 30 ? "text-warning" : "text-muted-foreground"}`}>
                      SSL: {s.daysLeft}d left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Form Health */}
      {fh && (
        <Section icon={FormInput} title="Form Health">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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

      {/* Growth Engine */}
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

      {/* Conversion Intelligence */}
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
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Failures</th>
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
                      <td className="py-2 px-3 text-right">
                        <span className={f.failures > 0 ? "text-destructive" : "text-muted-foreground"}>{f.failures}</span>
                      </td>
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

      {/* User Experience */}
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

      {/* Action Plan */}
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
        {ap.contentOpportunities?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Content Opportunities</p>
            <RankList items={(ap.contentOpportunities || []).map((o: any) => ({ label: o.page, count: o.views }))} />
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Report Viewer Router ──
function ReportViewer({ report, onBack }: { report: any; onBack: () => void }) {
  return <MonthlyPerformanceViewer report={report} onBack={onBack} />;
}

// ── Main Reports Page ──
export default function Reports({ embedded }: { embedded?: boolean }) {
  const { orgId, orgName } = useOrg();
  const navigate = useNavigate();
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
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const periodDays = differenceInDays(dateTo, dateFrom) || 30;
      const params: Record<string, any> = {
        period_days: periodDays,
        start_date: format(dateFrom, "yyyy-MM-dd"),
        end_date: format(dateTo, "yyyy-MM-dd"),
        compare_mode: "none",
      };

      const { data: inserted, error } = await supabase.from("report_runs").insert({
        org_id: orgId, template_slug: "monthly_performance", created_by: session.user.id,
        params, status: "queued",
      }).select("id").single();
      if (error) throw error;

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
      const { buildReportPdf } = await import("@/lib/report-pdf");
      const doc = await buildReportPdf(report, run);
      doc.save(`report-${format(new Date(run.created_at), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF report downloaded");
    } catch {
      toast.error("Failed to download report");
    }
  };

  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.from("report_schedules").insert({
        org_id: orgId, template_slug: "monthly_performance", frequency: newSchedule.frequency,
        run_day_of_month: newSchedule.frequency === "monthly" ? newSchedule.runDayOfMonth : 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_schedules"] });
      toast.success("Schedule created");
      setScheduleOpen(false);
      setNewSchedule({ frequency: "monthly", runDayOfMonth: 1 });
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

  if (viewingReport) {
    return <ReportViewer report={viewingReport} onBack={() => setViewingReport(null)} />;
  }

  return (
    <div>
      {!embedded && (
        <>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-foreground mb-1">Reports</h1>
          <p className="text-sm text-muted-foreground mb-6">Generate reports for {orgName}</p>
        </>
      )}

      {/* Generate Report */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Generate a Report
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Date Range:</label>
            <div className="flex items-center gap-1">
              {(["monthly", "custom"] as const).map((mode) => (
                <Button
                  key={mode}
                  variant={dateRangeMode === mode ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 px-3 capitalize"
                  onClick={() => {
                    setDateRangeMode(mode);
                    if (mode === "monthly") {
                      setDateFrom(subDays(new Date(), 30));
                      setDateTo(new Date());
                    }
                  }}
                >
                  {mode === "monthly" ? "Last 30 Days" : "Custom Range"}
                </Button>
              ))}
            </div>
          </div>
          {dateRangeMode === "custom" ? (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} defaultMonth={dateFrom} onSelect={(d) => d && setDateFrom(d)} disabled={(d) => d > dateTo || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
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
                  <Calendar mode="single" selected={dateTo} defaultMonth={dateTo} onSelect={(d) => d && setDateTo(d)} disabled={(d) => d < dateFrom || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              className="sm:ml-auto"
              onClick={() => generateReport.mutate()}
              disabled={generateReport.isPending}
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
                  <Select value={newSchedule.frequency} onValueChange={(v) => setNewSchedule((s) => ({ ...s, frequency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
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
                <Button className="w-full" disabled={createSchedule.isPending} onClick={() => createSchedule.mutate()}>
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
            No scheduled reports yet. Click "Add Schedule" to set up automatic reports.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className={`h-4 w-4 ${s.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Performance Report</p>
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
            No reports generated yet. Click "Generate Report" above to create your first report.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => {
              const params = run.params as Record<string, any> | null;
              const startDate = params?.start_date;
              const endDate = params?.end_date;
              return (
                <div key={run.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    {statusIcon(run.status)}
                    <div>
                      <p className="text-sm font-medium text-foreground">Performance Report</p>
                      <p className="text-xs text-muted-foreground">
                        {startDate && endDate
                          ? `${format(new Date(startDate), "MMM d")} – ${format(new Date(endDate), "MMM d, yyyy")}`
                          : format(new Date(run.created_at), "MMM d, yyyy 'at' HH:mm")}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
