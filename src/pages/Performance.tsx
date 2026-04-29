import { useState, useMemo, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { format, subDays, startOfDay } from "date-fns";
import { useDashboardOverview } from "@/hooks/use-dashboard-overview";
import { useSearchParams } from "react-router-dom";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { AttributionSection } from "@/components/dashboard/AttributionSection";
import { ContentPerformance } from "@/components/dashboard/ContentPerformance";
import { VisitorMapSection } from "@/components/dashboard/VisitorMapSection";
import { FunnelView } from "@/components/dashboard/FunnelView";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { VisitorEngagement } from "@/components/dashboard/VisitorEngagement";
import { ClickActivity } from "@/components/dashboard/ClickActivity";
import { GoalConversions } from "@/components/dashboard/GoalConversions";
import { TopExitPages } from "@/components/dashboard/TopExitPages";
import { VisitorJourneysList } from "@/components/journeys/VisitorJourneysList";
import { ConversionBreakdown } from "@/components/dashboard/ConversionBreakdown";
import { KPIRow } from "@/components/dashboard/KPIRow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrg } from "@/hooks/use-org";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { useSiteSettings, PrimaryFocus } from "@/hooks/use-site-settings";
import { HowToButton } from "@/components/HowToButton";
import { HOWTO_PERFORMANCE } from "@/components/howto/page-content";
import { AddSiteHeaderButton } from "@/components/sites/AddSiteHeaderButton";
import { CreateGoalDialog } from "@/components/settings/GoalsSection";
import { useForms } from "@/hooks/use-dashboard-data";
import { useKeyActions } from "@/hooks/use-key-actions";

const Reports = lazy(() => import("./Reports"));

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return null;
  return (curr - prev) / prev;
}

const Performance = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "analytics";
  const [days, setDays] = useState<number | null>(30);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const { orgId, orgName, orgCreatedAt } = useOrg();
  const { data: forms = [] } = useForms(orgId);
  const { hasFeature } = usePlanTier();
  const { settings } = useSiteSettings();
  const primaryFocus: PrimaryFocus = settings?.primary_focus || "lead_volume";

  const rangeDays = days ?? 30;

  const endDate = customRange
    ? format(startOfDay(customRange.to), "yyyy-MM-dd")
    : format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = customRange
    ? format(startOfDay(customRange.from), "yyyy-MM-dd")
    : format(subDays(startOfDay(new Date()), rangeDays), "yyyy-MM-dd");

  // Previous period for comparison
  const prevEndDate = customRange
    ? format(startOfDay(customRange.from), "yyyy-MM-dd")
    : format(subDays(startOfDay(new Date()), rangeDays), "yyyy-MM-dd");
  const prevStartDate = customRange
    ? format(subDays(startOfDay(customRange.from), Math.ceil((customRange.to.getTime() - customRange.from.getTime()) / (1000 * 60 * 60 * 24))), "yyyy-MM-dd")
    : format(subDays(startOfDay(new Date()), rangeDays * 2), "yyyy-MM-dd");

  const { data: realtimeData } = useRealtimeDashboard(orgId, startDate, endDate, orgCreatedAt);
  const { data: overviewData } = useDashboardOverview(orgId, startDate, endDate, orgCreatedAt);
  const { data: prevOverviewData } = useDashboardOverview(orgId, prevStartDate, prevEndDate, orgCreatedAt);

  const isLoading = !realtimeData;

  const processedData = useMemo(() => {
    if (isLoading || !realtimeData) {
      return {
        kpis: {
          sessions: { value: 0, delta: 0, label: t("dashboard.sessions") },
          leads: { value: 0, delta: 0, label: t("dashboard.leads") },
          pageviews: { value: 0, delta: 0, label: t("dashboard.pageviews") },
          cvr: { value: 0, delta: 0, label: t("dashboard.conversionRate") },
        },
        dailyData: [], sources: [], campaigns: [], pages: [], opportunities: [],
      };
    }

    const totalSessions = overviewData?.totalSessions ?? realtimeData.totalSessions;
    const totalLeads = overviewData?.totalLeads ?? realtimeData.totalLeads;
    const totalPageviews = overviewData?.totalPageviews ?? realtimeData.totalPageviews;
    const { dailyMap, sources, campaigns, pages } = realtimeData;
    const cvr = totalSessions > 0 ? Math.min(1, totalLeads / totalSessions) : 0;

    // Previous period values
    const prevSessions = prevOverviewData?.totalSessions ?? 0;
    const prevLeads = prevOverviewData?.totalLeads ?? 0;
    const prevPageviews = prevOverviewData?.totalPageviews ?? 0;
    const prevCvr = prevSessions > 0 ? Math.min(1, prevLeads / prevSessions) : 0;

    const dailyData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date, dateLabel: format(new Date(date), "MMM d"),
        sessions: vals.sessions, leads: vals.leads, pageviews: vals.pageviews,
        cvr: vals.sessions > 0 ? vals.leads / vals.sessions : 0,
      }));

    const sitewideCvr = totalSessions > 0 ? totalLeads / totalSessions : 0;
    const sortedByTraffic = [...pages].sort((a, b) => b.sessions - a.sessions);
    const topQuartileIdx = Math.max(0, Math.floor(sortedByTraffic.length * 0.25));
    const sessionThreshold = sortedByTraffic.length > 0
      ? Math.max(5, Math.floor(sortedByTraffic[topQuartileIdx]?.sessions * 0.5 || 5))
      : 5;
    const opportunities = pages
      .filter((p) => p.sessions >= sessionThreshold && p.cvr < sitewideCvr)
      .map((p) => ({ ...p, expectedLeads: Math.round(p.sessions * sitewideCvr), gap: Math.round(p.sessions * sitewideCvr) - p.leads }))
      .filter((p) => p.gap > 0).sort((a, b) => b.gap - a.gap);

    return {
      kpis: {
        sessions: { value: totalSessions, delta: pctDelta(totalSessions, prevSessions), label: t("dashboard.sessions") },
        leads: { value: totalLeads, delta: pctDelta(totalLeads, prevLeads), label: t("dashboard.leads") },
        pageviews: { value: totalPageviews, delta: pctDelta(totalPageviews, prevPageviews), label: t("dashboard.pageviews") },
        cvr: { value: cvr, delta: pctDelta(cvr, prevCvr), label: t("dashboard.conversionRate") },
      },
      dailyData, sources, campaigns, pages, opportunities,
    };
  }, [isLoading, realtimeData, overviewData, prevOverviewData, t]);

  const renderSections = () => {
    const sections = {
      attributionDetail: (
        <div id="section-attribution" key="attr"><AttributionSection sources={processedData.sources} campaigns={processedData.campaigns} /></div>
      ),
      funnel: hasFeature("funnel_view") && (
        <div id="section-funnel" key="funnel"><FunnelView totalPageviews={realtimeData?.totalPageviews || 0} formPageViews={0} totalLeads={realtimeData?.totalLeads || 0} /></div>
      ),
      map: hasFeature("multi_location_map") && (
        <div id="section-map" key="map"><VisitorMapSection data={realtimeData?.countries || []} /></div>
      ),
      content: (
        <div id="section-pages" key="content"><ContentPerformance pages={processedData.pages} /></div>
      ),
    };

    const focusOrder: Record<PrimaryFocus, (keyof typeof sections)[]> = {
      lead_volume: ["content", "attributionDetail", "funnel", "map"],
      marketing_impact: ["attributionDetail", "content", "funnel", "map"],
      conversion_performance: ["funnel", "content", "attributionDetail", "map"],
      paid_optimization: ["attributionDetail", "funnel", "content", "map"],
    };

    const order = focusOrder[primaryFocus] || focusOrder.lead_volume;
    return order.map((key) => sections[key]).filter(Boolean);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold text-foreground">{t("performance.title")}</h1>
            <HowToButton {...HOWTO_PERFORMANCE} />
          </div>
          <p className="text-sm text-muted-foreground">{orgName} · {t("performance.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector
            selectedDays={days}
            onDaysChange={(d) => { setDays(d); setCustomRange(null); }}
            customRange={customRange}
            onCustomRangeChange={(r) => { setCustomRange(r); setDays(null); }}
          />
          {orgId && (
            <CreateGoalDialog
              orgId={orgId}
              forms={forms}
              triggerLabel="Add Goal"
              triggerVariant="outline"
              triggerClassName="h-8 gap-1 text-xs"
            />
          )}
          <AddSiteHeaderButton />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })} className="space-y-4">
        <TabsList className="mb-4">
          <TabsTrigger value="analytics" className="flex-shrink-0 text-xs sm:text-sm">{t("performance.analytics")}</TabsTrigger>
          <TabsTrigger value="reports" className="flex-shrink-0 text-xs sm:text-sm">{t("performance.reports")}</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass-card p-6 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/4 mb-4" />
                  <div className="h-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <KPIRow kpis={processedData.kpis} totalSessions={realtimeData?.totalSessions} totalLeads={realtimeData?.totalLeads} dailyMap={realtimeData?.dailyMap} />
              <TrendsChart data={processedData.dailyData} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <VisitorEngagement orgId={orgId} startDate={startDate} endDate={endDate} />
                <ClickActivity orgId={orgId} startDate={startDate} endDate={endDate} />
              </div>
              <ConversionBreakdown orgId={orgId} startDate={startDate} endDate={endDate} />
              <TopExitPages orgId={orgId} startDate={startDate} endDate={endDate} />
              <VisitorJourneysList orgId={orgId} startDate={startDate} endDate={endDate} compact />
              <GoalConversions orgId={orgId} startDate={startDate} endDate={endDate} />
              {renderSections()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <Reports />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Performance;
