import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  delta: number;
  prefix?: string;
  suffix?: string;
}

export function KPICard({ label, value, delta, suffix }: KPICardProps) {
  const isUp = delta > 0;
  const isDown = delta < 0;
  const deltaStr = `${isUp ? "+" : ""}${(delta * 100).toFixed(1)}%`;

  return (
    <div className="glass-card p-5 flex flex-col gap-1 animate-slide-up">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-semibold font-mono-data tracking-tight text-foreground">
          {value}
          {suffix && <span className="text-sm text-muted-foreground ml-0.5">{suffix}</span>}
        </span>
      </div>
      <div className="flex items-center gap-1 mt-1">
        {isUp && <ArrowUpRight className="h-3.5 w-3.5 text-kpi-up" />}
        {isDown && <ArrowDownRight className="h-3.5 w-3.5 text-kpi-down" />}
        {!isUp && !isDown && <Minus className="h-3.5 w-3.5 text-kpi-neutral" />}
        <span className={`text-xs font-mono-data font-medium ${isUp ? "text-kpi-up" : isDown ? "text-kpi-down" : "text-kpi-neutral"}`}>
          {deltaStr}
        </span>
        <span className="text-xs text-muted-foreground">vs prior period</span>
      </div>
    </div>
  );
}

interface KPIRowProps {
  kpis: {
    sessions: { value: number; delta: number; label: string };
    leads: { value: number; delta: number; label: string };
    pageviews: { value: number; delta: number; label: string };
    cvr: { value: number; delta: number; label: string };
  };
}

export function KPIRow({ kpis }: KPIRowProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICard
        label={kpis.sessions.label}
        value={kpis.sessions.value.toLocaleString()}
        delta={kpis.sessions.delta}
      />
      <KPICard
        label={kpis.leads.label}
        value={kpis.leads.value.toLocaleString()}
        delta={kpis.leads.delta}
      />
      <KPICard
        label={kpis.pageviews.label}
        value={kpis.pageviews.value.toLocaleString()}
        delta={kpis.pageviews.delta}
      />
      <KPICard
        label={kpis.cvr.label}
        value={`${(kpis.cvr.value * 100).toFixed(2)}`}
        delta={kpis.cvr.delta}
        suffix="%"
      />
    </div>
  );
}
