import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { format, parseISO } from "date-fns";

interface TrendsMiniChartProps {
  dailyMap: Record<string, { sessions: number; leads: number; pageviews: number }>;
}

export function TrendsMiniChart({ dailyMap }: TrendsMiniChartProps) {
  const chartData = useMemo(() => {
    return Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        label: format(parseISO(date), "MMM d"),
        sessions: vals.sessions,
        leads: vals.leads,
      }));
  }, [dailyMap]);

  if (chartData.length === 0) return null;

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Trends</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-[3px] rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">Sessions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-[3px] rounded-full bg-success" />
            <span className="text-xs text-muted-foreground">Leads</span>
          </div>
        </div>
      </div>
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="sessionsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "11px",
                padding: "8px 12px",
              }}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              labelFormatter={(label) => label}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#sessionsFill)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
            />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              fill="url(#leadsFill)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--success))" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
