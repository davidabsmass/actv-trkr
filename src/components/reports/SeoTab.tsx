import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { subDays, format } from "date-fns";
import { Search, RefreshCw, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

import type { SeoIssue } from "@/lib/seo-scoring";
import { getScoreGrade } from "@/lib/seo-scoring";
import SeoScoreCard from "./SeoScoreCard";
import SeoIssuesList from "./SeoIssuesList";
import SeoBlendedInsights from "./SeoBlendedInsights";
import SeoFixModal from "./SeoFixModal";

export default function SeoTab() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);

  const { data: sites } = useQuery({
    queryKey: ["sites_for_seo", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("sites").select("id, domain").eq("org_id", orgId);
      return data || [];
    },
    enabled: !!orgId,
  });

  const siteDomain = sites?.[0]?.domain || "";

  const homepageUrl = siteDomain ? `https://${siteDomain}` : "";

  // Fetch scan history (last 20 scans)
  const { data: scanHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["seo_scan_history", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("seo_scans")
        .select("id, url, score, scanned_at, platform")
        .eq("org_id", orgId)
        .order("scanned_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!orgId,
  });

  // Selected scan (default to most recent)
  const activeScanId = selectedScanId || scanHistory?.[0]?.id || null;

  const { data: activeScan, isLoading: scanLoading } = useQuery({
    queryKey: ["seo_scan_detail", activeScanId],
    queryFn: async () => {
      if (!activeScanId) return null;
      const { data } = await supabase
        .from("seo_scans")
        .select("*")
        .eq("id", activeScanId)
        .maybeSingle();
      return data;
    },
    enabled: !!activeScanId,
  });

  // Blended insights
  const { data: blendedInsights } = useQuery({
    queryKey: ["seo_blended", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const now = new Date();
      const start = format(subDays(now, 7), "yyyy-MM-dd");

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

      const { data: organicPages } = await supabase
        .from("pageviews")
        .select("page_path")
        .eq("org_id", orgId)
        .in("referrer_domain", ["google.com", "bing.com", "duckduckgo.com", "yahoo.com"])
        .gte("occurred_at", subDays(now, 7).toISOString())
        .limit(500);

      const organicPaths = new Set((organicPages || []).map(p => p.page_path).filter(Boolean));

      const insights: Array<{
        page: string;
        type: "seo_strong_engagement_weak" | "engagement_strong_seo_weak" | "seo_good_conversion_weak";
        title: string;
        explanation: string;
        metrics: Record<string, number | string>;
      }> = [];

      for (const [path, data] of Object.entries(pageMap)) {
        const avg = data.count > 0 ? data.avgTime / data.count : 0;
        const isOrganic = organicPaths.has(path);

        if (avg > 90 && data.views < 30 && !isOrganic) {
          insights.push({
            page: path,
            type: "engagement_strong_seo_weak",
            title: "Strong engagement, limited search visibility",
            explanation: `This page shows strong engagement (${Math.round(avg)}s avg time) but has limited traffic and no organic search presence.`,
            metrics: { avgTime: `${Math.round(avg)}s`, views: data.views },
          });
        }

        if (isOrganic && data.views >= 50 && data.leads === 0) {
          insights.push({
            page: path,
            type: "seo_good_conversion_weak",
            title: "Search traffic but no conversions",
            explanation: `This page receives organic search traffic (${data.views} views) but has not generated any leads.`,
            metrics: { views: data.views, leads: 0 },
          });
        }

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
    enabled: !!orgId && (scanHistory?.length ?? 0) > 0,
  });

  const validateUrl = (url: string): boolean => {
    if (!siteDomain) return false;
    try {
      const parsed = new URL(url);
      const normalizedInput = parsed.hostname.replace(/^www\./, "");
      const normalizedDomain = siteDomain.replace(/^www\./, "");
      return normalizedInput === normalizedDomain;
    } catch {
      return false;
    }
  };

  const runScan = useMutation({
    mutationFn: async () => {
      if (!sites?.length || !orgId) throw new Error(t("seo.noSitesConfigured", { defaultValue: "No sites configured" }));
      const urlToScan = homepageUrl.trim().replace(/\/+$/, "");
      if (!validateUrl(urlToScan)) {
        throw new Error(t("seo.urlMustBelong", { domain: siteDomain, defaultValue: `URL must belong to ${siteDomain}` }));
      }
      const site = sites[0];
      const { data, error } = await supabase.functions.invoke("scan-site-seo", {
        body: { url: urlToScan, site_id: site.id, org_id: orgId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seo_scan_history", orgId] });
      queryClient.invalidateQueries({ queryKey: ["seo_blended", orgId] });
      setSelectedScanId(null); // will auto-select latest
      toast.success(t("dashboard.seoScanCompleted"));
    },
    onError: (err: any) => toast.error(err.message || t("monitoring.scanFailed")),
  });

  const issues = (activeScan?.issues_json as unknown as SeoIssue[] | null) || [];
  const score = activeScan?.score || 0;

  const [fixModal, setFixModal] = useState<{ fixType: string; title: string } | null>(null);

  const handleFixClick = (issueId: string, fixType: string) => {
    const issue = issues.find(i => i.id === issueId);
    setFixModal({ fixType, title: issue?.title || issueId });
  };

  const getPathFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");
    } catch {
      return url;
    }
  };

  const exportSeoFindings = () => {
    if (!activeScan || issues.length === 0) return;
    const grade = getScoreGrade(score);
    const rows: string[][] = [
      ["SEO Scan Export"],
      ["URL", activeScan.url],
      ["Score", `${score}/100 (Grade: ${grade})`],
      ["Platform", activeScan.platform || "Unknown"],
      ["Scanned", new Date(activeScan.scanned_at).toLocaleDateString()],
      [],
      ["Priority", "Category", "Issue", "Recommendation"],
    ];
    for (const issue of issues) {
      rows.push([
        issue.impact,
        issue.category || "",
        issue.title,
        (issue.fix || "").replace(/\n/g, " "),
      ]);
    }
    if (blendedInsights && blendedInsights.length > 0) {
      rows.push([], ["SEO + Engagement Insights"], ["Page", "Insight", "Details"]);
      for (const insight of blendedInsights) {
        rows.push([insight.page, insight.title, insight.explanation]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seo-report-${siteDomain || "scan"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(t("seo.exportSuccess", { defaultValue: "SEO report exported" }));
  };

  return (
    <div className="space-y-6">
      {/* Scan controls */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{t("dashboard.seoScanner", { defaultValue: "SEO Scanner" })}</h3>
            <Badge variant="outline" className="text-xs uppercase tracking-wider text-primary border-primary/30">{t("sidebar.beta")}</Badge>
          </div>
        </div>

        {sites && sites.length > 0 ? (
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground flex-1">
              {t("dashboard.scanning")}: <span className="font-medium text-foreground">{homepageUrl || siteDomain}</span>
            </p>
            <div className="flex items-center gap-2">
              {activeScan && issues.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportSeoFindings}
                  className="gap-1.5 shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("seo.export", { defaultValue: "Export" })}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => runScan.mutate()}
                disabled={runScan.isPending || !homepageUrl}
                className="gap-1.5 shrink-0"
              >
                {runScan.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                {runScan.isPending ? t("dashboard.scanningDots") : t("dashboard.newScan", { defaultValue: "New Scan" })}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("dashboard.addSiteForSeo", { defaultValue: "Add a site in Settings to enable SEO scanning." })}</p>
        )}
      </div>

      {/* Score card */}
      {activeScan && (
        <SeoScoreCard
          score={score}
          issues={issues}
          platform={activeScan.platform}
          url={activeScan.url}
          scannedAt={activeScan.scanned_at}
          getPathFromUrl={getPathFromUrl}
        />
      )}

      {/* Blended SEO + Engagement Insights */}
      {blendedInsights && blendedInsights.length > 0 && (
        <SeoBlendedInsights insights={blendedInsights} />
      )}

      {/* Issues */}
      {activeScan && issues.length > 0 && (
        <SeoIssuesList
          issues={issues}
          onFixClick={handleFixClick}
        />
      )}

      {/* Fix Modal */}
      {fixModal && (
        <SeoFixModal
          open={!!fixModal}
          onOpenChange={(open) => !open && setFixModal(null)}
          issueTitle={fixModal.title}
          fixType={fixModal.fixType}
          pageUrl={activeScan?.url || ""}
        />
      )}

      {/* Empty state */}
      {(!scanHistory || scanHistory.length === 0) && !historyLoading && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t("dashboard.seoInsightsEmpty")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("dashboard.scanNowHint")}</p>
        </div>
      )}

    </div>
  );
}
