import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { BarChart3, Globe } from "lucide-react";
import { subDays, format } from "date-fns";

interface PageRow {
  path: string;
  views: number;
}

interface SourceRow {
  source: string;
  sessions: number;
}

export function TopPagesAndSources() {
  const { orgId } = useOrg();

  const { data } = useQuery({
    queryKey: ["dashboard_top_pages_sources", orgId],
    queryFn: async () => {
      if (!orgId) return { pages: [], sources: [] };
      const start = format(subDays(new Date(), 7), "yyyy-MM-dd");

      const [pagesRes, sourcesRes] = await Promise.all([
        supabase
          .from("kpi_daily")
          .select("dimension, value")
          .eq("org_id", orgId)
          .eq("metric", "page_views")
          .gte("date", start)
          .not("dimension", "is", null),
        supabase
          .from("kpi_daily")
          .select("dimension, value")
          .eq("org_id", orgId)
          .eq("metric", "source_sessions")
          .gte("date", start)
          .not("dimension", "is", null),
      ]);

      // Aggregate pages
      const pageMap: Record<string, number> = {};
      for (const r of pagesRes.data || []) {
        if (!r.dimension) continue;
        pageMap[r.dimension] = (pageMap[r.dimension] || 0) + Number(r.value || 0);
      }
      const pages: PageRow[] = Object.entries(pageMap)
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);

      // Aggregate sources
      const srcMap: Record<string, number> = {};
      for (const r of sourcesRes.data || []) {
        if (!r.dimension) continue;
        srcMap[r.dimension] = (srcMap[r.dimension] || 0) + Number(r.value || 0);
      }
      const sources: SourceRow[] = Object.entries(srcMap)
        .map(([source, sessions]) => ({ source, sessions }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 5);

      return { pages, sources };
    },
    enabled: !!orgId,
  });

  const pages = data?.pages || [];
  const sources = data?.sources || [];
  const maxViews = pages[0]?.views || 1;
  const maxSessions = sources[0]?.sessions || 1;

  return (
    <div className="glass-card p-5 animate-slide-up h-full">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        Top Pages & Sources
      </h3>

      {/* Top Pages */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Pages (7d)</p>
        {pages.length > 0 ? (
          <div className="space-y-1.5">
            {pages.map((p) => (
              <div key={p.path} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="relative h-5 rounded bg-muted/30 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/15 rounded"
                      style={{ width: `${(p.views / maxViews) * 100}%` }}
                    />
                    <span className="relative px-2 text-[11px] font-medium text-foreground truncate block leading-5">
                      {p.path}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-mono-data text-muted-foreground w-10 text-right shrink-0">
                  {p.views}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No page data yet.</p>
        )}
      </div>

      {/* Top Sources */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Sources (7d)</p>
        {sources.length > 0 ? (
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.source} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="relative h-5 rounded bg-muted/30 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-accent/30 rounded"
                      style={{ width: `${(s.sessions / maxSessions) * 100}%` }}
                    />
                    <span className="relative px-2 text-[11px] font-medium text-foreground truncate block leading-5">
                      {s.source}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-mono-data text-muted-foreground w-10 text-right shrink-0">
                  {s.sessions}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No source data yet.</p>
        )}
      </div>
    </div>
  );
}
