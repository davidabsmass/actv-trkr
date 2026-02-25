import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface ForecastProps {
  forecast: {
    metric: string;
    horizon: number;
    projected_total: number;
    sufficient_data: boolean;
    days_until_available: number;
    points: Array<{
      date: string;
      dateLabel: string;
      yhat: number;
      yhat_low: number;
      yhat_high: number;
    }>;
  };
}

export function ForecastSection({ forecast }: ForecastProps) {
  if (!forecast.sufficient_data) {
    return (
      <div className="glass-card p-5 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-3">Forecast</h3>
        <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-primary-foreground">Forecast available in {forecast.days_until_available} more days</p>
            <p className="text-xs text-primary-foreground/70 mt-0.5">
              We need at least 42 days of data to generate reliable forecasts.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Forecast — Next {forecast.horizon} Days</h3>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-mono-data font-semibold text-foreground">
            ~{Math.round(forecast.projected_total)} projected leads
          </span>
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecast.points} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  yhat: "Forecast",
                  yhat_high: "Upper bound",
                  yhat_low: "Lower bound",
                };
                return [value.toFixed(1), labels[name] || name];
              }}
            />
            <Area
              type="monotone"
              dataKey="yhat_high"
              stroke="none"
              fill="hsl(var(--chart-3))"
              fillOpacity={0.08}
              name="yhat_high"
            />
            <Area
              type="monotone"
              dataKey="yhat_low"
              stroke="none"
              fill="hsl(var(--background))"
              fillOpacity={1}
              name="yhat_low"
            />
            <Area
              type="monotone"
              dataKey="yhat"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              fill="url(#forecastGrad)"
              name="yhat"
              dot={false}
            />
            <ReferenceLine
              y={13}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: "Avg",
                position: "right",
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
