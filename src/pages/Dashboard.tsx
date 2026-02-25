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
import { useAuth } from "@/hooks/use-auth";
import { useClients, useTrafficDaily, useKpiDaily, useAlerts, useForecasts } from "@/hooks/use-dashboard-data";
import {
  getMockKPIs, getMockDailyData, getMockSourceAttribution,
  getMockCampaignAttribution, getMockTopPages, getMockOpportunities,
  getMockAlerts, getMockForecast,
} from "@/lib/mock-data";
import { BarChart3, Zap, LogOut, ChevronDown } from "lucide-react";

const Dashboard = () => {
  const [days, setDays] = useState(30);
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { data: clients } = useClients();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const activeClientId = selectedClientId || clients?.[0]?.id || null;
  const activeClient = clients?.find((c) => c.id === activeClientId);

  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  const { data: trafficData } = useTrafficDaily(activeClientId, startDate, endDate);
  const { data: kpiData } = useKpiDaily(activeClientId, startDate, endDate);
  const { data: alertsData } = useAlerts(activeClientId);
  const { data: forecastsData } = useForecasts(activeClientId);

  // Determine if we have real data
  const hasRealData = (trafficData && trafficData.length > 0) || (kpiData && kpiData.length > 0);

  // Process real data or fall back to mock
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

    // Process traffic_daily + kpi_daily into dashboard format
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
        date,
        dateLabel: format(new Date(date), "MMM d"),
        sessions: vals.sessions,
        leads: vals.leads,
        pageviews: vals.pageviews,
        cvr: vals.sessions > 0 ? vals.leads / vals.sessions : 0,
      }));

    const totalSessions = dailyData.reduce((s, d) => s + d.sessions, 0);
    const totalLeads = dailyData.reduce((s, d) => s + d.leads, 0);
    const totalPageviews = dailyData.reduce((s, d) => s + d.pageviews, 0);

    // Sources
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

    // Pages
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
      .map((p) => {
        const expected = Math.round(p.sessions * sitewideCvr);
        return { ...p, expectedLeads: expected, gap: expected - p.leads };
      })
      .filter((p) => p.gap > 0)
      .sort((a, b) => b.gap - a.gap);

    // Alerts
    const alerts = (alertsData || []).map((a) => ({
      id: a.id,
      severity: a.severity as "warning" | "info" | "error",
      title: a.title,
      detail: typeof a.details === "object" && a.details !== null ? (a.details as any).detail || "" : "",
      date: format(new Date(a.date), "MMM d"),
    }));

    // Forecast
    let forecast = getMockForecast(30);
    forecast.sufficient_data = false;
    forecast.days_until_available = 42;
    if (forecastsData && forecastsData.length > 0) {
      const f = forecastsData[0];
      forecast = {
        metric: f.metric,
        horizon: f.horizon_days,
        projected_total: 0,
        sufficient_data: true,
        days_until_available: 0,
        points: (f.points as any[]).map((p: any) => ({
          date: p.date,
          dateLabel: format(new Date(p.date), "MMM d"),
          yhat: p.yhat,
          yhat_low: p.yhat_low,
          yhat_high: p.yhat_high,
        })),
      };
      forecast.projected_total = forecast.points.reduce((s, p) => s + p.yhat, 0);
    }

    return {
      kpis: {
        sessions: { value: totalSessions, delta: 0, label: "Sessions" },
        leads: { value: totalLeads, delta: 0, label: "Leads" },
        pageviews: { value: totalPageviews, delta: 0, label: "Pageviews" },
        cvr: { value: sitewideCvr, delta: 0, label: "Conversion Rate" },
      },
      dailyData,
      sources,
      campaigns: [] as any[],
      pages,
      opportunities,
      alerts,
      forecast,
      isMock: false,
    };
  }, [hasRealData, trafficData, kpiData, alertsData, forecastsData, days]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 glow-primary">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-tight">ACTV TRKR</h1>
              {activeClient && (
                <p className="text-[11px] text-muted-foreground">{activeClient.name}</p>
              )}
            </div>
            {clients && clients.length > 1 && (
              <select
                value={activeClientId || ""}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="ml-2 text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3">
            {processedData.isMock && (
              <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-medium text-warning bg-warning/10 px-2 py-1 rounded-md">
                Demo Data
              </span>
            )}
            <DateRangeSelector selectedDays={days} onDaysChange={setDays} />
            {!processedData.isMock && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-success/10 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" />
                <span className="text-[11px] font-medium text-success">Tracking Active</span>
              </div>
            )}
            <button
              onClick={signOut}
              className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-4">
        {!clients || clients.length === 0 ? (
          <div className="glass-card p-8 text-center animate-slide-up">
            <Zap className="h-8 w-8 text-primary mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-2">No clients yet</h2>
            <p className="text-sm text-muted-foreground mb-4">Create your first client to start tracking.</p>
            <button
              onClick={() => navigate("/onboarding")}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Set up a client
            </button>
          </div>
        ) : (
          <>
            <AlertsSection alerts={processedData.alerts} />
            <KPIRow kpis={processedData.kpis} />
            <TrendsChart data={processedData.dailyData} />
            <AttributionSection sources={processedData.sources} campaigns={processedData.campaigns} />
            <ContentPerformance pages={processedData.pages} opportunities={processedData.opportunities} />
            <ForecastSection forecast={processedData.forecast} />
          </>
        )}

        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>
            {processedData.isMock
              ? "Showing demo data • Connect your site to see real analytics"
              : "Data refreshed from cached daily metrics"}
          </span>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
