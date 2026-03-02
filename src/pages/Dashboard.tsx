import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfDay, startOfWeek, subWeeks } from "date-fns";
import { KPIRow } from "@/components/dashboard/KPIRow";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { AttributionSection } from "@/components/dashboard/AttributionSection";
import { ContentPerformance } from "@/components/dashboard/ContentPerformance";
import { VisitorMapSection } from "@/components/dashboard/VisitorMapSection";
import { ForecastSection } from "@/components/dashboard/ForecastSection";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { FunnelView } from "@/components/dashboard/FunnelView";
import { FormLeaderboard } from "@/components/dashboard/FormLeaderboard";
import { TrafficSourceROI } from "@/components/dashboard/TrafficSourceROI";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { WeekOverWeekStrip } from "@/components/dashboard/WeekOverWeekStrip";
import { SmartUpdates, generateInsights } from "@/components/dashboard/SmartUpdates";
import { ShareableSnapshot } from "@/components/dashboard/ShareableSnapshot";
import { AiInsights } from "@/components/dashboard/AiInsights";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { useOrg } from "@/hooks/use-org";
import { useAlerts, useSites, useForms } from "@/hooks/use-dashboard-data";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { useSiteSettings, PrimaryFocus } from "@/hooks/use-site-settings";
import { BarChart3, Zap, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Dashboard = () => {
  const [days, setDays] = useState(30);
  const navigate = useNavigate();
  const { orgId, orgName, orgs } = useOrg();
  const { hasFeature } = usePlanTier();
  const { settings, needsOnboarding } = useSiteSettings();

  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  // WoW date ranges
  const thisWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const lastWeekStart = format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), "yyyy-MM-dd");
  const lastWeekEnd = format(subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), "yyyy-MM-dd");

  const { data: realtimeData } = useRealtimeDashboard(orgId, startDate, endDate);
  const { data: thisWeekData } = useRealtimeDashboard(orgId, thisWeekStart, endDate);
  const { data: lastWeekData } = useRealtimeDashboard(orgId, lastWeekStart, lastWeekEnd);
  const { data: alertsData } = useAlerts(orgId);
  const { data: sitesData } = useSites(orgId);
  const { data: formsData } = useForms(orgId);

  const { data: leadsData } = useQuery({
    queryKey: ["leads_for_forms", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("form_id, submitted_at, source")
        .eq("org_id", orgId)
        .gte("submitted_at", `${startDate}T00:00:00Z`)
        .lte("submitted_at", `${endDate}T23:59:59.999Z`);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const isLoading = !realtimeData;

  // WoW comparison data – always use real data (zeros if no data yet)
  const wowData = useMemo(() => {
    const tw = thisWeekData || { totalSessions: 0, totalLeads: 0 };
    const lw = lastWeekData || { totalSessions: 0, totalLeads: 0 };
    const twCvr = tw.totalSessions > 0 ? tw.totalLeads / tw.totalSessions : 0;
    const lwCvr = lw.totalSessions > 0 ? lw.totalLeads / lw.totalSessions : 0;
    const bestPage = thisWeekData?.pages?.sort((a: any, b: any) => b.leads - a.leads)?.[0]?.path;
    return {
      sessions: { current: tw.totalSessions, previous: lw.totalSessions },
      leads: { current: tw.totalLeads, previous: lw.totalLeads },
      cvr: { current: twCvr, previous: lwCvr },
      bestPage,
    };
  }, [thisWeekData, lastWeekData]);

  // Primary focus (new) with fallback to old goal
  const primaryFocus: PrimaryFocus = settings?.primary_focus || "lead_volume";

  // Smart insights with focus-aware weighting
  const smartInsights = useMemo(() => {
    if (!thisWeekData || !lastWeekData) return [];
    const twCvr = thisWeekData.totalSessions > 0 ? thisWeekData.totalLeads / thisWeekData.totalSessions : 0;
    const lwCvr = lastWeekData.totalSessions > 0 ? lastWeekData.totalLeads / lastWeekData.totalSessions : 0;
    return generateInsights(
      {
        sessions: { current: thisWeekData.totalSessions, previous: lastWeekData.totalSessions },
        leads: { current: thisWeekData.totalLeads, previous: lastWeekData.totalLeads },
        cvr: { current: twCvr, previous: lwCvr },
        pages: thisWeekData.pages?.map((p: any) => ({ ...p, page_path: p.path })),
      },
      primaryFocus
    );
  }, [thisWeekData, lastWeekData, primaryFocus]);

  const emptyKpis = {
    sessions: { value: 0, delta: 0, label: "Sessions" },
    leads: { value: 0, delta: 0, label: "Leads" },
    pageviews: { value: 0, delta: 0, label: "Pageviews" },
    cvr: { value: 0, delta: 0, label: "Conversion Rate" },
  };

  const emptyForecast = { sufficient_data: false, days_until_available: 42, metric: "total_leads", horizon: 0, projected_total: 0, points: [] as { date: string; dateLabel: string; yhat: number; yhat_low: number; yhat_high: number }[] };

  const processedData = useMemo(() => {
    if (isLoading || !realtimeData) {
      return {
        kpis: emptyKpis, dailyData: [], sources: [], campaigns: [], pages: [], opportunities: [],
        alerts: [], forecast: emptyForecast, isMock: false, isLoading: true,
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

    const alerts = (alertsData || []).map((a) => ({
      id: a.id, severity: a.severity as "warning" | "info" | "error",
      title: a.title,
      detail: typeof a.details === "object" && a.details !== null ? (a.details as any).detail || "" : "",
      date: format(new Date(a.date), "MMM d"),
    }));

    return {
      kpis: {
        sessions: { value: totalSessions, delta: 0, label: "Sessions" },
        leads: { value: totalLeads, delta: 0, label: "Leads" },
        pageviews: { value: totalPageviews, delta: 0, label: "Pageviews" },
        cvr: { value: cvr, delta: 0, label: "Conversion Rate" },
      },
      dailyData, sources, campaigns, pages, opportunities, alerts, forecast: emptyForecast, isMock: false,
    };
  }, [isLoading, realtimeData, alertsData, days]);

  // Focus-aware section ordering
  const renderFocusSections = () => {
    const sections = {
      attribution: hasFeature("attribution") && (
        <div id="section-sources" key="roi"><TrafficSourceROI sources={processedData.sources} /></div>
      ),
      attributionDetail: (
        <div id="section-attribution" key="attr"><AttributionSection sources={processedData.sources} campaigns={processedData.campaigns} /></div>
      ),
      funnel: hasFeature("funnel_view") && (
        <div id="section-funnel" key="funnel"><FunnelView totalPageviews={realtimeData?.totalPageviews || 0} formPageViews={0} totalLeads={realtimeData?.totalLeads || 0} /></div>
      ),
      formLeaderboard: formsData && formsData.length > 0 && (
        <div id="section-forms" key="forms"><FormLeaderboard forms={formsData} leads={leadsData || []} sessions={realtimeData?.totalSessions || 0} /></div>
      ),
      map: hasFeature("multi_location_map") && (
        <div id="section-map" key="map"><VisitorMapSection data={realtimeData?.countries || []} /></div>
      ),
      content: (
        <div id="section-pages" key="content"><ContentPerformance pages={processedData.pages} opportunities={processedData.opportunities} /></div>
      ),
      forecast: <div id="section-forecast" key="forecast"><ForecastSection forecast={processedData.forecast} /></div>,
    };

    const focusOrder: Record<PrimaryFocus, (keyof typeof sections)[]> = {
      lead_volume: ["content", "formLeaderboard", "attributionDetail", "attribution", "funnel", "map", "forecast"],
      marketing_impact: ["attribution", "attributionDetail", "formLeaderboard", "content", "funnel", "map", "forecast"],
      conversion_performance: ["funnel", "content", "formLeaderboard", "attribution", "attributionDetail", "map", "forecast"],
      paid_optimization: ["attribution", "attributionDetail", "funnel", "formLeaderboard", "content", "map", "forecast"],
    };

    const order = focusOrder[primaryFocus] || focusOrder.lead_volume;
    return order.map((key) => sections[key]).filter(Boolean);
  };

  // Snapshot data for sharing
  const snapshotData = useMemo(() => ({
    kpis: processedData.kpis, wowData, orgName,
    focus: primaryFocus, generatedAt: new Date().toISOString(),
  }), [processedData.kpis, wowData, orgName, primaryFocus]);

  return (
    <div>
      {needsOnboarding && orgs && orgs.length > 0 && <OnboardingModal />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ACTV TRKR</h1>
          <p className="text-sm text-muted-foreground">{orgName}</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector selectedDays={days} onDaysChange={setDays} />
          <ShareableSnapshot snapshotData={snapshotData} startDate={startDate} endDate={endDate} />
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-success/10 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" />
            <span className="text-[11px] font-medium text-success">Live</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-4" />
              <div className="h-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : !orgs || orgs.length === 0 ? (
        <div className="glass-card p-8 text-center animate-slide-up">
          <Zap className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No organization yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Create your first org to start tracking.</p>
          <button onClick={() => navigate("/onboarding")} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            Set up an organization
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sitesData && sitesData.length === 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-warning/30 bg-warning/5 animate-slide-up">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">No site connected yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Make sure the plugin is activated on your WordPress site.</p>
                <button onClick={() => navigate("/settings")} className="text-xs font-medium text-primary hover:underline mt-1.5">
                  Go to Settings →
                </button>
              </div>
            </div>
          )}

          <WeekOverWeekStrip data={wowData} />
          <WeeklySummary primaryFocus={primaryFocus} />
          <AiInsights metrics={{
            sessionsThisWeek: wowData.sessions.current,
            sessionsLastWeek: wowData.sessions.previous,
            leadsThisWeek: wowData.leads.current,
            leadsLastWeek: wowData.leads.previous,
            cvrThisWeek: wowData.cvr.current,
            cvrLastWeek: wowData.cvr.previous,
            topPage: wowData.bestPage || "",
            topSource: processedData.sources?.[0]?.source || "",
            totalForms: formsData?.filter((f) => !f.archived).length || 0,
            primaryFocus,
          }} />
          <AlertsSection alerts={processedData.alerts} />
          <KPIRow kpis={processedData.kpis} totalSessions={realtimeData?.totalSessions} totalLeads={realtimeData?.totalLeads} />
          <TrendsChart data={processedData.dailyData} />
          {smartInsights.length > 0 && (
            <SmartUpdates insights={smartInsights} onAction={(path) => {
              if (path.startsWith("#")) {
                document.getElementById(path.slice(1))?.scrollIntoView({ behavior: "smooth" });
              } else {
                navigate(path);
              }
            }} />
          )}
          {renderFocusSections()}
        </div>
      )}
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>Live data • Auto-refreshes every 15s</span>
      </div>
    </div>
  );
};

export default Dashboard;
