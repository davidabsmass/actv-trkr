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
import { ChevronDown, ChevronUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";

interface AttributionProps {
  sources: Array<{ source: string; sessions: number; leads: number; cvr: number }>;
  campaigns: Array<{ campaign: string; sessions: number; leads: number; cvr: number }>;
}

type SortKey = "sessions" | "leads" | "cvr";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === "desc"
    ? <ChevronDown className="h-3 w-3 text-primary" />
    : <ChevronUp className="h-3 w-3 text-primary" />;
}

export function AttributionSection({ sources, campaigns }: AttributionProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"source" | "campaign">("source");
  const [sortKey, setSortKey] = useState<SortKey>("sessions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const rawData = tab === "source" ? sources : campaigns;
  const labelKey = tab === "source" ? "source" : "campaign";

  const data = [...rawData].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const thClass = "text-right py-2 px-2 text-muted-foreground font-medium tracking-wider sticky top-0 bg-card cursor-pointer select-none hover:text-foreground transition-colors text-xs";

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {t("dashboard.attribution")}
          <IconTooltip label="Where your traffic and leads come from — referral sources, UTM campaigns, and channels.">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </IconTooltip>
        </h3>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button
            onClick={() => setTab("source")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === "source" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.source")}
          </button>
          <button
            onClick={() => setTab("campaign")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === "campaign" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.campaign")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Chart — top 10 only */}
        {(() => {
          const chartData = rawData.slice(0, 10);
          const chartHeight = Math.max(200, chartData.length * 28);
          return (
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
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
              <Bar dataKey="sessions" fill="hsl(var(--chart-1))" name={t("dashboard.sessions")} radius={[0, 3, 3, 0]} barSize={12} />
              <Bar dataKey="leads" fill="hsl(var(--chart-2))" name={t("dashboard.leads")} radius={[0, 3, 3, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
          );
        })()}

        {/* Table */}
        <ScrollArea className={data.length > 15 ? "h-[420px]" : ""}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium tracking-wider sticky top-0 bg-card text-xs">
                  {tab === "source" ? t("dashboard.source") : t("dashboard.campaign")}
                </th>
                <th className={thClass} onClick={() => handleSort("sessions")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.sessions")} <SortIcon active={sortKey === "sessions"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("leads")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.leads")} <SortIcon active={sortKey === "leads"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("cvr")}>
                  <span className="inline-flex items-center gap-1 justify-end">CVR <SortIcon active={sortKey === "cvr"} dir={sortDir} /></span>
                </th>
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
        </ScrollArea>
      </div>
    </div>
  );
}
