import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Finding } from "@/lib/insight-engine";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function SummaryCard({
  label, value, change, changeLabel, summary, tooltip, footnote,
}: {
  label: string;
  value: string | number;
  change?: number | null;
  changeLabel?: string;
  summary?: string;
  /** Optional explanation rendered behind an info icon next to the label. */
  tooltip?: React.ReactNode;
  /** Small line shown beneath the value (e.g. category breakdown). */
  footnote?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        {tooltip && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/60 hover:text-foreground transition-colors">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex items-end gap-2 mb-1.5">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {change !== null && change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium pb-0.5 ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {change > 0 ? "+" : ""}{change}%
          </span>
        )}
      </div>
      {changeLabel && change !== null && change !== undefined && (
        <p className="text-xs text-muted-foreground/60 mb-1">{changeLabel}</p>
      )}
      {footnote && <div className="text-xs text-muted-foreground leading-relaxed mt-0.5">{footnote}</div>}
      {summary && <p className="text-xs text-muted-foreground leading-relaxed mt-1">{summary}</p>}
    </div>
  );
}

const severityColors = {
  high: "border-destructive/30 bg-destructive/5",
  medium: "border-warning/30 bg-warning/5",
  low: "border-success/30 bg-success/5",
};

// Metric key translations
const metricKeyMap: Record<string, string> = {
  current: "findings.metricCurrent",
  previous: "findings.metricPrevious",
  change: "findings.metricChange",
  views: "findings.metricViews",
  leads: "findings.metricLeads",
  cvr: "findings.metricCvr",
  exits: "findings.metricExits",
  exitRate: "findings.metricExitRate",
  desktopCvr: "findings.metricDesktopCvr",
  mobileCvr: "findings.metricMobileCvr",
  starts: "findings.metricStarts",
  submissions: "findings.metricSubmissions",
  abandonRate: "findings.metricAbandonRate",
  count: "findings.metricCount",
};

export function InsightCard({ finding }: { finding: Finding }) {
  const { t } = useTranslation();

  // Translate category, severity, title, explanation, and action via finding.type key
  const categoryKey = `findings.category.${finding.category.replace(/\s+/g, "")}`;
  const translatedCategory = t(categoryKey, { defaultValue: finding.category });
  const translatedSeverity = t(`findings.severity.${finding.severity}`, { defaultValue: finding.severity });
  const translatedTitle = t(`findings.${finding.type}.title`, { defaultValue: finding.title });

  // Build interpolation values from metric_values for explanation
  const metricVals = finding.metric_values || {};
  // Provide absolute change value for "dropped X%" translations
  const changeVal = typeof metricVals.change === "number" ? metricVals.change : 0;
  const translatedExplanation = t(`findings.${finding.type}.explanation`, {
    defaultValue: finding.explanation,
    ...metricVals,
    change: Math.abs(changeVal),
    page: finding.page || "",
  });
  const translatedAction = finding.recommended_action
    ? t(`findings.${finding.type}.action`, { defaultValue: finding.recommended_action })
    : undefined;

  const categoryColors: Record<string, string> = {
    Traffic: "bg-primary/10 text-primary",
    Conversion: "bg-warning/10 text-warning",
    Engagement: "bg-info/10 text-info",
    SEO: "bg-accent/10 text-accent-foreground",
    "Site Health": "bg-destructive/10 text-destructive",
    "Lead Tracking": "bg-success/10 text-success",
  };

  const metricEntries = metricVals ? Object.entries(metricVals) : [];

  return (
    <div className={`rounded-lg border p-4 ${severityColors[finding.severity]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${categoryColors[finding.category] || "bg-muted text-muted-foreground"}`}>
          {translatedCategory}
        </span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {translatedSeverity} {t("reports.priority")}
        </span>
      </div>
      <h4 className="text-sm font-semibold text-foreground mb-1">{translatedTitle}</h4>
      <p className="text-xs text-foreground/80 leading-relaxed">{translatedExplanation}</p>

      {metricEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {metricEntries.map(([key, val]) => {
            const labelKey = metricKeyMap[key];
            const translatedLabel = labelKey ? t(labelKey) : key.replace(/_/g, " ");
            return (
              <span key={key} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 rounded px-2 py-0.5">
                <span className="capitalize">{translatedLabel}:</span>
                <span className="text-foreground font-semibold">
                  {typeof val === "number"
                    ? `${val.toLocaleString()}${key.toLowerCase().includes("change") || key.toLowerCase().includes("pct") ? "%" : ""}`
                    : val}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {translatedAction && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-0.5">{t("reports.suggestedAction")}</p>
          <p className="text-xs text-foreground">{translatedAction}</p>
        </div>
      )}
    </div>
  );
}
