import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface WoWData {
  sessions: { current: number; previous: number };
  leads: { current: number; previous: number };
  cvr: { current: number; previous: number };
  bestPage?: string;
  biggestDrop?: string;
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function ChangeChip({ label, current, previous, isCvr }: { label: string; current: number; previous: number; isCvr?: boolean }) {
  const change = pctChange(current, previous);
  const isUp = change > 0;
  const isDown = change < 0;
  const displayValue = isCvr ? `${(current * 100).toFixed(1)}%` : current.toLocaleString();
  const changeStr = `${isUp ? "+" : ""}${change.toFixed(1)}%`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-semibold font-mono-data text-foreground">{displayValue}</span>
      <div className="flex items-center gap-0.5">
        {isUp && <TrendingUp className="h-3 w-3 kpi-up" />}
        {isDown && <TrendingDown className="h-3 w-3 kpi-down" />}
        {!isUp && !isDown && <Minus className="h-3 w-3 kpi-neutral" />}
        <span className={`text-xs font-mono-data font-medium ${isUp ? "kpi-up" : isDown ? "kpi-down" : "kpi-neutral"}`}>
          {changeStr}
        </span>
      </div>
    </div>
  );
}

export function WeekOverWeekStrip({ data }: { data: WoWData }) {
  const { t } = useTranslation();
  const hasAnomaly = useMemo(() => {
    const leadsChange = pctChange(data.leads.current, data.leads.previous);
    const sessionsChange = pctChange(data.sessions.current, data.sessions.previous);
    return leadsChange < -20 || sessionsChange < -25;
  }, [data]);

  const anomalyMessage = useMemo(() => {
    const leadsChange = pctChange(data.leads.current, data.leads.previous);
    const sessionsChange = pctChange(data.sessions.current, data.sessions.previous);
    if (leadsChange < -20) return t("anomaly.leadsDown", { pct: Math.abs(leadsChange).toFixed(0) });
    if (sessionsChange < -25) return t("anomaly.sessionsDropped", { pct: Math.abs(sessionsChange).toFixed(0) });
    return null;
  }, [data]);

  const isStable = useMemo(() => {
    const sc = Math.abs(pctChange(data.sessions.current, data.sessions.previous));
    const lc = Math.abs(pctChange(data.leads.current, data.leads.previous));
    return sc < 5 && lc < 5;
  }, [data]);

  return (
    <div className="glass-card p-4 animate-slide-up">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-xs uppercase tracking-wider font-semibold text-primary">{t("dashboard.weekOverWeek")}</span>
        <ChangeChip label={t("dashboard.sessions")} current={data.sessions.current} previous={data.sessions.previous} />
        <ChangeChip label={t("dashboard.leads")} current={data.leads.current} previous={data.leads.previous} />
        <ChangeChip label={t("dashboard.conversionRate")} current={data.cvr.current} previous={data.cvr.previous} isCvr />
        {data.bestPage && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("dashboard.bestPage")}</span>
            <span className="text-xs font-medium text-foreground truncate max-w-[150px]">{data.bestPage}</span>
          </div>
        )}
      </div>
      {hasAnomaly && anomalyMessage && (
        <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
          <p className="text-xs text-foreground">{anomalyMessage}</p>
        </div>
      )}
      {isStable && !hasAnomaly && (
        <p className="text-xs text-muted-foreground mt-2">{t("dashboard.performanceStable")}</p>
      )}
    </div>
  );
}
