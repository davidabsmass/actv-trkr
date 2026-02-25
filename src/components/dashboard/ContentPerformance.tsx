import { ArrowUpRight } from "lucide-react";

interface ContentProps {
  pages: Array<{ path: string; sessions: number; leads: number; cvr: number }>;
  opportunities: Array<{
    path: string;
    sessions: number;
    leads: number;
    expectedLeads: number;
    gap: number;
    cvr: number;
  }>;
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
          <div className="space-y-3">
            {opportunities.map((opp, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-warning/10 flex items-center justify-center">
                  <ArrowUpRight className="h-3.5 w-3.5 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate" title={opp.path}>
                    {opp.path}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-mono-data">{opp.sessions.toLocaleString()}</span> sessions
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-mono-data">{(opp.cvr * 100).toFixed(2)}%</span> CVR
                    </span>
                    <span className="text-[11px] text-warning font-medium">
                      +<span className="font-mono-data">{opp.gap}</span> potential leads
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
