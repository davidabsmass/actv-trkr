import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
} from "recharts";
import { useState } from "react";

interface TrendsChartProps {
  data: Array<{
    date: string;
    dateLabel: string;
    sessions: number;
    leads: number;
    cvr: number;
  }>;
}

type MetricView = "leads_sessions" | "cvr";

export function TrendsChart({ data }: TrendsChartProps) {
  const [view, setView] = useState<MetricView>("leads_sessions");

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Trends</h3>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button
            onClick={() => setView("leads_sessions")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              view === "leads_sessions"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Leads & Sessions
          </button>
          <button
            onClick={() => setView("cvr")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              view === "cvr"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Conversion Rate
          </button>
        </div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {view === "leads_sessions" ? (
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="sessions"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="leads"
                orientation="right"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
                iconType="circle"
                iconSize={8}
              />
              <Area
                yAxisId="sessions"
                type="monotone"
                dataKey="sessions"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.08}
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                name="Sessions"
                dot={false}
              />
              <Bar
                yAxisId="leads"
                dataKey="leads"
                fill="hsl(var(--chart-2))"
                fillOpacity={0.7}
                name="Leads"
                radius={[2, 2, 0, 0]}
                barSize={8}
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, "CVR"]}
              />
              <Line
                type="monotone"
                dataKey="cvr"
                stroke="hsl(var(--chart-4))"
                strokeWidth={2}
                dot={false}
                name="Conversion Rate"
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
