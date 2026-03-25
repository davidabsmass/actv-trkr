import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Finding } from "@/lib/insight-engine";

export function SummaryCard({
  label, value, change, changeLabel, summary,
}: {
  label: string;
  value: string | number;
  change?: number | null;
  changeLabel?: string;
  summary?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">{label}</p>
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
      {summary && <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>}
    </div>
  );
}

const severityColors = {
  high: "border-destructive/30 bg-destructive/5",
  medium: "border-warning/30 bg-warning/5",
  low: "border-success/30 bg-success/5",
};

const categoryColors: Record<string, string> = {
  Traffic: "bg-primary/10 text-primary",
  Conversion: "bg-warning/10 text-warning",
  Engagement: "bg-info/10 text-info",
  SEO: "bg-accent/10 text-accent-foreground",
  "Site Health": "bg-destructive/10 text-destructive",
  "Lead Tracking": "bg-success/10 text-success",
};

export function InsightCard({ finding }: { finding: Finding }) {
  const metricEntries = finding.metric_values ? Object.entries(finding.metric_values) : [];

  return (
    <div className={`rounded-lg border p-4 ${severityColors[finding.severity]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${categoryColors[finding.category] || "bg-muted text-muted-foreground"}`}>
          {finding.category}
        </span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {finding.severity} priority
        </span>
      </div>
      <h4 className="text-sm font-semibold text-foreground mb-1">{finding.title}</h4>
      <p className="text-xs text-foreground/80 leading-relaxed">{finding.explanation}</p>

      {/* Surface actual metric values so recommendations are grounded in data */}
      {metricEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {metricEntries.map(([key, val]) => (
            <span key={key} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 rounded px-2 py-0.5">
              <span className="capitalize">{key.replace(/_/g, " ")}:</span>
              <span className="text-foreground font-semibold">{typeof val === "number" ? `${val.toLocaleString()}${key.toLowerCase().includes("change") || key.toLowerCase().includes("pct") ? "%" : ""}` : val}</span>
            </span>
          ))}
        </div>
      )}

      {finding.recommended_action && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Suggested Action</p>
          <p className="text-xs text-foreground">{finding.recommended_action}</p>
        </div>
      )}
    </div>
  );
}
