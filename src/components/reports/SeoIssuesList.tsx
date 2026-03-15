import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SeoIssue } from "@/lib/seo-scoring";

const impactColors: Record<string, string> = {
  Critical: "bg-destructive/10 text-destructive border-destructive/20",
  High: "bg-warning/10 text-warning border-warning/20",
  Medium: "bg-primary/10 text-primary border-primary/20",
  Low: "bg-muted text-muted-foreground border-border",
};

const impactIcons: Record<string, React.ReactNode> = {
  Critical: <AlertCircle className="h-4 w-4 text-destructive" />,
  High: <AlertTriangle className="h-4 w-4 text-warning" />,
  Medium: <Info className="h-4 w-4 text-primary" />,
  Low: <CheckCircle2 className="h-4 w-4 text-muted-foreground" />,
};

interface Props {
  issues: SeoIssue[];
}

export default function SeoIssuesList({ issues }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const groupedIssues = {
    Critical: issues.filter(i => i.impact === "Critical"),
    High: issues.filter(i => i.impact === "High"),
    Medium: issues.filter(i => i.impact === "Medium"),
    Low: issues.filter(i => i.impact === "Low"),
  };

  return (
    <div className="space-y-3">
      {(["Critical", "High", "Medium", "Low"] as const).map((impact) => {
        const group = groupedIssues[impact];
        if (group.length === 0) return null;
        return (
          <div key={impact}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              {impactIcons[impact]} {impact} ({group.length})
            </h4>
            <div className="space-y-2">
              {group.map((issue) => (
                <div
                  key={issue.id}
                  className={`rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/30 ${impactColors[impact]}`}
                  onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h5 className="text-sm font-medium text-foreground">{issue.title}</h5>
                      {issue.category && (
                        <Badge variant="outline" className="text-[9px] uppercase">{issue.category}</Badge>
                      )}
                    </div>
                    <Shield className={`h-3.5 w-3.5 transition-transform ${expanded === issue.id ? "rotate-180" : ""}`} />
                  </div>
                  {expanded === issue.id && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{issue.fix}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
