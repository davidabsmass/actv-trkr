import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Shield, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SeoIssue } from "@/lib/seo-scoring";
import { useTranslation } from "react-i18next";

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

const AUTO_FIXABLE: Record<string, string> = {
  "title-missing": "set_title",
  "title-too-short": "set_title",
  "title-too-long": "set_title",
  "meta-desc-missing": "set_meta_desc",
  "meta-desc-too-short": "set_meta_desc",
  "meta-desc-too-long": "set_meta_desc",
  "canonical-missing": "add_canonical",
  "og-tags-missing": "add_og_tags",
};

interface Props {
  issues: SeoIssue[];
  onFixClick?: (issueId: string, fixType: string) => void;
}

export default function SeoIssuesList({ issues, onFixClick }: Props) {
  const { t } = useTranslation();
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
              {group.map((issue) => {
                const fixType = AUTO_FIXABLE[issue.id];

                return (
                  <div
                    key={issue.id}
                    className={`rounded-lg border p-4 transition-colors cursor-pointer hover:bg-muted/30 ${impactColors[impact]}`}
                    onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h5 className="text-sm font-medium text-foreground truncate">{issue.title}</h5>
                        {issue.category && (
                          <Badge variant="outline" className="text-xs uppercase shrink-0">{issue.category}</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {fixType && onFixClick && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={(e) => { e.stopPropagation(); onFixClick(issue.id, fixType); }}
                          >
                            <Wand2 className="h-2.5 w-2.5" /> {t("reports.suggestedCopy", { defaultValue: "Suggested Copy" })}
                          </Button>
                        )}

                        <Shield className={`h-3.5 w-3.5 transition-transform ${expanded === issue.id ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                    {expanded === issue.id && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{issue.fix}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
