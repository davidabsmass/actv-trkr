import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Layers, Timer, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EngagementMetrics {
  avgTimeOnPage: number;
  avgSessionDuration: number;
  pagesPerSession: number;
  scoreDistribution: { low: number; medium: number; high: number };
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function VisitorEngagement({ orgId, startDate, endDate }: { orgId: string | null; startDate: string; endDate: string }) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["visitor_engagement", orgId, startDate, endDate],
    queryFn: async (): Promise<EngagementMetrics | null> => {
      if (!orgId) return null;
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;
      const { data: pvData } = await supabase.from("pageviews").select("session_id, active_seconds, page_path").eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd).not("active_seconds", "is", null).limit(1000);
      if (!pvData || pvData.length === 0) return null;

      const totalTime = pvData.reduce((sum, pv) => sum + (pv.active_seconds || 0), 0);
      const avgTimeOnPage = totalTime / pvData.length;

      const sessionMap: Record<string, { totalTime: number; pages: number }> = {};
      pvData.forEach(pv => {
        if (!pv.session_id) return;
        if (!sessionMap[pv.session_id]) sessionMap[pv.session_id] = { totalTime: 0, pages: 0 };
        sessionMap[pv.session_id].totalTime += pv.active_seconds || 0;
        sessionMap[pv.session_id].pages++;
      });

      const sessionEntries = Object.values(sessionMap);
      const avgSessionDuration = sessionEntries.length > 0 ? sessionEntries.reduce((s, e) => s + e.totalTime, 0) / sessionEntries.length : 0;
      const pagesPerSession = sessionEntries.length > 0 ? sessionEntries.reduce((s, e) => s + e.pages, 0) / sessionEntries.length : 0;

      const { data: leadsWithScore } = await supabase.from("leads").select("engagement_score").eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd).not("engagement_score", "is", null);

      const dist = { low: 0, medium: 0, high: 0 };
      (leadsWithScore || []).forEach(l => {
        const s = l.engagement_score || 0;
        if (s >= 70) dist.high++; else if (s >= 40) dist.medium++; else dist.low++;
      });

      return { avgTimeOnPage, avgSessionDuration, pagesPerSession, scoreDistribution: dist };
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return (<div className="glass-card p-6 animate-pulse"><div className="h-4 bg-muted rounded w-1/3 mb-4" /><div className="h-20 bg-muted rounded" /></div>);
  }

  if (!data) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t("dashboard.visitorEngagement")}</h3>
        <p className="text-xs text-muted-foreground text-center py-6">{t("dashboard.engagementDataPending")}</p>
      </div>
    );
  }

  const metrics = [
    { label: t("dashboard.avgTimeOnPage"), value: formatDuration(data.avgTimeOnPage), icon: Clock },
    { label: t("dashboard.avgSessionDuration"), value: formatDuration(data.avgSessionDuration), icon: Timer },
    { label: t("dashboard.pagesPerSession"), value: data.pagesPerSession.toFixed(1), icon: Layers },
  ];

  const totalScored = data.scoreDistribution.low + data.scoreDistribution.medium + data.scoreDistribution.high;

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          {t("dashboard.visitorEngagement")}
        </h3>
        <IconTooltip label="How visitors interact with your site — avg. pages per session, time on site, and bounce rate.">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </IconTooltip>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {metrics.map((m) => (
          <div key={m.label} className="text-center">
            <m.icon className="h-4 w-4 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-lg font-bold font-mono-data text-foreground">{m.value}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.label}</p>
          </div>
        ))}
      </div>

      {totalScored > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">{t("dashboard.engagementScoreDist")}</p>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted">
            {data.scoreDistribution.high > 0 && <div className="bg-success" style={{ width: `${(data.scoreDistribution.high / totalScored) * 100}%` }} />}
            {data.scoreDistribution.medium > 0 && <div className="bg-warning" style={{ width: `${(data.scoreDistribution.medium / totalScored) * 100}%` }} />}
            {data.scoreDistribution.low > 0 && <div className="bg-muted-foreground/30" style={{ width: `${(data.scoreDistribution.low / totalScored) * 100}%` }} />}
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>{t("dashboard.low")} ({data.scoreDistribution.low})</span>
            <span>{t("dashboard.medium")} ({data.scoreDistribution.medium})</span>
            <span>{t("dashboard.high")} ({data.scoreDistribution.high})</span>
          </div>
        </div>
      )}
    </div>
  );
}
