import { useState } from "react";
import { format, formatDistanceStrict } from "date-fns";
import {
  ChevronDown, ChevronRight, ExternalLink, Smartphone, Monitor, Tablet,
  Globe, Target, UserCheck, MousePointerClick,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LeadActivityTimeline } from "@/components/dashboard/LeadActivityTimeline";

export interface JourneyRow {
  session_id: string;
  visitor_id: string | null;
  site_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  active_seconds: number;
  pageview_count: number;
  landing_page_path: string | null;
  landing_referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  exit_page_path: string | null;
  exit_page_title: string | null;
  exit_at: string | null;
  device: string | null;
  country_code: string | null;
  has_lead: boolean;
  has_conversion: boolean;
  engagement_score: number | null;
}

function shortVisitor(id: string | null) {
  if (!id) return "anon";
  return `vis_${id.replace(/-/g, "").slice(0, 6)}`;
}

function fmtDuration(s: number) {
  if (!s || s < 1) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

function deviceIcon(d: string | null) {
  const v = (d || "").toLowerCase();
  if (v.includes("mobile") || v.includes("phone")) return <Smartphone className="h-3 w-3" />;
  if (v.includes("tablet")) return <Tablet className="h-3 w-3" />;
  return <Monitor className="h-3 w-3" />;
}

function source(j: JourneyRow) {
  if (j.utm_source) return `${j.utm_source}${j.utm_medium ? ` / ${j.utm_medium}` : ""}`;
  if (j.landing_referrer_domain) return j.landing_referrer_domain;
  return "Direct";
}

function outcomeBadge(j: JourneyRow) {
  if (j.has_lead) {
    return <Badge className="bg-success/15 text-success border-success/30 gap-1"><UserCheck className="h-3 w-3" />Lead</Badge>;
  }
  if (j.has_conversion) {
    return <Badge className="bg-primary/15 text-primary border-primary/30 gap-1"><Target className="h-3 w-3" />Goal</Badge>;
  }
  if (j.pageview_count >= 2 || j.active_seconds >= 30) {
    return <Badge variant="outline" className="gap-1"><MousePointerClick className="h-3 w-3" />Engaged</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Bounced</Badge>;
}

function scoreColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-muted-foreground";
}

export function JourneyRowItem({ j, orgId }: { j: JourneyRow; orgId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="pt-1 text-muted-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Top row: arrival + outcome */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">
              {format(new Date(j.started_at), "MMM d, h:mm a")}
            </span>
            <span className="text-foreground font-medium text-sm truncate">
              {j.landing_page_path || "/"}
            </span>
            {outcomeBadge(j)}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {source(j)}
            </span>
            <span className="flex items-center gap-1">
              {deviceIcon(j.device)}
              {j.device || "unknown"}
            </span>
            {j.country_code && <span>{j.country_code}</span>}
            <span className="font-mono">{shortVisitor(j.visitor_id)}</span>
          </div>
        </div>

        {/* Right: stats */}
        <div className="flex items-center gap-4 text-right shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Time</div>
            <div className="text-sm font-semibold text-foreground">{fmtDuration(j.active_seconds)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pages</div>
            <div className="text-sm font-semibold text-foreground">{j.pageview_count}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</div>
            <div className={`text-sm font-semibold ${scoreColor(j.engagement_score)}`}>
              {j.engagement_score ?? "—"}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 bg-muted/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-xs">
            <div className="rounded-md border border-border bg-card p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Arrived</div>
              <div className="text-foreground truncate">{j.landing_page_path || "/"}</div>
              <div className="text-muted-foreground mt-0.5">{format(new Date(j.started_at), "MMM d, yyyy h:mm:ss a")}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Last viewed</div>
              <div className="text-foreground truncate flex items-center gap-1">
                <ExternalLink className="h-3 w-3 shrink-0" />
                {j.exit_page_title || j.exit_page_path || "—"}
              </div>
              <div className="text-muted-foreground mt-0.5">
                {j.exit_at ? format(new Date(j.exit_at), "MMM d, yyyy h:mm:ss a") : "—"}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Total session</div>
              <div className="text-foreground">
                {j.ended_at
                  ? formatDistanceStrict(new Date(j.started_at), new Date(j.ended_at))
                  : "—"}
              </div>
              <div className="text-muted-foreground mt-0.5">
                Active: {fmtDuration(j.active_seconds)}
              </div>
            </div>
          </div>

          <LeadActivityTimeline sessionId={j.session_id} orgId={orgId} />
        </div>
      )}
    </div>
  );
}
