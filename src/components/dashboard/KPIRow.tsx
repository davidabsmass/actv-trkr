import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface KPICardProps {
  label: string;
  value: string;
  delta: number;
  prefix?: string;
  suffix?: string;
  subtext?: string;
}

function humanizeDelta(delta: number, t: (key: string) => string): { text: string; className: string } {
  const pct = Math.abs(delta * 100);
  if (pct < 1) return { text: t("dashboard.noChange"), className: "kpi-neutral" };
  if (delta > 0.15) return { text: t("dashboard.strongGrowth"), className: "kpi-up" };
  if (delta > 0) return { text: `+${(delta * 100).toFixed(1)}%`, className: "kpi-up" };
  if (delta < -0.15) return { text: t("dashboard.attentionNeeded"), className: "kpi-down" };
  return { text: `${(delta * 100).toFixed(1)}%`, className: "kpi-down" };
}

export function KPICard({ label, value, delta, suffix, subtext }: KPICardProps) {
  const { t } = useTranslation();
  const isUp = delta > 0;
  const isDown = delta < 0;
  const { text: deltaText, className: deltaClass } = humanizeDelta(delta, t);

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
        {isUp && <ArrowUpRight className="h-3.5 w-3.5 kpi-up" />}
        {isDown && <ArrowDownRight className="h-3.5 w-3.5 kpi-down" />}
        {!isUp && !isDown && <Minus className="h-3.5 w-3.5 kpi-neutral" />}
        <span className={`text-xs font-medium ${deltaClass}`}>
          {deltaText}
        </span>
      </div>
      {subtext && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>
      )}
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
  totalSessions?: number;
  totalLeads?: number;
}

export function KPIRow({ kpis, totalSessions, totalLeads }: KPIRowProps) {
  const { t } = useTranslation();
  const cvrSubtext = totalSessions && totalLeads !== undefined
    ? t("common.ofSessionsConverted", { leads: totalLeads, sessions: totalSessions })
    : undefined;

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
        value={`${(kpis.cvr.value * 100).toFixed(1)}`}
        delta={kpis.cvr.delta}
        suffix="%"
        subtext={cvrSubtext}
      />
    </div>
  );
}
