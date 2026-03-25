import { Badge } from "@/components/ui/badge";
import { getScoreGrade, getScoreStatus } from "@/lib/seo-scoring";
import type { SeoIssue } from "@/lib/seo-scoring";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  score: number;
  issues: SeoIssue[];
  platform: string | null;
  url: string;
  scannedAt: string;
  getPathFromUrl: (url: string) => string;
}

const statusColors: Record<string, string> = {
  excellent: "text-success",
  good: "text-primary",
  "needs-work": "text-warning",
  poor: "text-destructive",
};

export default function SeoScoreCard({ score, issues, platform, url, scannedAt, getPathFromUrl }: Props) {
  const { t } = useTranslation();
  const grade = getScoreGrade(score);
  const status = getScoreStatus(score);

  const groupedIssues = {
    Critical: issues.filter(i => i.impact === "Critical"),
    High: issues.filter(i => i.impact === "High"),
    Medium: issues.filter(i => i.impact === "Medium"),
    Low: issues.filter(i => i.impact === "Low"),
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{getPathFromUrl(url)}</span>
        <span>·</span>
        <span>{new Date(scannedAt).toLocaleDateString()}</span>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center">
          <div className={`text-5xl font-bold ${statusColors[status]}`}>{score}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("dashboard.seoScore")}</div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-lg font-bold ${statusColors[status]}`}>{t("reports.grade")}: {grade}</span>
            {platform && (
              <Badge variant="outline" className="text-xs uppercase">{platform}</Badge>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {(["Critical", "High", "Medium", "Low"] as const).map((impact) => (
              <div key={impact} className="text-center">
                <div className="text-lg font-bold text-foreground">{groupedIssues[impact].length}</div>
                <div className="text-xs uppercase text-muted-foreground">{impact}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
