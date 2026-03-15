import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { subDays, format } from "date-fns";
import {
  Search, RefreshCw, Shield, AlertCircle, AlertTriangle, Info, CheckCircle2,
  TrendingUp, TrendingDown, Eye, Sparkles, Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getScoreGrade, getScoreStatus } from "@/lib/seo-scoring";
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

interface BlendedInsight {
  page: string;
  type: "seo_strong_engagement_weak" | "engagement_strong_seo_weak" | "seo_good_conversion_weak";
  title: string;
  explanation: string;
  metrics: Record<string, number | string>;
}

export default function SeoTab() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: sites } = useQuery({
    queryKey: ["sites_for_seo", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("sites").select("id, domain").eq("org_id", orgId);
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: latestScan, isLoading: scanLoading } = useQuery({
    queryKey: ["seo_scan", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("seo_scans")
        .select("*")
        .eq("org_id", orgId)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  // Blended insights: cross-reference SEO with traffic/engagement
  const { data: blendedInsights } = useQuery({
    queryKey: ["seo_blended", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const now = new Date();
      const start = format(subDays(now, 7), "yyyy-MM-dd");

      // Get page-level traffic data
      const { data: pageKpis } = await supabase
        .from("kpi_daily")
        .select("dimension, value, metric")
        .eq("org_id", orgId)
        .in("metric", ["page_views", "page_leads", "page_avg_time"])
        .gte("date", start);

      const pageMap: Record<string, { views: number; leads: number; avgTime: number; count: number }> = {};
      for (const row of (pageKpis || [])) {
        if (!row.dimension) continue;
        if (!pageMap[row.dimension]) pageMap[row.dimension] = { views: 0, leads: 0, avgTime: 0, count: 0 };
        const v = Number(row.value || 0);
        if (row.metric === "page_views") pageMap[row.dimension].views += v;
        else if (row.metric === "page_leads") pageMap[row.dimension].leads += v;
        else if (row.metric === "page_avg_time") { pageMap[row.dimension].avgTime += v; pageMap[row.dimension].count += 1; }
      }

      // Get organic session data from referrer domains
      const { data: organicPages } = await supabase
        .from("pageviews")
        .select("page_path")
        .eq("org_id", orgId)
        .in("referrer_domain", ["google.com", "bing.com", "duckduckgo.com", "yahoo.com"])
        .gte("occurred_at", subDays(now, 7).toISOString())
        .limit(500);

      const organicPaths = new Set((organicPages || []).map(p => p.page_path).filter(Boolean));

      const insights: BlendedInsight[] = [];

      for (const [path, data] of Object.entries(pageMap)) {
        const avg = data.count > 0 ? data.avgTime / data.count : 0;
        const isOrganic = organicPaths.has(path);

        // Strong engagement, weak visibility (high time, low views, no organic)
        if (avg > 90 && data.views < 30 && !isOrganic) {
          insights.push({
            page: path,
            type: "engagement_strong_seo_weak",
            title: "Strong engagement, limited search visibility",
            explanation: `This page shows strong engagement (${Math.round(avg)}s avg time) but has limited traffic and no organic search presence.`,
            metrics: { avgTime: `${Math.round(avg)}s`, views: data.views },
          });
        }

        // Good organic traffic, weak conversion
        if (isOrganic && data.views >= 50 && data.leads === 0) {
          insights.push({
            page: path,
            type: "seo_good_conversion_weak",
            title: "Search traffic but no conversions",
            explanation: `This page receives organic search traffic (${data.views} views) but has not generated any leads.`,
            metrics: { views: data.views, leads: 0 },
          });
        }

        // Good traffic + engagement, but not ranking organically
        if (data.views >= 100 && avg > 60 && !isOrganic) {
          insights.push({
            page: path,
            type: "seo_strong_engagement_weak",
            title: "Popular page with weak search visibility",
            explanation: `This page gets ${data.views} views with good engagement but doesn't appear to rank in search results.`,
            metrics: { views: data.views, avgTime: `${Math.round(avg)}s` },
          });
        }
      }

      return insights.slice(0, 5);
    },
    enabled: !!orgId && !!latestScan,
  });

  const runScan = useMutation({
    mutationFn: async () => {
      if (!sites?.length || !orgId) throw new Error("No sites configured");
      const site = sites[0];
      const url = `https://${site.domain}`;
      const { data, error } = await supabase.functions.invoke("scan-site-seo", {
        body: { url, site_id: site.id, org_id: orgId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seo_scan", orgId] });
      queryClient.invalidateQueries({ queryKey: ["seo_blended", orgId] });
      toast.success("SEO scan completed");
    },
    onError: (err: any) => toast.error(err.message || "Scan failed"),
  });

  const issues = (latestScan?.issues_json as unknown as SeoIssue[] | null) || [];
  const score = latestScan?.score || 0;
  const grade = getScoreGrade(score);
  const status = getScoreStatus(score);

  const statusColors = {
    excellent: "text-success",
    good: "text-primary",
    "needs-work": "text-warning",
    poor: "text-destructive",
  };

  const groupedIssues = {
    Critical: issues.filter(i => i.impact === "Critical"),
    High: issues.filter(i => i.impact === "High"),
    Medium: issues.filter(i => i.impact === "Medium"),
    Low: issues.filter(i => i.impact === "Low"),
  };

  const blendedTypeIcons: Record<string, React.ReactNode> = {
    engagement_strong_seo_weak: <Eye className="h-4 w-4 text-primary" />,
    seo_good_conversion_weak: <TrendingDown className="h-4 w-4 text-warning" />,
    seo_strong_engagement_weak: <Zap className="h-4 w-4 text-accent-foreground" />,
  };

  return (
    <div className="space-y-6">
      {/* Scan controls */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">SEO Scanner</h3>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-primary border-primary/30">Beta</Badge>
          </div>
          <Button
            size="sm"
            onClick={() => runScan.mutate()}
            disabled={runScan.isPending || !sites?.length}
            className="gap-1.5"
          >
            {runScan.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {runScan.isPending ? "Scanning…" : "Scan Now"}
          </Button>
        </div>
        {sites && sites.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Scanning: {sites[0].domain}
            {latestScan && ` · Last scan: ${new Date(latestScan.scanned_at).toLocaleDateString()}`}
          </p>
        )}
        {(!sites || sites.length === 0) && (
          <p className="text-xs text-muted-foreground mt-2">Add a site in Settings to enable SEO scanning.</p>
        )}
      </div>

      {/* Score card */}
      {latestScan && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <div className={`text-5xl font-bold ${statusColors[status]}`}>{score}</div>
              <div className="text-xs text-muted-foreground mt-1">SEO Score</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-lg font-bold ${statusColors[status]}`}>Grade: {grade}</span>
                {latestScan.platform && (
                  <Badge variant="outline" className="text-[10px] uppercase">{latestScan.platform}</Badge>
                )}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {(["Critical", "High", "Medium", "Low"] as const).map((impact) => (
                  <div key={impact} className="text-center">
                    <div className="text-lg font-bold text-foreground">{groupedIssues[impact].length}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">{impact}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blended SEO + Engagement Insights */}
      {blendedInsights && blendedInsights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> SEO + Engagement Insights
          </h3>
          <div className="space-y-2">
            {blendedInsights.map((insight, i) => (
              <div key={i} className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  {blendedTypeIcons[insight.type]}
                  <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed mb-1">{insight.explanation}</p>
                <p className="text-[10px] text-muted-foreground">
                  Page: <span className="font-medium text-foreground">{insight.page}</span>
                  {Object.entries(insight.metrics).map(([k, v]) => (
                    <span key={k}> · {k}: <span className="font-medium text-foreground">{v}</span></span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues */}
      {latestScan && issues.length > 0 && (
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
                  {group.map((issue) => (
                    <div
                      key={issue.id}
                      className={`rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/30 ${impactColors[impact]}`}
                      onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-medium text-foreground">{issue.title}</h5>
                          {issue.category && (
                            <Badge variant="outline" className="text-[9px] uppercase">{issue.category}</Badge>
                          )}
                        </div>
                        <Shield className={`h-3.5 w-3.5 transition-transform ${expanded === issue.id ? "rotate-180" : ""}`} />
                      </div>
                      {expanded === issue.id && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{issue.fix}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!latestScan && !scanLoading && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">SEO insights will appear once you run your first scan.</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Scan Now" above to get started.</p>
        </div>
      )}
    </div>
  );
}
