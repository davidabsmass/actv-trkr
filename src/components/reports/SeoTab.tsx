import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { subDays, format } from "date-fns";
import {
  Search, RefreshCw, Shield, AlertCircle, AlertTriangle, Info, CheckCircle2,
  TrendingUp, TrendingDown, Eye, Sparkles, Zap, Clock, Globe,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getScoreGrade, getScoreStatus, calculateScore, calculateSeverityMultiplier } from "@/lib/seo-scoring";
import type { SeoIssue } from "@/lib/seo-scoring";
import SeoScanHistory from "./SeoScanHistory";
import SeoScoreCard from "./SeoScoreCard";
import SeoIssuesList from "./SeoIssuesList";
import type { FixQueueItem } from "./SeoIssuesList";
import SeoBlendedInsights from "./SeoBlendedInsights";
import SeoFixModal from "./SeoFixModal";

export default function SeoTab() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [scanUrl, setScanUrl] = useState("");
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

  // Initialize scanUrl with homepage when sites load
  const defaultUrl = siteDomain ? `https://${siteDomain}` : "";
  const effectiveUrl = scanUrl || defaultUrl;

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
      if (!sites?.length || !orgId) throw new Error("No sites configured");
      const urlToScan = effectiveUrl.trim().replace(/\/+$/, "");
      if (!validateUrl(urlToScan)) throw new Error(`URL must belong to ${siteDomain}`);
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
      toast.success("SEO scan completed");
    },
    onError: (err: any) => toast.error(err.message || "Scan failed"),
  });

  const issues = (activeScan?.issues_json as unknown as SeoIssue[] | null) || [];
  const score = activeScan?.score || 0;

  // Fix queue for active scan's page
  const { data: fixQueue } = useQuery({
    queryKey: ["seo_fix_queue", orgId, activeScan?.url],
    queryFn: async () => {
      if (!orgId || !activeScan?.url) return [];
      const { data } = await supabase
        .from("seo_fix_queue")
        .select("id, issue_id, status")
        .eq("org_id", orgId)
        .eq("page_url", activeScan.url)
        .order("created_at", { ascending: false });
      return (data || []) as FixQueueItem[];
    },
    enabled: !!orgId && !!activeScan?.url,
  });

  // Load persisted marked-fixed issues from DB
  const { data: fixHistoryData } = useQuery({
    queryKey: ["seo_fix_history", orgId, activeScan?.url],
    queryFn: async () => {
      if (!orgId || !activeScan?.url) return [];
      const { data } = await supabase
        .from("seo_fix_history")
        .select("issue_id")
        .eq("org_id", orgId)
        .eq("page_url", activeScan.url);
      return (data || []).map(r => r.issue_id);
    },
    enabled: !!orgId && !!activeScan?.url,
  });

  const [localMarkedFixed, setLocalMarkedFixed] = useState<Set<string>>(new Set());
  const markedFixed = useMemo(() => {
    const set = new Set(fixHistoryData || []);
    localMarkedFixed.forEach(id => set.add(id));
    return set;
  }, [fixHistoryData, localMarkedFixed]);

  // Filter out marked-fixed issues from display
  const visibleIssues = useMemo(() => issues.filter(i => !markedFixed.has(i.id)), [issues, markedFixed]);

  const handleMarkFixed = async (issueId: string) => {
    if (!orgId || !activeScan) return;
    const site = sites?.[0];
    if (!site) return;
    await supabase.from("seo_fix_history").insert({
      org_id: orgId,
      site_id: site.id,
      issue_id: issueId,
      page_url: activeScan.url,
      before_score: score,
    });
    setLocalMarkedFixed(prev => new Set(prev).add(issueId));
    queryClient.invalidateQueries({ queryKey: ["seo_fix_history", orgId, activeScan.url] });
    toast.success("Issue marked as fixed — it won't appear on future scans for this page");
  };

  const [fixModal, setFixModal] = useState<{ issueId: string; fixType: string; title: string } | null>(null);

  const queueFix = useMutation({
    mutationFn: async ({ issueId, fixType, fixValue }: { issueId: string; fixType: string; fixValue: string }) => {
      if (!orgId || !sites?.length || !activeScan) throw new Error("Missing context");
      const { data, error } = await supabase.functions.invoke("seo-fix-command", {
        body: {
          org_id: orgId,
          site_id: sites[0].id,
          page_url: activeScan.url,
          issue_id: issueId,
          fix_type: fixType,
          fix_value: fixValue,
          scan_id: activeScan.id,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seo_fix_queue", orgId] });
      setFixModal(null);
      toast.success("Fix queued — your site plugin will apply it shortly");
    },
    onError: (err: any) => toast.error(err.message || "Failed to queue fix"),
  });

  const handleFixClick = (issueId: string, fixType: string) => {
    const issue = issues.find(i => i.id === issueId);
    setFixModal({ issueId, fixType, title: issue?.title || issueId });
  };

  const handleVerify = () => {
    if (activeScan?.url) {
      setScanUrl(activeScan.url);
      runScan.mutate();
    }
  };

  const getPathFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");
    } catch {
      return url;
    }
  };

  return (
    <div className="space-y-6">
      {/* Scan controls */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">SEO Scanner</h3>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-primary border-primary/30">Beta</Badge>
          </div>
        </div>

        {sites && sites.length > 0 ? (
          <div className="flex gap-2">
            <Input
              value={effectiveUrl}
              onChange={(e) => setScanUrl(e.target.value)}
              placeholder={`https://${siteDomain}/page`}
              className="flex-1 text-sm bg-background"
            />
            <Button
              size="sm"
              onClick={() => runScan.mutate()}
              disabled={runScan.isPending || !effectiveUrl.trim()}
              className="gap-1.5 shrink-0"
            >
              {runScan.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {runScan.isPending ? "Scanning…" : "Scan Now"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Add a site in Settings to enable SEO scanning.</p>
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
      {activeScan && visibleIssues.length > 0 && (
        <SeoIssuesList
          issues={visibleIssues}
          fixQueue={fixQueue || []}
          markedFixed={markedFixed}
          onFixClick={handleFixClick}
          onMarkFixed={handleMarkFixed}
          onVerify={handleVerify}
        />
      )}

      {/* Fix Modal */}
      {fixModal && (
        <SeoFixModal
          open={!!fixModal}
          onOpenChange={(open) => !open && setFixModal(null)}
          issueId={fixModal.issueId}
          issueTitle={fixModal.title}
          fixType={fixModal.fixType}
          suggestedValue=""
          pageUrl={activeScan?.url || ""}
          onConfirm={(value) => queueFix.mutate({ issueId: fixModal.issueId, fixType: fixModal.fixType, fixValue: value })}
          isPending={queueFix.isPending}
        />
      )}

      {/* Empty state */}
      {(!scanHistory || scanHistory.length === 0) && !historyLoading && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">SEO insights will appear once you run your first scan.</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Scan Now" above to get started.</p>
        </div>
      )}

      {/* Scan History */}
      {scanHistory && scanHistory.length > 0 && (
        <SeoScanHistory
          scans={scanHistory}
          activeScanId={activeScanId}
          onSelect={setSelectedScanId}
          getPathFromUrl={getPathFromUrl}
        />
      )}
    </div>
  );
}
