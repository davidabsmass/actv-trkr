import { useState, useMemo } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { AttributionSection } from "@/components/dashboard/AttributionSection";
import { ContentPerformance } from "@/components/dashboard/ContentPerformance";
import { VisitorMapSection } from "@/components/dashboard/VisitorMapSection";
import { FunnelView } from "@/components/dashboard/FunnelView";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { VisitorEngagement } from "@/components/dashboard/VisitorEngagement";
import { ClickActivity } from "@/components/dashboard/ClickActivity";
import { KPIRow } from "@/components/dashboard/KPIRow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrg } from "@/hooks/use-org";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { useSiteSettings, PrimaryFocus } from "@/hooks/use-site-settings";
import Reports from "./Reports";

const Performance = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "analytics";
  const [days, setDays] = useState<number | null>(30);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const { orgId, orgName } = useOrg();
  const { hasFeature } = usePlanTier();
  const { settings } = useSiteSettings();
  const primaryFocus: PrimaryFocus = settings?.primary_focus || "lead_volume";

  const endDate = customRange
    ? format(startOfDay(customRange.to), "yyyy-MM-dd")
    : format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = customRange
    ? format(startOfDay(customRange.from), "yyyy-MM-dd")
    : format(subDays(startOfDay(new Date()), days ?? 30), "yyyy-MM-dd");

  const { data: realtimeData } = useRealtimeDashboard(orgId, startDate, endDate);

  const isLoading = !realtimeData;

  const processedData = useMemo(() => {
    if (isLoading || !realtimeData) {
      return {
        kpis: {
          sessions: { value: 0, delta: 0, label: "Sessions" },
          leads: { value: 0, delta: 0, label: "Leads" },
          pageviews: { value: 0, delta: 0, label: "Pageviews" },
          cvr: { value: 0, delta: 0, label: "Conversion Rate" },
        },
        dailyData: [], sources: [], campaigns: [], pages: [], opportunities: [],
      };
    }

    const { totalPageviews, totalSessions, totalLeads, dailyMap, sources, campaigns, pages } = realtimeData;
    const cvr = totalSessions > 0 ? totalLeads / totalSessions : 0;

    const dailyData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date, dateLabel: format(new Date(date), "MMM d"),
        sessions: vals.sessions, leads: vals.leads, pageviews: vals.pageviews,
        cvr: vals.sessions > 0 ? vals.leads / vals.sessions : 0,
      }));

    const sitewideCvr = totalSessions > 0 ? totalLeads / totalSessions : 0;
    const opportunities = pages
      .filter((p) => p.sessions >= 100)
      .map((p) => ({ ...p, expectedLeads: Math.round(p.sessions * sitewideCvr), gap: Math.round(p.sessions * sitewideCvr) - p.leads }))
      .filter((p) => p.gap > 0).sort((a, b) => b.gap - a.gap);

    return {
      kpis: {
        sessions: { value: totalSessions, delta: 0, label: "Sessions" },
        leads: { value: totalLeads, delta: 0, label: "Leads" },
        pageviews: { value: totalPageviews, delta: 0, label: "Pageviews" },
        cvr: { value: cvr, delta: 0, label: "Conversion Rate" },
      },
      dailyData, sources, campaigns, pages, opportunities,
    };
  }, [isLoading, realtimeData]);

  // Focus-aware section ordering
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
        <div id="section-pages" key="content"><ContentPerformance pages={processedData.pages} opportunities={processedData.opportunities} /></div>
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance</h1>
          <p className="text-sm text-muted-foreground">{orgName} · Deeper analytics</p>
        </div>
        <DateRangeSelector
          selectedDays={days}
          onDaysChange={(d) => { setDays(d); setCustomRange(null); }}
          customRange={customRange}
          onCustomRangeChange={(r) => { setCustomRange(r); setDays(null); }}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })} className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
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
              <KPIRow kpis={processedData.kpis} totalSessions={realtimeData?.totalSessions} totalLeads={realtimeData?.totalLeads} />
              <TrendsChart data={processedData.dailyData} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <VisitorEngagement orgId={orgId} startDate={startDate} endDate={endDate} />
                <ClickActivity orgId={orgId} startDate={startDate} endDate={endDate} />
              </div>
              {renderSections()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          <Reports />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Performance;
