import { useState } from "react";
import { ArrowUpRight, Clock, ChevronUp, ChevronDown } from "lucide-react";

interface PageData {
  path: string;
  sessions: number;
  leads: number;
  cvr: number;
  avgActiveSeconds?: number | null;
}

interface OpportunityData extends PageData {
  expectedLeads: number;
  gap: number;
}

interface ContentProps {
  pages: PageData[];
  opportunities: OpportunityData[];
}

type SortKey = "sessions" | "leads" | "cvr" | "avgActiveSeconds";
type SortDir = "asc" | "desc";

function formatTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function sortRows<T extends PageData>(rows: T[], key: SortKey, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = key === "avgActiveSeconds" ? (a.avgActiveSeconds ?? 0) : a[key];
    const bv = key === "avgActiveSeconds" ? (b.avgActiveSeconds ?? 0) : b[key];
    return dir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });
}

function SortableHeader({
  label,
  icon,
  sortKey,
  activeKey,
  activeDir,
  onSort,
}: {
  label: string;
  icon?: React.ReactNode;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      className="text-right py-2 px-2 text-muted-foreground font-medium tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {icon}
        {label}
        {isActive && (
          activeDir === "desc"
            ? <ChevronDown className="h-3 w-3 text-primary" />
            : <ChevronUp className="h-3 w-3 text-primary" />
        )}
      </span>
    </th>
  );
}

function SortableTable<T extends PageData>({
  rows,
  defaultSort = "sessions",
}: {
  rows: T[];
  defaultSort?: SortKey;
}) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = sortRows(rows, sortKey, sortDir);

  return (
    <div className="overflow-auto max-h-[350px]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border">
            <th className="text-left py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Page</th>
            <SortableHeader label="Sessions" sortKey="sessions" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Leads" sortKey="leads" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
            <SortableHeader label="CVR" sortKey="cvr" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Avg Time" icon={<Clock className="h-3 w-3" />} sortKey="avgActiveSeconds" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
              <td className="py-2 px-2 font-medium text-foreground truncate max-w-[200px]" title={p.path}>
                {p.path}
              </td>
              <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                {p.sessions.toLocaleString()}
              </td>
              <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                {p.leads.toLocaleString()}
              </td>
              <td className="py-2 px-2 text-right font-mono-data text-foreground">
                {(p.cvr * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                {formatTime(p.avgActiveSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContentPerformance({ pages, opportunities }: ContentProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {/* Top Pages */}
      <div className="glass-card p-5 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Top Pages</h3>
        <SortableTable rows={pages} defaultSort="sessions" />
      </div>

      {/* Opportunity List */}
      <div className="glass-card p-5 animate-slide-up">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold text-foreground">Opportunities</h3>
          <span className="text-[10px] uppercase tracking-wider font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">
            High traffic / Low CVR
          </span>
        </div>
        {opportunities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No significant opportunities detected.</p>
        ) : (
          <SortableTable rows={opportunities} defaultSort="sessions" />
        )}
      </div>
    </div>
  );
}
