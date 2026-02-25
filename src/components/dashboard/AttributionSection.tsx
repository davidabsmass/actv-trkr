import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useState } from "react";

interface AttributionProps {
  sources: Array<{ source: string; sessions: number; leads: number; cvr: number }>;
  campaigns: Array<{ campaign: string; sessions: number; leads: number; cvr: number }>;
}

export function AttributionSection({ sources, campaigns }: AttributionProps) {
  const [tab, setTab] = useState<"source" | "campaign">("source");
  const data = tab === "source" ? sources : campaigns;
  const labelKey = tab === "source" ? "source" : "campaign";

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Attribution</h3>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button
            onClick={() => setTab("source")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === "source" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Source
          </button>
          <button
            onClick={() => setTab("campaign")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === "campaign" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Campaign
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Chart */}
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey={labelKey}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} iconType="circle" iconSize={8} />
              <Bar dataKey="sessions" fill="hsl(var(--chart-1))" name="Sessions" radius={[0, 3, 3, 0]} barSize={12} />
              <Bar dataKey="leads" fill="hsl(var(--chart-2))" name="Leads" radius={[0, 3, 3, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">
                  {tab === "source" ? "Source" : "Campaign"}
                </th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Sessions</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Leads</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">CVR</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="py-2 px-2 font-medium text-foreground">
                    {tab === "source" ? (row as any).source : (row as any).campaign}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                    {row.sessions.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                    {row.leads.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-data text-foreground">
                    {(row.cvr * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
