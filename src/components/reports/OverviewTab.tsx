import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { subDays, subMonths, startOfMonth, endOfMonth, format, differenceInDays } from "date-fns";
import {
  Eye, TrendingUp, TrendingDown, Minus, Users, Activity, Sparkles, RefreshCw,
  Lightbulb, Clock, Search, Wifi, Calendar as CalendarIcon, Target, FileText,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";
import { SummaryCard, InsightCard } from "./InsightCard";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRange } from "react-day-picker";
import { useKeyActions } from "@/hooks/use-key-actions";
import { Button } from "@/components/ui/button";
import { PerformanceReportView } from "./PerformanceReportView";

type Period = "7d" | "14d" | "30d" | "monthly" | "custom";

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null; // No baseline — suppress comparison
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
// Form Performance card — replaces the old "Form Submissions" list
// ────────────────────────────────────────
type FormPerfRow = {
  id: string;
  name: string;
  leads: number;
  prevLeads: number;
  trendPct: number | null;
  sharePct: number;
  cvr: number;
  avgEngagement: number | null;
};

function FormPerformanceCard({
  forms, periodLabel, currentLeads, currentCvr, cvrLabel = "Site CVR", hasPreviousData,
}: {
  forms: FormPerfRow[];
  periodLabel: string;
  currentLeads: number;
  currentCvr: number;
  cvrLabel?: string;
  hasPreviousData: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? forms : forms.slice(0, 8);
  const activeForms = forms.length;
  const topForm = forms[0];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Form Performance ({periodLabel})
        </h3>
      </div>

      {/* Header summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-md bg-muted/40">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Submissions</p>
          <p className="text-lg font-bold text-foreground">{currentLeads.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-md bg-muted/40">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Active forms</p>
          <p className="text-lg font-bold text-foreground">{activeForms}</p>
        </div>
        <div className="p-3 rounded-md bg-muted/40">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Top form</p>
          <p className="text-sm font-semibold text-foreground truncate" title={topForm?.name || "—"}>{topForm?.name || "—"}</p>
        </div>
        <div className="p-3 rounded-md bg-muted/40">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{cvrLabel}</p>
          <p className="text-lg font-bold text-foreground">{currentCvr}%</p>
        </div>
      </div>

      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No form submissions in {periodLabel}.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Form</th>
                  <th className="py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Leads</th>
                  <th className="py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Share</th>
                  <th className="py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">CVR</th>
                  {hasPreviousData && (
                    <th className="py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Trend</th>
                  )}
                  <th className="py-2 pl-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Avg engagement</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((f) => (
                  <tr key={f.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-foreground truncate max-w-[220px]" title={f.name}>{f.name}</td>
                    <td className="py-2.5 px-3 text-right text-foreground">{f.leads}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 w-24 rounded bg-muted/50 overflow-hidden">
                          <div className="absolute inset-y-0 left-0 bg-primary/60 rounded" style={{ width: `${f.sharePct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-9 text-right">{f.sharePct}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">{f.cvr}%</td>
                    {hasPreviousData && (
                      <td className="py-2.5 px-3 text-right">
                        <TrendBadge change={f.trendPct} />
                      </td>
                    )}
                    <td className="py-2.5 pl-3 text-right">
                      {f.avgEngagement === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${f.avgEngagement >= 70 ? "text-success" : f.avgEngagement >= 40 ? "text-foreground" : "text-warning"}`}>
                          {f.avgEngagement}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {forms.length > 8 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 text-xs text-primary hover:text-primary/80 font-medium"
            >
              {expanded ? "Show top 8" : `Show all ${forms.length} forms`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Unified data view — uses raw counts like dashboard
// ────────────────────────────────────────
function DataView({ startDate, endDate, prevStartDate, prevEndDate, periodLabel }: {
  startDate: string; endDate: string; prevStartDate: string; prevEndDate: string; periodLabel: string;
}) {
  const { orgId, orgCreatedAt } = useOrg();
  const { t } = useTranslation();
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);

  const { data: liveData, isLoading } = useQuery({
    queryKey: ["reports_overview_live", orgId, startDate, endDate, prevStartDate, prevEndDate],
    queryFn: async () => {
      if (!orgId) return null;

      const sum = (rows: any[] | null) => (rows || []).reduce((s, r) => s + Number(r.value || 0), 0);

      // Helper: build set of dates that have aggregated data
      const aggDates = (rows: any[] | null): Set<string> => {
        const s = new Set<string>();
        (rows || []).forEach((r: any) => { if (r.date) s.add(r.date); });
        return s;
      };

      // Helper: enumerate all dates in a range (inclusive)
      const allDatesInRange = (start: string, end: string): string[] => {
        const dates: string[] = [];
        const d = new Date(start + "T00:00:00Z");
        const e = new Date(end + "T00:00:00Z");
        while (d <= e) {
          dates.push(d.toISOString().slice(0, 10));
          d.setUTCDate(d.getUTCDate() + 1);
        }
        return dates;
      };

      const [sessAgg, prevSessAgg, leadsAgg, prevLeadsAgg, brokenRes, incidentsRes, formsRes, formLeadsRes, prevFormLeadsRes, leadsRawRes] = await Promise.all([
        supabase.from("traffic_daily" as any).select("date, value").eq("org_id", orgId).eq("metric", "sessions_total").is("dimension", null).gte("date", startDate).lte("date", endDate),
        supabase.from("traffic_daily" as any).select("date, value").eq("org_id", orgId).eq("metric", "sessions_total").is("dimension", null).gte("date", prevStartDate).lte("date", prevEndDate),
        supabase.from("kpi_daily").select("date, value").eq("org_id", orgId).eq("metric", "leads_total").is("dimension", null).gte("date", startDate).lte("date", endDate),
        supabase.from("kpi_daily").select("date, value").eq("org_id", orgId).eq("metric", "leads_total").is("dimension", null).gte("date", prevStartDate).lte("date", prevEndDate),
        supabase.from("broken_links").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("resolved_at", null),
        supabase.from("forms").select("id, name, external_form_id").eq("org_id", orgId).eq("archived", false),
        supabase.from("kpi_daily").select("dimension, value").eq("org_id", orgId).eq("metric", "leads_by_form").gte("date", startDate).lte("date", endDate),
        supabase.from("kpi_daily").select("dimension, value").eq("org_id", orgId).eq("metric", "leads_by_form").gte("date", prevStartDate).lte("date", prevEndDate),
        supabase.from("leads").select("form_id, engagement_score").eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", `${startDate}T00:00:00Z`).lte("submitted_at", `${endDate}T23:59:59.999Z`).limit(1000),
      ]);

      // Gap-fill: find missing days and count from raw tables
      const gapFill = async (
        aggRows: any[] | null,
        rangeStart: string,
        rangeEnd: string,
        table: "sessions" | "leads",
        dateCol: string
      ): Promise<number> => {
        const aggTotal = sum(aggRows);
        const haveDates = aggDates(aggRows);
        const allDates = allDatesInRange(rangeStart, rangeEnd);
        const missingDates = allDates.filter((d) => !haveDates.has(d));
        if (missingDates.length === 0) return aggTotal;

        // Query raw counts for each missing day in parallel (batch)
        let rawTotal = 0;
        // Group into a single query: count rows where date falls in missing days
        const missingStart = missingDates[0] + "T00:00:00Z";
        const missingEnd = missingDates[missingDates.length - 1] + "T23:59:59.999Z";
        const { count } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte(dateCol, missingStart)
          .lte(dateCol, missingEnd);
        rawTotal = count || 0;
        return aggTotal + rawTotal;
      };

      const [currentSessions, previousSessions, currentLeads, previousLeads] = await Promise.all([
        gapFill(sessAgg.data, startDate, endDate, "sessions", "started_at"),
        gapFill(prevSessAgg.data, prevStartDate, prevEndDate, "sessions", "started_at"),
        gapFill(leadsAgg.data, startDate, endDate, "leads", "submitted_at"),
        gapFill(prevLeadsAgg.data, prevStartDate, prevEndDate, "leads", "submitted_at"),
      ]);

      // Suppress comparisons unless the org has been tracking for at least
      // 2× the selected range. A "previous period" with only a handful of
      // sessions produces misleading "+1350% vs last period" deltas.
      const orgAgeDaysCheck = orgCreatedAt ? Math.floor((Date.now() - new Date(orgCreatedAt).getTime()) / (1000 * 60 * 60 * 24)) : Infinity;
      const rangeDaysCheck = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
      const hasFullPriorPeriod = orgAgeDaysCheck >= rangeDaysCheck * 2;
      const hasPreviousData = hasFullPriorPeriod && ((prevSessAgg.data && prevSessAgg.data.length > 0) || (prevLeadsAgg.data && prevLeadsAgg.data.length > 0) || previousSessions > 0 || previousLeads > 0);

      const currentCvr = currentSessions > 0 ? Math.min(100, Math.round((currentLeads / currentSessions) * 10000) / 100) : 0;
      const previousCvr = previousSessions > 0 ? Math.min(100, Math.round((previousLeads / previousSessions) * 10000) / 100) : 0;

      const effectivePrevSessions = hasPreviousData ? previousSessions : 0;
      const effectivePrevLeads = hasPreviousData ? previousLeads : 0;
      const effectivePrevCvr = hasPreviousData ? previousCvr : 0;

      const brokenLinks = brokenRes.count || 0;
      const activeIncidents = incidentsRes.count || 0;

      // Build form breakdown with prior-period leads + avg engagement score
      const formMap: Record<string, { name: string; leads: number; prevLeads: number; engSum: number; engCount: number }> = {};
      (formsRes.data || []).forEach((f: any) => { formMap[f.id] = { name: f.name, leads: 0, prevLeads: 0, engSum: 0, engCount: 0 }; });
      (formLeadsRes.data || []).forEach((r: any) => {
        if (r.dimension && formMap[r.dimension]) {
          formMap[r.dimension].leads += Number(r.value || 0);
        }
      });
      (prevFormLeadsRes.data || []).forEach((r: any) => {
        if (r.dimension && formMap[r.dimension]) {
          formMap[r.dimension].prevLeads += Number(r.value || 0);
        }
      });
      (leadsRawRes.data || []).forEach((l: any) => {
        if (l.form_id && formMap[l.form_id] && typeof l.engagement_score === "number") {
          formMap[l.form_id].engSum += Number(l.engagement_score);
          formMap[l.form_id].engCount += 1;
        }
      });
      const totalLeadsAcrossForms = Object.values(formMap).reduce((s, f) => s + f.leads, 0);
      const formBreakdown = Object.entries(formMap)
        .map(([id, f]) => ({
          id,
          name: f.name,
          leads: f.leads,
          prevLeads: f.prevLeads,
          trendPct: f.prevLeads > 0 ? Math.round(((f.leads - f.prevLeads) / f.prevLeads) * 100) : null,
          sharePct: totalLeadsAcrossForms > 0 ? Math.round((f.leads / totalLeadsAcrossForms) * 100) : 0,
          cvr: currentSessions > 0 ? Math.round((f.leads / currentSessions) * 10000) / 100 : 0,
          avgEngagement: f.engCount > 0 ? Math.round(f.engSum / f.engCount) : null,
        }))
        .filter(f => f.leads > 0)
        .sort((a, b) => b.leads - a.leads);

      const orgAgeDays = orgCreatedAt ? Math.floor((Date.now() - new Date(orgCreatedAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined;
      const rangeDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
      const inputs: InsightInputs = { currentSessions, previousSessions: effectivePrevSessions, currentLeads, previousLeads: effectivePrevLeads, currentCvr, previousCvr: effectivePrevCvr, brokenLinksCount: brokenLinks, activeIncidents, orgAgeDays, rangeDays };
      return {
        currentSessions, previousSessions: effectivePrevSessions, currentLeads, previousLeads: effectivePrevLeads, currentCvr, previousCvr: effectivePrevCvr,
        brokenLinks, activeIncidents, formBreakdown, findings: generateFindings(inputs), hasPreviousData,
      };
    },
    enabled: !!orgId,
  });

  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  const fetchAiSummaries = async () => {
    const findings = liveData?.findings;
    if (!findings?.length) return;
    setLoadingAi(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", {
        body: { findings, report_type: "overview" },
      });
      if (error) {
        if (error.message?.includes("429") || error.message?.includes("RATE_LIMITED")) {
          toast.error(t("reports.dailyLimitReached"));
          return;
        }
        throw error;
      }
      if (result?.code === "RATE_LIMITED") {
        toast.error(result.error || t("reports.dailyLimitReached"));
        return;
      }
      const summaries: Record<string, string> = {};
      if (result?.card_summaries) {
        for (const cs of result.card_summaries) summaries[cs.type] = cs.summary;
      }
      if (result?.summary_paragraph) summaries._paragraph = result.summary_paragraph;
      setAiSummaries(summaries);
      setCooldownUntil(Date.now() + 30_000);
    } catch {
      toast.error(t("reports.failedAiSummaries"));
    } finally {
      setLoadingAi(false);
    }
  };

  // Key Actions for the same window — used to redefine the "leads" tile as
  // "Key Actions" and to compute Action-Rate (CVR based on configured Key Actions).
  const { data: keyActions } = useKeyActions(orgId, startDate, endDate, null);
  const { data: prevKeyActions } = useKeyActions(orgId, prevStartDate, prevEndDate, null);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!liveData) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">{t("reports.noDataYet")}</p>
      </div>
    );
  }

  const { currentSessions, previousSessions, currentLeads, previousLeads, currentCvr, previousCvr, brokenLinks, activeIncidents, formBreakdown, findings, hasPreviousData } = liveData;

  // Prefer Key Actions when the org has configured any; otherwise fall back to
  // raw form submissions so the tile is never empty.
  const hasKeyActions = !!keyActions?.hasConfigured && keyActions.totalActionRate > 0;
  const actionsCount = hasKeyActions ? keyActions!.totalActionRate : currentLeads;
  const prevActionsCount = hasKeyActions ? (prevKeyActions?.totalActionRate ?? 0) : previousLeads;
  const actionsLabel = hasKeyActions ? "Key Actions" : t("reports.leads");

  // Action Rate (CVR) — when Key Actions are configured, CVR = key actions / sessions.
  // Otherwise fall back to the legacy leads/sessions CVR already computed.
  const actionRate = hasKeyActions
    ? (currentSessions > 0 ? Math.min(100, Math.round((actionsCount / currentSessions) * 10000) / 100) : 0)
    : currentCvr;
  const prevActionRate = hasKeyActions
    ? (previousSessions > 0 ? Math.min(100, Math.round((prevActionsCount / previousSessions) * 10000) / 100) : 0)
    : previousCvr;

  const sessionsPct = hasPreviousData ? pctChange(currentSessions, previousSessions) : null;
  const actionsPct = hasPreviousData ? pctChange(actionsCount, prevActionsCount) : null;
  const cvrPct = hasPreviousData ? pctChange(actionRate, prevActionRate) : null;

  const currentRange = formatRange(startDate, endDate);
  const previousRange = formatRange(prevStartDate, prevEndDate);

  const negativeFindings = findings.filter((f: any) => !f.positive).slice(0, 5);
  const positiveFindings = findings.filter((f: any) => f.positive).slice(0, 5);

  // Build a compact breakdown footnote for the Key Actions card.
  const breakdownFootnote = hasKeyActions && keyActions!.breakdown.length > 0 ? (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {keyActions!.breakdown.slice(0, 4).map((b) => (
        <span key={b.category} className="inline-flex items-center gap-1">
          <Target className="h-2.5 w-2.5 text-primary/70" />
          <span className="text-foreground/80 font-medium">{b.count}</span>
          <span className="text-muted-foreground">{b.label}</span>
        </span>
      ))}
      {keyActions!.breakdown.length > 4 && (
        <span className="text-muted-foreground/70">+{keyActions!.breakdown.length - 4} more</span>
      )}
    </span>
  ) : null;

  const keyActionsTooltip = hasKeyActions
    ? "Total of every Key Action you've configured (form submissions, phone clicks, button clicks, etc.) that counts toward your Action Rate."
    : "No Key Actions configured yet — showing form submissions as a fallback. Add Key Actions in Settings → Goals to track phone clicks, button clicks, and more.";

  const cvrTooltip = hasKeyActions
    ? "Action Rate = Key Actions ÷ Sessions. Based on the Key Actions you've set as conversions in Settings → Goals."
    : "Conversion Rate = Form Submissions ÷ Sessions. Configure Key Actions in Settings → Goals for richer conversion tracking.";

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs text-muted-foreground">
            {hasPreviousData ? `${currentRange} vs ${previousRange}` : currentRange}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5">
            <Wifi className="h-2.5 w-2.5" /> {t("reports.live")}
          </span>
          <button onClick={fetchAiSummaries} disabled={loadingAi || cooldownRemaining > 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50 ml-auto">
            {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loadingAi ? t("reports.generatingAi") : cooldownRemaining > 0 ? t("reports.waitSeconds", { seconds: cooldownRemaining }) : t("reports.aiSummaries")}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label={`${t("reports.traffic")} (${periodLabel})`} value={currentSessions.toLocaleString()} change={sessionsPct} changeLabel={hasPreviousData ? `vs prior ${periodLabel}` : undefined} summary={aiSummaries.traffic_up || aiSummaries.traffic_down} />
          <SummaryCard
            label={`${actionsLabel} (${periodLabel})`}
            value={actionsCount.toLocaleString()}
            change={actionsPct}
            changeLabel={hasPreviousData ? `vs prior ${periodLabel}` : undefined}
            summary={aiSummaries.lead_growth || aiSummaries.lead_drop}
            tooltip={keyActionsTooltip}
            footnote={breakdownFootnote}
          />
          <SummaryCard
            label={`${hasKeyActions ? "Action Rate" : t("reports.cvr")} (${periodLabel})`}
            value={`${actionRate}%`}
            change={cvrPct}
            changeLabel={hasPreviousData ? `vs prior ${periodLabel}` : undefined}
            summary={aiSummaries.conversion_gain || aiSummaries.conversion_drop}
            tooltip={cvrTooltip}
          />
          <SummaryCard label={t("reports.siteHealth")} value={activeIncidents > 0 ? `${activeIncidents} ${t("reports.issues")}` : t("reports.sitHealthy")} summary={brokenLinks > 5 ? t("reports.brokenLinksDetected", { count: brokenLinks }) : undefined} />
        </div>
      </div>

      {/* Form Performance */}
      <FormPerformanceCard
        forms={formBreakdown}
        periodLabel={periodLabel}
        currentLeads={currentLeads}
        currentCvr={actionRate}
        cvrLabel={hasKeyActions ? "Action Rate" : "Site CVR"}
        hasPreviousData={hasPreviousData}
      />


      {(negativeFindings.length > 0 || positiveFindings.length > 0) && (
        <div className="space-y-6">
          {negativeFindings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-destructive" /> {t("reports.needsAttention")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{negativeFindings.map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}</div>
            </div>
          )}
          {positiveFindings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-success" /> {t("reports.whatsWorking")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{positiveFindings.map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// ────────────────────────────────────────
// Performance Report Preview — same content as the exported PDF, rendered
// inline so the Overview "pulls in essentially what is in the report export".
// ────────────────────────────────────────
function PerformanceReportPreview({
  startDate, endDate, periodLabel,
}: { startDate: string; endDate: string; periodLabel: string }) {
  const { orgId } = useOrg();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [loadedReport, setLoadedReport] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Look for the most recent succeeded report whose params match this period.
  const { data: matchingRun } = useQuery({
    queryKey: ["overview_report_match", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("report_runs")
        .select("id, file_path, params, created_at, status")
        .eq("org_id", orgId)
        .in("status", ["succeeded", "completed"])
        .order("created_at", { ascending: false })
        .limit(20);
      const match = (data || []).find((r: any) => {
        const p = r.params as any;
        return p?.start_date === startDate && p?.end_date === endDate && r.file_path;
      });
      return match || null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // Auto-load the matching report when found.
  useEffect(() => {
    if (!matchingRun?.file_path) { setLoadedReport(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingReport(true);
      try {
        const { data, error } = await supabase.storage.from("reports").createSignedUrl(matchingRun.file_path!, 60);
        if (error) throw error;
        const resp = await fetch(data.signedUrl);
        const json = await resp.json();
        if (!cancelled) setLoadedReport(json);
      } catch {
        if (!cancelled) setLoadedReport(null);
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    })();
    return () => { cancelled = true; };
  }, [matchingRun?.id, matchingRun?.file_path]);

  const generate = useMutation({
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const periodDays = differenceInDays(new Date(endDate), new Date(startDate)) || 30;
      const params = { period_days: periodDays, start_date: startDate, end_date: endDate, compare_mode: "none" };
      const { data: inserted, error } = await supabase.from("report_runs").insert({
        org_id: orgId, template_slug: "monthly_performance", created_by: session.user.id, params, status: "queued",
      }).select("id").single();
      if (error) throw error;
      await supabase.functions.invoke("process-report", { body: { run_id: inserted.id } });
    },
    onSuccess: () => {
      toast.success("Report generated — loading preview…");
      queryClient.invalidateQueries({ queryKey: ["overview_report_match"] });
      queryClient.invalidateQueries({ queryKey: ["report_runs"] });
    },
    onError: (err: any) => {
      if (err.message?.includes("row-level security") || err.code === "42501") {
        toast.error("You don't have permission to generate reports for this client.");
      } else {
        toast.error(err.message || "Failed to generate report");
      }
    },
  });

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Full Performance Report — {periodLabel}</h3>
          {loadedReport && (
            <span className="text-xs text-muted-foreground">
              · generated {format(new Date(matchingRun!.created_at), "MMM d, HH:mm")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? "Generating…" : loadedReport ? "Regenerate" : "Generate report"}
          </Button>
          {loadedReport && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
      {loadingReport ? (
        <div className="p-12 text-center text-sm text-muted-foreground">Loading report…</div>
      ) : !loadedReport ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">No report yet for this period.</p>
          <p className="text-xs text-muted-foreground">Click <span className="font-medium text-foreground">Generate report</span> to build a full performance report (Executive Summary, Site & Form Health, Growth, Conversion, UX, Action Plan) — same content as the PDF export.</p>
        </div>
      ) : expanded ? (
        <div className="p-5">
          <PerformanceReportView report={loadedReport} hideHeader />
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────
// Main export — unified with period toggle + custom range
// ────────────────────────────────────────
export default function OverviewTab() {
  const { t } = useTranslation();
  const now = new Date();
  const [period, setPeriod] = useState<Period>("30d");
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
      const monthStart = startOfMonth(now);
      const monthEnd = now;
      const prevMonthStart = startOfMonth(subMonths(now, 1));
      const prevMonthEnd = endOfMonth(subMonths(now, 1));
      return {
        startDate: format(monthStart, "yyyy-MM-dd"),
        endDate: format(monthEnd, "yyyy-MM-dd"),
        prevStartDate: format(prevMonthStart, "yyyy-MM-dd"),
        prevEndDate: format(prevMonthEnd, "yyyy-MM-dd"),
        periodLabel: format(monthStart, "MMMM"),
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
    { key: "7d", label: t("reports.7days") },
    { key: "14d", label: t("reports.14days") },
    { key: "30d", label: t("reports.30days") },
    { key: "monthly", label: t("reports.monthlyLabel") },
  ];

  return (
    <div className="space-y-6">
      {/* At a Glance header with period toggle + custom range */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" /> {t("reports.atAGlance")}
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
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
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
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 ${
                    period === "custom"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {period === "custom" && customRange
                    ? `${format(customRange.from, "MMM d")}–${format(customRange.to, "MMM d")}`
                    : t("reports.customLabel")}
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
                    {t("dateRange.cancel")}
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
                    {t("dateRange.apply")}
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
