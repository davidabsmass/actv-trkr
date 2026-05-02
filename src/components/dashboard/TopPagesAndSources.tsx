import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { BarChart3 } from "lucide-react";
import { subDays, format } from "date-fns";
import { useTranslation } from "react-i18next";
import { expandSiteDomains, isSelfReferral, canonicalSource } from "@/lib/source-normalize";

interface PageRow { path: string; views: number }
interface SourceRow { source: string; sessions: number }

interface TopPagesAndSourcesProps {
  startDate?: string;
  endDate?: string;
}

export const TopPagesAndSources = React.forwardRef<HTMLDivElement, TopPagesAndSourcesProps>(
  function TopPagesAndSources({ startDate: propStart, endDate: propEnd }, ref) {
    const { orgId } = useOrg();
    const { t } = useTranslation();
    const directLabel = t("dashboard.direct");

    const fallbackStart = format(subDays(new Date(), 7), "yyyy-MM-dd");
    const resolvedStart = propStart || fallbackStart;
    const resolvedEnd = propEnd || format(new Date(), "yyyy-MM-dd");

    const { data, isLoading } = useQuery({
      queryKey: ["dashboard_top_pages_sources", orgId, resolvedStart, resolvedEnd],
      queryFn: async () => {
        if (!orgId) return { pages: [], sources: [] };
        const startTs = `${resolvedStart}T00:00:00Z`;
        const endTs = `${resolvedEnd}T23:59:59.999Z`;

        // Try kpi_daily first for pages (dimension = page_path, metric = pageviews)
        const [kpiPagesRes, kpiSourcesRes, sitesRes] = await Promise.all([
          supabase
            .from("kpi_daily")
            .select("dimension, value")
            .eq("org_id", orgId)
            .eq("metric", "pageviews")
            .not("dimension", "is", null)
            .gte("date", resolvedStart)
            .lte("date", resolvedEnd)
            .limit(1000),
          supabase
            .from("kpi_daily")
            .select("dimension, value")
            .eq("org_id", orgId)
            .eq("metric", "sessions")
            .not("dimension", "is", null)
            .gte("date", resolvedStart)
            .lte("date", resolvedEnd)
            .limit(1000),
          supabase
            .from("sites")
            .select("domain")
            .eq("org_id", orgId),
        ]);

        const ownedRoots = expandSiteDomains(
          (sitesRes.data || []).map((s: any) => s.domain)
        );

        const collapseSource = (raw: string) =>
          !raw || raw === directLabel
            ? directLabel
            : isSelfReferral(raw, ownedRoots)
              ? directLabel
              : canonicalSource(raw);

        // Aggregate kpi_daily page dimensions
        let pages: PageRow[] = [];
        if (kpiPagesRes.data && kpiPagesRes.data.length > 0) {
          const pageMap: Record<string, number> = {};
          for (const r of kpiPagesRes.data) {
            if (!r.dimension) continue;
            pageMap[r.dimension] = (pageMap[r.dimension] || 0) + Number(r.value);
          }
          pages = Object.entries(pageMap)
            .map(([path, views]) => ({ path, views }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 5);
        }

        // Aggregate kpi_daily source dimensions
        let sources: SourceRow[] = [];
        if (kpiSourcesRes.data && kpiSourcesRes.data.length > 0) {
          const srcMap: Record<string, number> = {};
          for (const r of kpiSourcesRes.data) {
            if (!r.dimension) continue;
            let src = r.dimension;
            if (ownDomains.has(src.toLowerCase())) src = directLabel;
            srcMap[src] = (srcMap[src] || 0) + Number(r.value);
          }
          sources = Object.entries(srcMap)
            .map(([source, sessions]) => ({ source, sessions }))
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, 5);
        }

        // Fallback: if kpi_daily had no page data, do a lightweight raw query (limited, no pagination)
        if (pages.length === 0) {
          const { data: pvRows } = await supabase
            .from("pageviews")
            .select("page_path")
            .eq("org_id", orgId)
            .gte("occurred_at", startTs)
            .lte("occurred_at", endTs)
            .not("page_path", "is", null)
            .limit(1000);

          const pageMap: Record<string, number> = {};
          for (const r of pvRows || []) {
            if (!r.page_path) continue;
            pageMap[r.page_path] = (pageMap[r.page_path] || 0) + 1;
          }
          pages = Object.entries(pageMap)
            .map(([path, views]) => ({ path, views }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 5);
        }

        // Fallback: if kpi_daily had no source data, do a lightweight raw query
        if (sources.length === 0) {
          const { data: sessRows } = await supabase
            .from("sessions")
            .select("utm_source, landing_referrer_domain")
            .eq("org_id", orgId)
            .gte("started_at", startTs)
            .lte("started_at", endTs)
            .limit(1000);

          const srcMap: Record<string, number> = {};
          for (const r of sessRows || []) {
            let src = r.utm_source || r.landing_referrer_domain || directLabel;
            if (ownDomains.has(src.toLowerCase())) src = directLabel;
            srcMap[src] = (srcMap[src] || 0) + 1;
          }
          sources = Object.entries(srcMap)
            .map(([source, sessions]) => ({ source, sessions }))
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, 5);
        }

        return { pages, sources };
      },
      enabled: !!orgId,
      staleTime: 2 * 60 * 1000,
    });

    const pages = data?.pages || [];
    const sources = data?.sources || [];
    const maxViews = pages[0]?.views || 1;
    const maxSessions = sources[0]?.sessions || 1;

    const rangeLabel = (() => {
      const s = new Date(resolvedStart);
      const e = new Date(resolvedEnd);
      const diffDays = Math.round((e.getTime() - s.getTime()) / 86400000);
      if (diffDays <= 7) return "7d";
      if (diffDays <= 14) return "14d";
      if (diffDays <= 30) return "30d";
      if (diffDays <= 90) return "90d";
      return `${format(s, "MMM d")}–${format(e, "MMM d")}`;
    })();

    return (
      <div ref={ref} className="glass-card-elevated p-5 animate-slide-up h-full">
        <div className="panel-heading">
          <span className="icon-chip"><BarChart3 className="h-4 w-4" /></span>
          <h3>{t("dashboard.topPagesAndSources")}</h3>
        </div>

        {/* Top Pages */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {t("dashboard.pages")} ({rangeLabel})
          </p>
          {isLoading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 rounded bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : pages.length > 0 ? (
            <div className="space-y-2">
              {pages.map((p) => (
                <div key={p.path}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0 pr-2">{p.path}</span>
                    <span className="text-xs font-mono-data font-semibold text-foreground shrink-0">{p.views.toLocaleString()}</span>
                  </div>
                  <div className="meter-track">
                    <div
                      className="meter-fill"
                      style={{ width: `${(p.views / maxViews) * 100}%`, background: "var(--gradient-primary)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("dashboard.noPageData")}</p>
          )}
        </div>

        {/* Top Sources */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {t("dashboard.sources")} ({rangeLabel})
          </p>
          {isLoading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 rounded bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : sources.length > 0 ? (
            <div className="space-y-2">
              {sources.map((s) => (
                <div key={s.source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0 pr-2">{s.source}</span>
                    <span className="text-xs font-mono-data font-semibold text-foreground shrink-0">{s.sessions.toLocaleString()}</span>
                  </div>
                  <div className="meter-track">
                    <div
                      className="meter-fill"
                      style={{ width: `${(s.sessions / maxSessions) * 100}%`, background: "var(--gradient-info)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("dashboard.noSourceData")}</p>
          )}
        </div>
      </div>
    );
  }
);
