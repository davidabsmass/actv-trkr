import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfDay } from "date-fns";
import { KPIRow } from "@/components/dashboard/KPIRow";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { AttributionSection } from "@/components/dashboard/AttributionSection";
import { ContentPerformance } from "@/components/dashboard/ContentPerformance";
import { VisitorMapSection } from "@/components/dashboard/VisitorMapSection";
import { ForecastSection } from "@/components/dashboard/ForecastSection";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { useOrg } from "@/hooks/use-org";
import { useAlerts, useSites, useForms } from "@/hooks/use-dashboard-data";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import {
  getMockKPIs, getMockDailyData, getMockSourceAttribution,
  getMockCampaignAttribution, getMockTopPages, getMockOpportunities,
  getMockAlerts, getMockForecast,
} from "@/lib/mock-data";
import { BarChart3, Zap, AlertTriangle } from "lucide-react";

const Dashboard = () => {
  const [days, setDays] = useState(30);
  const navigate = useNavigate();
  const { orgId, orgName, orgs } = useOrg();

  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  const { data: realtimeData } = useRealtimeDashboard(orgId, startDate, endDate);
  const { data: alertsData } = useAlerts(orgId);
  const { data: sitesData } = useSites(orgId);
  const { data: formsData } = useForms(orgId);

  const hasRealData = realtimeData && (realtimeData.totalPageviews > 0 || realtimeData.totalSessions > 0);

  const processedData = useMemo(() => {
    if (!hasRealData || !realtimeData) {
      return {
        kpis: getMockKPIs(),
        dailyData: getMockDailyData(days),
        sources: getMockSourceAttribution(),
        campaigns: getMockCampaignAttribution(),
        pages: getMockTopPages(),
        opportunities: getMockOpportunities(),
        alerts: getMockAlerts(),
        forecast: getMockForecast(30),
        isMock: true,
      };
    }

    const { totalPageviews, totalSessions, totalLeads, dailyMap, sources, campaigns, pages } = realtimeData;
    const cvr = totalSessions > 0 ? totalLeads / totalSessions : 0;

    const dailyData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        dateLabel: format(new Date(date), "MMM d"),
        sessions: vals.sessions,
        leads: vals.leads,
        pageviews: vals.pageviews,
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

    const forecast = getMockForecast(30);
    forecast.sufficient_data = false;
    forecast.days_until_available = 42;

    return {
      kpis: {
        sessions: { value: totalSessions, delta: 0, label: "Sessions" },
        leads: { value: totalLeads, delta: 0, label: "Leads" },
        pageviews: { value: totalPageviews, delta: 0, label: "Pageviews" },
        cvr: { value: cvr, delta: 0, label: "Conversion Rate" },
      },
      dailyData,
      sources,
      campaigns,
      pages,
      opportunities,
      alerts,
      forecast,
      isMock: false,
    };
  }, [hasRealData, realtimeData, alertsData, formsData, days]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{orgName}</p>
        </div>
        <div className="flex items-center gap-3">
          {processedData.isMock && (
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-medium text-warning bg-warning/10 px-2 py-1 rounded-md">Demo Data</span>
          )}
          <DateRangeSelector selectedDays={days} onDaysChange={setDays} />
          {!processedData.isMock && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-success/10 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" />
              <span className="text-[11px] font-medium text-success">Live</span>
            </div>
          )}
        </div>
      </div>

      {!orgs || orgs.length === 0 ? (
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Make sure the plugin is activated on your WordPress site. Once the first pageview is received, your site will appear here.
                </p>
                <button onClick={() => navigate("/settings")} className="text-xs font-medium text-primary hover:underline mt-1.5">
                  Go to Settings →
                </button>
              </div>
            </div>
          )}
          <AlertsSection alerts={processedData.alerts} />
          <KPIRow kpis={processedData.kpis} />
          <TrendsChart data={processedData.dailyData} />
          <AttributionSection sources={processedData.sources} campaigns={processedData.campaigns} />
          <VisitorMapSection data={realtimeData?.countries || []} />
          <ContentPerformance pages={processedData.pages} opportunities={processedData.opportunities} />
          <ForecastSection forecast={processedData.forecast} />
        </div>
      )}
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>{processedData.isMock ? "Showing demo data • Connect your site to see real analytics" : "Live data • Auto-refreshes every 60s"}</span>
      </div>
    </div>
  );
};

export default Dashboard;
