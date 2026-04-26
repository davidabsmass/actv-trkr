import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Sparkles, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface NightlySummary { id: string; generated_at: string; summary_text: string; insights: string[]; suggested_actions: string[]; }

export function LatestSummary() {
  const { orgId } = useOrg();
  const { t } = useTranslation();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard_nightly_summary", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.from("nightly_summaries").select("id, generated_at, summary_text, insights, suggested_actions").eq("org_id", orgId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as unknown as NightlySummary | null;
    },
    enabled: !!orgId,
  });

  // When there's no summary, find out *why* so we can show an accurate message
  // (data is genuinely missing vs. data exists but the nightly job hasn't run yet for this org)
  const { data: dataStatus } = useQuery({
    queryKey: ["dashboard_summary_data_status", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const [orgRes, sessRes] = await Promise.all([
        supabase.from("orgs").select("created_at").eq("id", orgId).maybeSingle(),
        supabase.from("sessions").select("started_at", { count: "exact", head: false })
          .eq("org_id", orgId)
          .order("started_at", { ascending: true })
          .limit(1),
      ]);
      const firstSession = sessRes.data?.[0]?.started_at as string | undefined;
      const sessionCount = sessRes.count ?? 0;
      return {
        orgCreatedAt: orgRes.data?.created_at as string | undefined,
        firstSessionAt: firstSession,
        sessionCount,
      };
    },
    enabled: !!orgId && !summary && !isLoading,
  });

  if (isLoading) {
    return (<div className="glass-card p-6 animate-pulse"><div className="h-4 bg-muted rounded w-1/4 mb-4" /><div className="h-16 bg-muted rounded" /></div>);
  }

  if (!summary) {
    const hasData = (dataStatus?.sessionCount ?? 0) > 0;
    const firstSessionAt = dataStatus?.firstSessionAt ? new Date(dataStatus.firstSessionAt) : null;
    const hoursSinceFirst = firstSessionAt ? (Date.now() - firstSessionAt.getTime()) / 36e5 : 0;

    // Compute next nightly run (06:00 UTC daily)
    const now = new Date();
    const nextRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0));
    if (nextRun.getTime() <= now.getTime()) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    const nextRunLocal = nextRun.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

    let headline: string;
    let bullets: string[];
    if (hasData && hoursSinceFirst >= 6) {
      // We have data — the cron just hasn't produced a summary for this org yet.
      headline = `Your first nightly summary will be generated on the next scheduled run (${nextRunLocal}). Tracking is active${dataStatus ? ` — ${dataStatus.sessionCount} session${dataStatus.sessionCount === 1 ? "" : "s"} captured so far` : ""}.`;
      bullets = [
        "Summaries are generated once per day at 06:00 UTC.",
        "In the meantime, the widgets below show live numbers.",
        t("dashboard.visitReports"),
      ];
    } else if (hasData) {
      headline = `We've started receiving data (${dataStatus?.sessionCount} session${dataStatus?.sessionCount === 1 ? "" : "s"} so far). Your first nightly summary will be ready after ${nextRunLocal}.`;
      bullets = [
        "Summaries need a full activity window before they're generated.",
        t("dashboard.summariesRunNightly"),
        t("dashboard.visitReports"),
      ];
    } else {
      headline = t("dashboard.latestSummaryPreparing");
      bullets = [
        t("dashboard.ensureTracking"),
        t("dashboard.summariesRunNightly"),
        t("dashboard.visitReports"),
      ];
    }

    return (
      <div className="glass-card-elevated p-6 animate-slide-up">
        <div className="panel-heading">
          <span className="icon-chip"><Sparkles className="h-4 w-4" /></span>
          <h3>{t("dashboard.latestSummary")}</h3>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">{headline}</p>
        <ul className="space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const insights = (summary.insights as string[]) || [];

  return (
    <div className="glass-card-elevated p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip"><Sparkles className="h-4 w-4" /></span>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">{t("dashboard.latestSummary")}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{new Date(summary.generated_at).toLocaleDateString()}</span>
          <Link to="/reports" className="text-xs font-medium text-primary hover:underline ml-2">{t("dashboard.fullReport")} →</Link>
        </div>
      </div>
      {summary.summary_text && <p className="text-sm text-foreground/80 leading-relaxed mb-3">{summary.summary_text}</p>}
      {insights.length > 0 && (
        <ul className="space-y-1.5">
          {insights.slice(0, 3).map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
