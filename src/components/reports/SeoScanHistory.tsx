import { Clock, Globe } from "lucide-react";
import { getScoreGrade, getScoreStatus } from "@/lib/seo-scoring";

interface ScanEntry {
  id: string;
  url: string;
  score: number;
  scanned_at: string;
  platform: string | null;
}

interface Props {
  scans: ScanEntry[];
  activeScanId: string | null;
  onSelect: (id: string) => void;
  getPathFromUrl: (url: string) => string;
}

const statusColors: Record<string, string> = {
  excellent: "text-success",
  good: "text-primary",
  "needs-work": "text-warning",
  poor: "text-destructive",
};

export default function SeoScanHistory({ scans, activeScanId, onSelect, getPathFromUrl }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" /> Scan History
      </h4>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {scans.map((scan) => {
          const status = getScoreStatus(scan.score);
          const isActive = scan.id === activeScanId;
          return (
            <button
              key={scan.id}
              onClick={() => onSelect(scan.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors text-sm ${
                isActive
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate font-medium text-foreground">
                  {getPathFromUrl(scan.url)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span className={`text-sm font-bold ${statusColors[status]}`}>
                  {scan.score}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(scan.scanned_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
