import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfDay } from "date-fns";
import { KPIRow } from "@/components/dashboard/KPIRow";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { AttributionSection } from "@/components/dashboard/AttributionSection";
import { ContentPerformance } from "@/components/dashboard/ContentPerformance";
import { ForecastSection } from "@/components/dashboard/ForecastSection";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { useOrg } from "@/hooks/use-org";
import { useTrafficDaily, useKpiDaily, useAlerts } from "@/hooks/use-dashboard-data";
import {
  getMockKPIs, getMockDailyData, getMockSourceAttribution,
  getMockCampaignAttribution, getMockTopPages, getMockOpportunities,
  getMockAlerts, getMockForecast,
} from "@/lib/mock-data";
import { BarChart3, Zap } from "lucide-react";

const Dashboard = () => {
  const [days, setDays] = useState(30);
  const navigate = useNavigate();
  const { orgId, orgName, orgs } = useOrg();

  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  const { data: trafficData } = useTrafficDaily(orgId, startDate, endDate);
  const { data: kpiData } = useKpiDaily(orgId, startDate, endDate);
  const { data: alertsData } = useAlerts(orgId);

  const hasRealData = (trafficData && trafficData.length > 0) || (kpiData && kpiData.length > 0);

  const processedData = useMemo(() => {
    if (!hasRealData) {
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

    const dateMap: Record<string, { sessions: number; leads: number; pageviews: number }> = {};
    trafficData?.forEach((row) => {
      if (!dateMap[row.date]) dateMap[row.date] = { sessions: 0, leads: 0, pageviews: 0 };
      if (row.metric === "sessions_total" && !row.dimension) dateMap[row.date].sessions += Number(row.value);
      if (row.metric === "pageviews_total" && !row.dimension) dateMap[row.date].pageviews += Number(row.value);
    });
    kpiData?.forEach((row) => {
      if (!dateMap[row.date]) dateMap[row.date] = { sessions: 0, leads: 0, pageviews: 0 };
      if (row.metric === "leads_total" && !row.dimension) dateMap[row.date].leads += Number(row.value);
    });

    const dailyData = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date, dateLabel: format(new Date(date), "MMM d"),
        sessions: vals.sessions, leads: vals.leads, pageviews: vals.pageviews,
        cvr: vals.sessions > 0 ? vals.leads / vals.sessions : 0,
      }));

    const totalSessions = dailyData.reduce((s, d) => s + d.sessions, 0);
    const totalLeads = dailyData.reduce((s, d) => s + d.leads, 0);
    const totalPageviews = dailyData.reduce((s, d) => s + d.pageviews, 0);

    const sourceMap: Record<string, { sessions: number; leads: number }> = {};
    trafficData?.filter((r) => r.metric === "sessions_by_source" && r.dimension).forEach((r) => {
      if (!sourceMap[r.dimension!]) sourceMap[r.dimension!] = { sessions: 0, leads: 0 };
      sourceMap[r.dimension!].sessions += Number(r.value);
    });
    kpiData?.filter((r) => r.metric === "leads_by_source" && r.dimension).forEach((r) => {
      if (!sourceMap[r.dimension!]) sourceMap[r.dimension!] = { sessions: 0, leads: 0 };
      sourceMap[r.dimension!].leads += Number(r.value);
    });
    const sources = Object.entries(sourceMap)
      .map(([source, v]) => ({ source, ...v, cvr: v.sessions > 0 ? v.leads / v.sessions : 0 }))
      .sort((a, b) => b.sessions - a.sessions);

    const pageMap: Record<string, { sessions: number; leads: number }> = {};
    trafficData?.filter((r) => r.metric === "sessions_by_page" && r.dimension).forEach((r) => {
      if (!pageMap[r.dimension!]) pageMap[r.dimension!] = { sessions: 0, leads: 0 };
      pageMap[r.dimension!].sessions += Number(r.value);
    });
    kpiData?.filter((r) => r.metric === "leads_by_page" && r.dimension).forEach((r) => {
      if (!pageMap[r.dimension!]) pageMap[r.dimension!] = { sessions: 0, leads: 0 };
      pageMap[r.dimension!].leads += Number(r.value);
    });
    const pages = Object.entries(pageMap)
      .map(([path, v]) => ({ path, ...v, cvr: v.sessions > 0 ? v.leads / v.sessions : 0 }))
      .sort((a, b) => b.sessions - a.sessions);

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
        cvr: { value: sitewideCvr, delta: 0, label: "Conversion Rate" },
      },
      dailyData, sources, campaigns: [] as any[], pages, opportunities, alerts, forecast, isMock: false,
    };
  }, [hasRealData, trafficData, kpiData, alertsData, days]);

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
              <span className="text-[11px] font-medium text-success">Tracking Active</span>
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
          <AlertsSection alerts={processedData.alerts} />
          <KPIRow kpis={processedData.kpis} />
          <TrendsChart data={processedData.dailyData} />
          <AttributionSection sources={processedData.sources} campaigns={processedData.campaigns} />
          <ContentPerformance pages={processedData.pages} opportunities={processedData.opportunities} />
          <ForecastSection forecast={processedData.forecast} />
        </div>
      )}
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>{processedData.isMock ? "Showing demo data • Connect your site to see real analytics" : "Data refreshed from cached daily metrics"}</span>
      </div>
    </div>
  );
};

export default Dashboard;
