import { TrendingDown, TrendingUp, AlertTriangle, Lightbulb, ShieldAlert, Sparkles } from "lucide-react";
import { PrimaryFocus } from "@/hooks/use-site-settings";
import { useTranslation } from "react-i18next";

export interface SmartInsight {
  id: string;
  type: "success" | "warning" | "alert" | "idea";
  headline: string;
  impact?: string;
  confidence: "High" | "Medium" | "Low";
  actionLabel?: string;
  actionPath?: string;
  _weight?: number;
}

const typeConfig = {
  success: { icon: TrendingUp, bg: "bg-success/5", border: "border-success/20", iconColor: "text-success" },
  warning: { icon: AlertTriangle, bg: "bg-warning/5", border: "border-warning/20", iconColor: "text-warning" },
  alert: { icon: ShieldAlert, bg: "bg-destructive/5", border: "border-destructive/20", iconColor: "text-destructive" },
  idea: { icon: Lightbulb, bg: "bg-primary/5", border: "border-primary/20", iconColor: "text-primary" },
};

const confidenceColors: Record<string, string> = {
  High: "bg-success/10 text-success",
  Medium: "bg-warning/10 text-warning",
  Low: "bg-muted text-muted-foreground",
};

interface SmartUpdatesProps {
  insights: SmartInsight[];
  onAction?: (path: string) => void;
}

export function SmartUpdates({ insights, onAction }: SmartUpdatesProps) {
  const { t } = useTranslation();
  const visible = insights.slice(0, 5);
  if (visible.length === 0) return null;

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("dashboard.smartUpdates")}</h3>
      </div>
      <div className="space-y-2">
        {visible.map((insight) => {
          const config = typeConfig[insight.type];
          const Icon = config.icon;
          return (
            <div key={insight.id} className={`flex items-start gap-3 p-3 rounded-lg border ${config.bg} ${config.border}`}>
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-foreground">{insight.headline}</p>
                  <span className={`text-xs uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${confidenceColors[insight.confidence]}`}>
                    {insight.confidence}
                  </span>
                </div>
                {insight.impact && <p className="text-xs text-muted-foreground mt-0.5">{insight.impact}</p>}
              </div>
              {insight.actionLabel && insight.actionPath && onAction && (
                <button onClick={() => onAction(insight.actionPath!)} className="text-xs font-medium text-primary hover:underline whitespace-nowrap flex-shrink-0">
                  {insight.actionLabel} →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Focus-aware weight boosts per insight category
const focusWeights: Record<PrimaryFocus, Record<string, number>> = {
  lead_volume: { leads_drop: 10, leads_growth: 8, top_page: 6, traffic_spike: 5, cvr_drop: 3, sessions_drop: 3 },
  marketing_impact: { leads_drop: 5, leads_growth: 5, top_page: 3, traffic_spike: 6, cvr_drop: 4, sessions_drop: 8 },
  conversion_performance: { cvr_drop: 10, top_page: 8, leads_drop: 5, leads_growth: 4, traffic_spike: 3, sessions_drop: 3 },
  paid_optimization: { sessions_drop: 8, cvr_drop: 7, leads_drop: 6, traffic_spike: 5, top_page: 3, leads_growth: 3 },
};

export function generateInsights(
  data: {
    sessions: { current: number; previous: number };
    leads: { current: number; previous: number };
    cvr: { current: number; previous: number };
    pages?: Array<{ page_path: string; sessions: number; leads: number; cvr: number }>;
    sources?: Array<{ source: string; sessions: number; leads: number }>;
  },
  focus: PrimaryFocus = "lead_volume"
): SmartInsight[] {
  const insights: SmartInsight[] = [];
  const weights = focusWeights[focus] || focusWeights.lead_volume;

  const leadsChange = data.leads.previous > 0 ? ((data.leads.current - data.leads.previous) / data.leads.previous) * 100 : 0;
  const sessionsChange = data.sessions.previous > 0 ? ((data.sessions.current - data.sessions.previous) / data.sessions.previous) * 100 : 0;
  const cvrChange = data.cvr.previous > 0 ? ((data.cvr.current - data.cvr.previous) / data.cvr.previous) * 100 : 0;

  if (leadsChange <= -25) {
    insights.push({ id: "leads_drop", type: "alert", headline: `Leads dropped ${Math.abs(leadsChange).toFixed(0)}% week-over-week`, impact: `From ${data.leads.previous} to ${data.leads.current} leads`, confidence: "High", actionLabel: "View Sources", actionPath: "#section-sources", _weight: weights.leads_drop || 5 });
  }
  if (cvrChange <= -20) {
    insights.push({ id: "cvr_drop", type: "warning", headline: `Conversion rate dropped ${Math.abs(cvrChange).toFixed(0)}%`, impact: `Now at ${(data.cvr.current * 100).toFixed(1)}%`, confidence: "High", actionLabel: "View Pages", actionPath: "#section-pages", _weight: weights.cvr_drop || 5 });
  }
  if (sessionsChange >= 30) {
    insights.push({ id: "traffic_spike", type: "success", headline: `Traffic surged ${sessionsChange.toFixed(0)}% this week`, impact: `${data.sessions.current.toLocaleString()} sessions`, confidence: "High", actionLabel: "View Sources", actionPath: "#section-sources", _weight: weights.traffic_spike || 5 });
  }
  if (sessionsChange <= -30) {
    insights.push({ id: "sessions_drop", type: "alert", headline: `Traffic dropped ${Math.abs(sessionsChange).toFixed(0)}% WoW`, impact: "Check for tracking issues or campaign changes", confidence: "Medium", actionLabel: "Check Settings", actionPath: "/settings", _weight: weights.sessions_drop || 5 });
  }
  if (leadsChange >= 20 && data.leads.current >= 3) {
    insights.push({ id: "leads_growth", type: "success", headline: `Leads up ${leadsChange.toFixed(0)}% — nice momentum`, impact: `${data.leads.current} leads this week`, confidence: "High", _weight: weights.leads_growth || 5 });
  }
  if (data.pages && data.pages.length > 0) {
    const topPage = data.pages.sort((a, b) => b.leads - a.leads)[0];
    if (topPage && topPage.leads >= 2) {
      insights.push({ id: "top_page", type: "idea", headline: `${topPage.page_path} is your top converting page`, impact: `${topPage.leads} leads from ${topPage.sessions} sessions`, confidence: "Medium", actionLabel: "View Pages", actionPath: "#section-pages", _weight: weights.top_page || 5 });
    }
  }

  return insights.sort((a, b) => (b._weight || 0) - (a._weight || 0));
}
