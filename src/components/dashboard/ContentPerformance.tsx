import { ArrowUpRight, Clock } from "lucide-react";

interface ContentProps {
  pages: Array<{ path: string; sessions: number; leads: number; cvr: number; avgActiveSeconds?: number | null }>;
  opportunities: Array<{
    path: string;
    sessions: number;
    leads: number;
    expectedLeads: number;
    gap: number;
    cvr: number;
    avgActiveSeconds?: number | null;
  }>;
}

function formatTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function ContentPerformance({ pages, opportunities }: ContentProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {/* Top Pages */}
      <div className="glass-card p-5 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Top Pages</h3>
        <div className="overflow-auto max-h-[350px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Page</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Sessions</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Leads</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">CVR</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Avg Time</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, i) => (
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
          <div className="overflow-auto max-h-[350px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Page</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Sessions</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">Leads</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">CVR</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Avg Time</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...opportunities].sort((a, b) => b.sessions - a.sessions).map((opp, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                    <td className="py-2 px-2 font-medium text-foreground truncate max-w-[200px]" title={opp.path}>
                      {opp.path}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                      {opp.sessions.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                      {opp.leads.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-data text-foreground">
                      {(opp.cvr * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                      {formatTime(opp.avgActiveSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
