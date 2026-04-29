import { ArrowUpRight, ArrowDownRight, Minus, Users, Target, Eye, TrendingUp, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Sparkline } from "./Sparkline";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type KpiVariant = "primary" | "success" | "warning" | "info";

interface KPICardProps {
  label: string;
  value: string;
  delta: number | null;
  prefix?: string;
  suffix?: string;
  subtext?: string;
  variant?: KpiVariant;
  icon?: React.ReactNode;
  series?: number[];
  sparkColor?: string;
}

function humanizeDelta(delta: number | null, t: (key: string) => string): { text: string; className: string; explain?: string } {
  if (delta === null) return { text: "—", className: "text-muted-foreground" };
  const pct = Math.abs(delta * 100);
  if (pct < 1) return { text: t("dashboard.noChange"), className: "kpi-neutral" };
  if (delta > 0.15) return { text: t("dashboard.strongGrowth"), className: "kpi-up" };
  if (delta > 0) return { text: `+${(delta * 100).toFixed(1)}%`, className: "kpi-up" };
  if (delta < -0.15)
    return {
      text: t("dashboard.attentionNeeded"),
      className: "kpi-down",
      explain: `Down ${pct.toFixed(1)}% vs. the previous period — a drop of more than 15% is worth a quick look.`,
    };
  return { text: `${(delta * 100).toFixed(1)}%`, className: "kpi-down" };
}

const VARIANT_TOKEN: Record<KpiVariant, string> = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  info: "hsl(var(--info))",
};

export function KPICard({
  label,
  value,
  delta,
  suffix,
  subtext,
  variant = "primary",
  icon,
  series,
  sparkColor,
}: KPICardProps) {
  const { t } = useTranslation();
  const isUp = delta !== null && delta > 0;
  const isDown = delta !== null && delta < 0;
  const { text: deltaText, className: deltaClass, explain: deltaExplain } = humanizeDelta(delta, t);

  return (
    <div className="kpi-card p-5 flex flex-col gap-1.5 animate-slide-up min-h-[148px]">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className="icon-chip" data-tone={variant === "primary" ? undefined : variant}>
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-3xl font-semibold font-mono-data tracking-tight text-foreground leading-none">
          {value}
          {suffix && <span className="text-base text-muted-foreground ml-0.5">{suffix}</span>}
        </span>
      </div>

      {delta !== null && (
        <div className="flex items-center gap-1">
          {isUp && <ArrowUpRight className="h-3.5 w-3.5 kpi-up" />}
          {isDown && <ArrowDownRight className="h-3.5 w-3.5 kpi-down" />}
          {!isUp && !isDown && <Minus className="h-3.5 w-3.5 kpi-neutral" />}
          {deltaExplain ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`text-xs font-medium cursor-help underline decoration-dotted underline-offset-2 ${deltaClass}`}>
                    {deltaText}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {deltaExplain}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className={`text-xs font-medium ${deltaClass}`}>{deltaText}</span>
          )}
          {subtext && <span className="text-xs text-muted-foreground ml-1.5 truncate">{subtext}</span>}
        </div>
      )}
      {delta === null && subtext && (
        <p className="text-xs text-muted-foreground truncate">{subtext}</p>
      )}

      <div className="mt-auto -mx-1">
        <Sparkline
          data={series && series.length > 1 ? series : [0, 0]}
          color={sparkColor || VARIANT_TOKEN[variant]}
          height={28}
        />
      </div>
    </div>
  );
}

interface KPIRowProps {
  kpis: {
    sessions: { value: number; delta: number | null; label: string };
    leads: { value: number; delta: number | null; label: string };
    pageviews: { value: number; delta: number | null; label: string };
    cvr: { value: number; delta: number | null; label: string };
  };
  totalSessions?: number;
  totalLeads?: number;
  /** Map of YYYY-MM-DD → daily counts. Drives the per-card sparkline. */
  dailyMap?: Record<string, { sessions: number; leads: number; pageviews: number }>;
}

export function KPIRow({ kpis, totalSessions, totalLeads, dailyMap }: KPIRowProps) {
  const { t } = useTranslation();
  const cvrSubtext =
    totalSessions && totalLeads !== undefined
      ? t("common.ofSessionsConverted", { leads: totalLeads, sessions: totalSessions })
      : undefined;

  const series = useMemo(() => {
    if (!dailyMap) return { sessions: [], leads: [], pageviews: [], cvr: [] };
    const ordered = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b));
    return {
      sessions: ordered.map(([, v]) => v.sessions),
      leads: ordered.map(([, v]) => v.leads),
      pageviews: ordered.map(([, v]) => v.pageviews),
      cvr: ordered.map(([, v]) => (v.sessions > 0 ? Math.min(1, v.leads / v.sessions) : 0)),
    };
  }, [dailyMap]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICard
        label={kpis.sessions.label}
        value={kpis.sessions.value.toLocaleString()}
        delta={kpis.sessions.delta}
        variant="primary"
        icon={<Users className="h-4 w-4" />}
        series={series.sessions}
      />
      <KPICard
        label={kpis.leads.label}
        value={kpis.leads.value.toLocaleString()}
        delta={kpis.leads.delta}
        variant="success"
        icon={<Target className="h-4 w-4" />}
        series={series.leads}
      />
      <KPICard
        label={kpis.pageviews.label}
        value={kpis.pageviews.value.toLocaleString()}
        delta={kpis.pageviews.delta}
        variant="info"
        icon={<Eye className="h-4 w-4" />}
        series={series.pageviews}
      />
      <KPICard
        label={kpis.cvr.label}
        value={`${(kpis.cvr.value * 100).toFixed(1)}`}
        delta={kpis.cvr.delta}
        suffix="%"
        subtext={cvrSubtext}
        variant="warning"
        icon={<TrendingUp className="h-4 w-4" />}
        series={series.cvr}
      />
    </div>
  );
}
