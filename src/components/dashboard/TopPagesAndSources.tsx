import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { BarChart3 } from "lucide-react";
import { subDays, format } from "date-fns";

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    allRows.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
  return allRows;
}

interface PageRow {
  path: string;
  views: number;
}

interface SourceRow {
  source: string;
  sessions: number;
}

export const TopPagesAndSources = React.forwardRef<HTMLDivElement>(function TopPagesAndSources(_props, ref) {
  const { orgId } = useOrg();

  const { data } = useQuery({
    queryKey: ["dashboard_top_pages_sources", orgId],
    queryFn: async () => {
      if (!orgId) return { pages: [], sources: [] };
      const start = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const startTs = `${start}T00:00:00Z`;

      // Fetch site domains for self-referral filtering
      const { data: sites } = await supabase
        .from("sites")
        .select("domain")
        .eq("org_id", orgId);
      const ownDomains = new Set(
        (sites || []).map((s: any) => (s.domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase())
      );

      // Paginated pageview fetch
      const pvRows = await fetchAllRows<{ page_path: string | null }>((from, to) =>
        supabase
          .from("pageviews")
          .select("page_path")
          .eq("org_id", orgId)
          .gte("occurred_at", startTs)
          .not("page_path", "is", null)
          .order("occurred_at", { ascending: true })
          .range(from, to)
      );

      const pageMap: Record<string, number> = {};
      for (const r of pvRows) {
        if (!r.page_path) continue;
        pageMap[r.page_path] = (pageMap[r.page_path] || 0) + 1;
      }
      const pages: PageRow[] = Object.entries(pageMap)
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);

      // Paginated session fetch
      const sessRows = await fetchAllRows<{ utm_source: string | null; landing_referrer_domain: string | null }>((from, to) =>
        supabase
          .from("sessions")
          .select("utm_source, landing_referrer_domain")
          .eq("org_id", orgId)
          .gte("started_at", startTs)
          .order("started_at", { ascending: true })
          .range(from, to)
      );

      const srcMap: Record<string, number> = {};
      for (const r of sessRows) {
        let src = r.utm_source || r.landing_referrer_domain || "Direct";
        // Reclassify self-referrals as Direct
        if (ownDomains.has(src.toLowerCase())) src = "Direct";
        srcMap[src] = (srcMap[src] || 0) + 1;
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
    <div ref={ref} className="glass-card p-5 animate-slide-up h-full">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        Top Pages & Sources
      </h3>

      {/* Top Pages */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Pages (7d)</p>
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
                    <span className="relative px-2 text-xs font-medium text-foreground truncate block leading-5">
                      {p.path}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono-data text-muted-foreground w-10 text-right shrink-0">
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
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Sources (7d)</p>
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
                    <span className="relative px-2 text-xs font-medium text-foreground truncate block leading-5">
                      {s.source}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono-data text-muted-foreground w-10 text-right shrink-0">
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
});
