import { useState } from "react";
import { KPIRow } from "@/components/dashboard/KPIRow";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { AttributionSection } from "@/components/dashboard/AttributionSection";
import { ContentPerformance } from "@/components/dashboard/ContentPerformance";
import { ForecastSection } from "@/components/dashboard/ForecastSection";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import {
  getMockKPIs,
  getMockDailyData,
  getMockSourceAttribution,
  getMockCampaignAttribution,
  getMockTopPages,
  getMockOpportunities,
  getMockAlerts,
  getMockForecast,
} from "@/lib/mock-data";
import { BarChart3, Zap } from "lucide-react";

const Dashboard = () => {
  const [days, setDays] = useState(30);

  const kpis = getMockKPIs();
  const dailyData = getMockDailyData(days);
  const sources = getMockSourceAttribution();
  const campaigns = getMockCampaignAttribution();
  const pages = getMockTopPages();
  const opportunities = getMockOpportunities();
  const alerts = getMockAlerts();
  const forecast = getMockForecast(30);

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
              <h1 className="text-sm font-bold text-foreground tracking-tight">Mission Control</h1>
              <p className="text-[11px] text-muted-foreground">Analytics Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DateRangeSelector selectedDays={days} onDaysChange={setDays} />
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-success/10 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" />
              <span className="text-[11px] font-medium text-success">Tracking Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Alerts */}
        <AlertsSection alerts={alerts} />

        {/* KPI Row */}
        <KPIRow kpis={kpis} />

        {/* Trends */}
        <TrendsChart data={dailyData} />

        {/* Attribution */}
        <AttributionSection sources={sources} campaigns={campaigns} />

        {/* Content Performance */}
        <ContentPerformance pages={pages} opportunities={opportunities} />

        {/* Forecast */}
        <ForecastSection forecast={forecast} />

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Data refreshed from cached daily metrics • Mock data</span>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
