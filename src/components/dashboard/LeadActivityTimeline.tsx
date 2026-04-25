import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Eye, MousePointerClick, Download, Phone, Mail, ExternalLink,
  FileText, Clock, Zap,
} from "lucide-react";

interface TimelineItem {
  time: string;
  type: string;
  label: string;
  detail?: string;
  icon: React.ReactNode;
}

const eventIcons: Record<string, React.ReactNode> = {
  cta_click: <MousePointerClick className="h-3.5 w-3.5 text-primary" />,
  download_click: <Download className="h-3.5 w-3.5 text-info" />,
  outbound_click: <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />,
  tel_click: <Phone className="h-3.5 w-3.5 text-success" />,
  mailto_click: <Mail className="h-3.5 w-3.5 text-warning" />,
  form_start: <FileText className="h-3.5 w-3.5 text-primary" />,
  pageview: <Eye className="h-3.5 w-3.5 text-muted-foreground" />,
  form_submit: <Zap className="h-3.5 w-3.5 text-success" />,
};

function getEventLabels(t: (key: string) => string): Record<string, string> {
  return {
    cta_click: t("timeline.clickedCta"),
    download_click: t("timeline.downloadedFile"),
    outbound_click: t("timeline.visitedExternal"),
    tel_click: t("timeline.clickedPhone"),
    mailto_click: t("timeline.clickedEmail"),
    form_start: t("timeline.startedForm"),
    pageview: t("timeline.visitedPage"),
    form_submit: t("timeline.submittedForm"),
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function LeadActivityTimeline({ sessionId, orgId }: { sessionId: string | null; orgId: string | null }) {
  const { t } = useTranslation();
  const eventLabels = getEventLabels(t);
  const { data: timeline, isLoading } = useQuery({
    queryKey: ["lead_activity_timeline", sessionId, orgId],
    queryFn: async () => {
      if (!sessionId || !orgId) return [];

      const [pageviewsRes, eventsRes] = await Promise.all([
        supabase.from("pageviews")
          .select("occurred_at, page_path, page_url, title, active_seconds")
          .eq("org_id", orgId).eq("session_id", sessionId)
          .order("occurred_at", { ascending: true }),
        supabase.from("events")
          .select("occurred_at, event_type, target_text, page_path, page_url, meta")
          .eq("org_id", orgId).eq("session_id", sessionId)
          // Hide internal diagnostic events from the visible timeline
          .not("event_type", "in", "(session_gap_detected,session_resume,session_heartbeat,tracker_error,tracker_init)")
          .order("occurred_at", { ascending: true }),
      ]);

      const items: TimelineItem[] = [];

      (pageviewsRes.data || []).forEach((pv) => {
        const detail = pv.active_seconds ? t("timeline.timeOnPage", { duration: formatDuration(pv.active_seconds) }) : undefined;
        items.push({
          time: pv.occurred_at,
          type: "pageview",
          label: pv.title || pv.page_path || "Page",
          detail,
          icon: eventIcons.pageview,
        });
      });

      (eventsRes.data || []).forEach((evt) => {
        items.push({
          time: evt.occurred_at,
          type: evt.event_type,
          label: eventLabels[evt.event_type] || evt.event_type,
          detail: evt.target_text || evt.page_path || undefined,
          icon: eventIcons[evt.event_type] || eventIcons.cta_click,
        });
      });

      items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      return items;
    },
    enabled: !!sessionId && !!orgId,
  });

  // Engagement score query
  const { data: engagementScore } = useQuery({
    queryKey: ["engagement_score", sessionId, orgId],
    queryFn: async () => {
      if (!sessionId || !orgId) return null;
      const { data, error } = await supabase.rpc("calculate_engagement_score", {
        p_session_id: sessionId,
        p_org_id: orgId,
      });
      if (error) { console.error("Score error:", error); return null; }
      return data as number;
    },
    enabled: !!sessionId && !!orgId,
  });

  if (!sessionId) {
    return (
      <div className="p-4 text-center text-muted-foreground text-xs">
        {t("timeline.noSessionData")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-2 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Engagement Score */}
      {engagementScore !== null && engagementScore !== undefined && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
          <div className="relative w-12 h-12">
            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke={engagementScore >= 70 ? "hsl(var(--success))" : engagementScore >= 40 ? "hsl(var(--warning))" : "hsl(var(--muted-foreground))"}
                strokeWidth="3"
                strokeDasharray={`${(engagementScore / 100) * 97.4} 97.4`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
              {engagementScore}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{t("dashboard.engagementScore")}</p>
            <p className="text-xs text-muted-foreground">
              {engagementScore >= 70 ? t("dashboard.highlyEngaged") : engagementScore >= 40 ? t("dashboard.moderatelyEngaged") : t("dashboard.lowEngagement")}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      {(!timeline || timeline.length === 0) ? (
        <div className="p-4 text-center text-muted-foreground text-xs">
          {t("timeline.noActivityData")}
        </div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
          {timeline.map((item, i) => (
            <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
              <div className="absolute left-[-13px] top-1 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center z-10">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {format(new Date(item.time), "h:mm a")}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                {item.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
