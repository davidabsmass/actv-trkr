import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Shield, Wand2, Check, Clock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export interface FixQueueItem {
  id: string;
  issue_id: string;
  status: string;
  created_at?: string;
}

interface Props {
  issues: SeoIssue[];
  fixQueue?: FixQueueItem[];
  markedFixed?: Set<string>;
  onFixClick?: (issueId: string, fixType: string) => void;
  onMarkFixed?: (issueId: string) => void;
  onVerify?: () => void;
}

export default function SeoIssuesList({ issues, fixQueue = [], markedFixed = new Set(), onFixClick, onMarkFixed, onVerify }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const getFixStatus = (issueId: string): FixQueueItem | undefined =>
    fixQueue.find((f) => f.issue_id === issueId);

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
                const queueItem = getFixStatus(issue.id);
                const isMarkedFixed = markedFixed.has(issue.id);

                return (
                  <div
                    key={issue.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      isMarkedFixed || queueItem?.status === "applied"
                        ? "opacity-60 bg-muted/20 border-border"
                        : `cursor-pointer hover:bg-muted/30 ${impactColors[impact]}`
                    }`}
                    onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h5 className="text-sm font-medium text-foreground truncate">{issue.title}</h5>
                        {issue.category && (
                          <Badge variant="outline" className="text-[9px] uppercase shrink-0">{issue.category}</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Fix status badges */}
                        {queueItem?.status === "pending" && (() => {
                          const isStale = queueItem.created_at && (Date.now() - new Date(queueItem.created_at).getTime()) > 60 * 60 * 1000;
                          return (
                            <div className="flex items-center gap-1.5">
                              <Badge className={`${isStale ? "bg-destructive/20 text-destructive border-destructive/30" : "bg-warning/20 text-warning border-warning/30"} text-[9px] gap-1`}>
                                <Clock className="h-2.5 w-2.5" /> {isStale ? "Stale" : "Pending"}
                              </Badge>
                              {isStale && (
                                <span className="text-[9px] text-destructive/80">Plugin may not be polling — deactivate &amp; reactivate in WP</span>
                              )}
                            </div>
                          );
                        })()}
                        {queueItem?.status === "applied" && (
                          <>
                            <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[9px] gap-1">
                              <Check className="h-2.5 w-2.5" /> Applied
                            </Badge>
                            {onVerify && (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); onVerify(); }}>
                                <RefreshCw className="h-2.5 w-2.5 mr-1" /> Verify
                              </Button>
                            )}
                          </>
                        )}
                        {queueItem?.status === "skipped" && (
                          <Badge variant="outline" className="text-[9px]">Skipped</Badge>
                        )}
                        {isMarkedFixed && !queueItem && (
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[9px] gap-1">
                            <Check className="h-2.5 w-2.5" /> Marked Fixed
                          </Badge>
                        )}

                        {/* Action buttons */}
                        {!queueItem && !isMarkedFixed && fixType && onFixClick && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={(e) => { e.stopPropagation(); onFixClick(issue.id, fixType); }}
                          >
                            <Wand2 className="h-2.5 w-2.5" /> Fix This
                          </Button>
                        )}
                        {!queueItem && !isMarkedFixed && !fixType && onMarkFixed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-muted-foreground"
                            onClick={(e) => { e.stopPropagation(); onMarkFixed(issue.id); }}
                          >
                            Mark Fixed
                          </Button>
                        )}
                        {!queueItem && !isMarkedFixed && fixType && onMarkFixed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-muted-foreground"
                            onClick={(e) => { e.stopPropagation(); onMarkFixed(issue.id); }}
                          >
                            Mark Fixed
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
