import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area,
} from "recharts";
import { useState, useMemo } from "react";
import { format, startOfWeek, startOfMonth, startOfYear, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";

interface TrendsChartProps {
  data: Array<{ date: string; dateLabel: string; sessions: number; leads: number; cvr: number; }>;
}

type MetricView = "leads_sessions" | "cvr";
type Granularity = "day" | "week" | "month" | "year" | "all";

function bucketKey(dateStr: string, granularity: Granularity): string {
  const d = parseISO(dateStr);
  switch (granularity) {
    case "week": return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    case "month": return format(startOfMonth(d), "yyyy-MM");
    case "year": return format(startOfYear(d), "yyyy");
    case "all": return "all";
    default: return dateStr;
  }
}

function bucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "week": return `Wk ${format(parseISO(key), "MMM d")}`;
    case "month": return format(parseISO(key + "-01"), "MMM yyyy");
    case "year": return key;
    case "all": return "All Time";
    default: return format(parseISO(key), "MMM d");
  }
}

export function TrendsChart({ data }: TrendsChartProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<MetricView>("leads_sessions");
  const [granularity, setGranularity] = useState<Granularity>("day");

  const granularityOptions: { label: string; value: Granularity }[] = [
    { label: t("dashboard.day"), value: "day" },
    { label: t("dashboard.week"), value: "week" },
    { label: t("dashboard.month"), value: "month" },
    { label: t("dashboard.year"), value: "year" },
    { label: t("dashboard.all"), value: "all" },
  ];

  const aggregatedData = useMemo(() => {
    if (granularity === "day") return data;
    const buckets: Record<string, { sessions: number; leads: number }> = {};
    const order: string[] = [];
    for (const d of data) {
      const key = bucketKey(d.date, granularity);
      if (!buckets[key]) { buckets[key] = { sessions: 0, leads: 0 }; order.push(key); }
      buckets[key].sessions += d.sessions;
      buckets[key].leads += d.leads;
    }
    return order.map((key) => ({
      date: key,
      dateLabel: bucketLabel(key, granularity),
      sessions: buckets[key].sessions,
      leads: buckets[key].leads,
      cvr: buckets[key].sessions > 0 ? buckets[key].leads / buckets[key].sessions : 0,
    }));
  }, [data, granularity]);

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {t("dashboard.trends")}
          <IconTooltip label="Daily sessions, leads, and pageviews plotted over time to reveal traffic patterns.">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </IconTooltip>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-muted rounded-md p-0.5 overflow-x-auto">
            {granularityOptions.map((opt) => (
              <button key={opt.value} onClick={() => setGranularity(opt.value)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${granularity === opt.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            <button onClick={() => setView("leads_sessions")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${view === "leads_sessions" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t("dashboard.leadsAndSessions")}
            </button>
            <button onClick={() => setView("cvr")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${view === "cvr" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t("dashboard.conversionRate")}
            </button>
          </div>
        </div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {view === "leads_sessions" ? (
            <ComposedChart data={aggregatedData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="sessions" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} labelStyle={{ color: "hsl(var(--foreground))" }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} iconType="circle" iconSize={8} />
              <Area yAxisId="sessions" type="monotone" dataKey="sessions" fill="hsl(var(--chart-1))" fillOpacity={0.08} stroke="hsl(var(--chart-1))" strokeWidth={2} name={t("dashboard.sessions")} dot={false} />
              <Bar yAxisId="leads" dataKey="leads" fill="hsl(var(--chart-2))" fillOpacity={0.7} name={t("dashboard.leads")} radius={[2, 2, 0, 0]} barSize={8} />
            </ComposedChart>
          ) : (
            <ComposedChart data={aggregatedData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, "CVR"]} />
              <Line type="monotone" dataKey="cvr" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} name={t("dashboard.conversionRate")} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
