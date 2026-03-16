import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { subDays, subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import {
  Eye, TrendingUp, TrendingDown, Minus, Users, Activity, Sparkles, RefreshCw,
  Lightbulb, Clock, Search, Wifi, Calendar as CalendarIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";
import { SummaryCard, InsightCard } from "./InsightCard";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRange } from "react-day-picker";

type Period = "7d" | "14d" | "30d" | "monthly" | "custom";

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${format(s, "MMM d")}–${format(e, "MMM d")}`;
}

// ── Shared TrendBadge ──
function TrendBadge({ change }: { change: number | null }) {
  if (change === null || change === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}{change}%
    </span>
  );
}

// ────────────────────────────────────────
// Unified data view — uses raw counts like dashboard
// ────────────────────────────────────────
function DataView({ startDate, endDate, prevStartDate, prevEndDate, periodLabel }: {
  startDate: string; endDate: string; prevStartDate: string; prevEndDate: string; periodLabel: string;
}) {
  const { orgId } = useOrg();
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);

  const { data: liveData, isLoading } = useQuery({
    queryKey: ["reports_overview_live", orgId, startDate, endDate, prevStartDate, prevEndDate],
    queryFn: async () => {
      if (!orgId) return null;
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;
      const prevDayStart = `${prevStartDate}T00:00:00Z`;
      const prevDayEnd = `${prevEndDate}T23:59:59.999Z`;

      const [sessRes, prevSessRes, leadsRes, prevLeadsRes, brokenRes, incidentsRes] = await Promise.all([
        supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd),
        supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", prevDayStart).lte("started_at", prevDayEnd),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", dayStart).lte("submitted_at", dayEnd),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", prevDayStart).lte("submitted_at", prevDayEnd),
        supabase.from("broken_links").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("resolved_at", null),
      ]);

      const currentSessions = sessRes.count || 0;
      const previousSessions = prevSessRes.count || 0;
      const currentLeads = leadsRes.count || 0;
      const previousLeads = prevLeadsRes.count || 0;
      const currentCvr = currentSessions > 0 ? Math.round((currentLeads / currentSessions) * 10000) / 100 : 0;
      const previousCvr = previousSessions > 0 ? Math.round((previousLeads / previousSessions) * 10000) / 100 : 0;
      const brokenLinks = brokenRes.count || 0;
      const activeIncidents = incidentsRes.count || 0;

      const inputs: InsightInputs = { currentSessions, previousSessions, currentLeads, previousLeads, currentCvr, previousCvr, brokenLinksCount: brokenLinks, activeIncidents };
      return {
        currentSessions, previousSessions, currentLeads, previousLeads, currentCvr, previousCvr,
        brokenLinks, activeIncidents, findings: generateFindings(inputs),
      };
    },
    enabled: !!orgId,
  });

  const fetchAiSummaries = async () => {
    const findings = liveData?.findings;
    if (!findings?.length) return;
    setLoadingAi(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", {
        body: { findings, report_type: "overview" },
      });
      if (error) throw error;
      const summaries: Record<string, string> = {};
      if (result?.card_summaries) {
        for (const cs of result.card_summaries) summaries[cs.type] = cs.summary;
      }
      if (result?.summary_paragraph) summaries._paragraph = result.summary_paragraph;
      setAiSummaries(summaries);
    } catch {
      toast.error("Failed to generate AI summaries");
    } finally {
      setLoadingAi(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!liveData) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">ACTV TRKR is collecting activity data. Insights will appear once enough data is available.</p>
      </div>
    );
  }

  const { currentSessions, previousSessions, currentLeads, previousLeads, currentCvr, previousCvr, brokenLinks, activeIncidents, findings } = liveData;
  const sessionsPct = pctChange(currentSessions, previousSessions);
  const leadsPct = pctChange(currentLeads, previousLeads);
  const cvrPct = pctChange(currentCvr, previousCvr);

  const currentRange = formatRange(startDate, endDate);
  const previousRange = formatRange(prevStartDate, prevEndDate);

  const negativeFindings = findings.filter((f: any) => !f.positive).slice(0, 5);
  const positiveFindings = findings.filter((f: any) => f.positive).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] text-muted-foreground">
            {currentRange} vs {previousRange}
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5">
            <Wifi className="h-2.5 w-2.5" /> Live
          </span>
          <button onClick={fetchAiSummaries} disabled={loadingAi}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50 ml-auto">
            {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loadingAi ? "Generating…" : "AI Summaries"}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label={`Traffic (${periodLabel})`} value={currentSessions.toLocaleString()} change={sessionsPct} changeLabel={`vs prior ${periodLabel}`} summary={aiSummaries.traffic_up || aiSummaries.traffic_down} />
          <SummaryCard label={`Leads (${periodLabel})`} value={currentLeads.toLocaleString()} change={leadsPct} changeLabel={`vs prior ${periodLabel}`} summary={aiSummaries.lead_growth || aiSummaries.lead_drop} />
          <SummaryCard label={`CVR (${periodLabel})`} value={`${currentCvr}%`} change={cvrPct} changeLabel={`vs prior ${periodLabel}`} summary={aiSummaries.conversion_gain || aiSummaries.conversion_drop} />
          <SummaryCard label="Site Health" value={activeIncidents > 0 ? `${activeIncidents} issues` : "Healthy"} summary={brokenLinks > 5 ? `${brokenLinks} broken links detected.` : undefined} />
        </div>
      </div>

      {findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Key Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {findings.slice(0, 4).map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}
          </div>
        </div>
      )}

      {negativeFindings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-destructive" /> Needs Attention</h3>
          <div className="space-y-2">{negativeFindings.map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}</div>
        </div>
      )}

      {positiveFindings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-success" /> What's Working</h3>
          <div className="space-y-2">{positiveFindings.map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}</div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// Main export — unified with period toggle + custom range
// ────────────────────────────────────────
export default function OverviewTab() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("7d");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);

  // Compute date ranges based on period
  const { startDate, endDate, prevStartDate, prevEndDate, periodLabel } = (() => {
    if (period === "custom" && customRange) {
      const diffMs = customRange.to.getTime() - customRange.from.getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      return {
        startDate: format(customRange.from, "yyyy-MM-dd"),
        endDate: format(customRange.to, "yyyy-MM-dd"),
        prevStartDate: format(subDays(customRange.from, diffDays), "yyyy-MM-dd"),
        prevEndDate: format(subDays(customRange.from, 1), "yyyy-MM-dd"),
        periodLabel: `${format(customRange.from, "MMM d")}–${format(customRange.to, "MMM d")}`,
      };
    }

    if (period === "monthly") {
      const monthStart = startOfMonth(subMonths(now, 1));
      const monthEnd = endOfMonth(subMonths(now, 1));
      const prevMonthStart = startOfMonth(subMonths(now, 2));
      const prevMonthEnd = endOfMonth(subMonths(now, 2));
      return {
        startDate: format(monthStart, "yyyy-MM-dd"),
        endDate: format(monthEnd, "yyyy-MM-dd"),
        prevStartDate: format(prevMonthStart, "yyyy-MM-dd"),
        prevEndDate: format(prevMonthEnd, "yyyy-MM-dd"),
        periodLabel: "month",
      };
    }

    // Default: 7d, 14d, 30d
    const d = period === "14d" ? 14 : period === "30d" ? 30 : 7;
    return {
      startDate: format(subDays(now, d), "yyyy-MM-dd"),
      endDate: format(now, "yyyy-MM-dd"),
      prevStartDate: format(subDays(now, d * 2), "yyyy-MM-dd"),
      prevEndDate: format(subDays(now, d), "yyyy-MM-dd"),
      periodLabel: `${d}d`,
    };
  })();

  const presetOptions: { key: Period; label: string }[] = [
    { key: "7d", label: "7 Days" },
    { key: "14d", label: "14 Days" },
    { key: "30d", label: "30 Days" },
    
    { key: "monthly", label: "Monthly" },
  ];

  return (
    <div className="space-y-6">
      {/* At a Glance header with period toggle + custom range */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" /> At a Glance
        </h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
            {presetOptions.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setPeriod(o.key);
                  setCustomRange(null);
                }}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  period === o.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}

            <Popover
              open={customOpen}
              onOpenChange={(open) => {
                setCustomOpen(open);
                if (open) {
                  setPendingRange(
                    customRange
                      ? { from: customRange.from, to: customRange.to }
                      : { from: subDays(now, 30), to: now }
                  );
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors inline-flex items-center gap-1.5 ${
                    period === "custom"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {period === "custom" && customRange
                    ? `${format(customRange.from, "MMM d")}–${format(customRange.to, "MMM d")}`
                    : "Custom"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="end">
                <Calendar
                  mode="range"
                  selected={pendingRange}
                  onSelect={setPendingRange}
                  numberOfMonths={2}
                  defaultMonth={pendingRange?.from || customRange?.from || now}
                  disabled={(date) => date > now}
                  className="p-2 pointer-events-auto text-xs"
                />
                <div className="flex justify-end gap-2 mt-2 px-1">
                  <button
                    onClick={() => setCustomOpen(false)}
                    className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!pendingRange?.from || !pendingRange?.to) return;
                      setPeriod("custom");
                      setCustomRange({ from: pendingRange.from, to: pendingRange.to });
                      setCustomOpen(false);
                    }}
                    disabled={!pendingRange?.from || !pendingRange?.to}
                    className="px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <DataView
        startDate={startDate}
        endDate={endDate}
        prevStartDate={prevStartDate}
        prevEndDate={prevEndDate}
        periodLabel={periodLabel}
      />
    </div>
  );
}
