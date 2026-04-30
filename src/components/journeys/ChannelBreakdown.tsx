import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Megaphone, Search, Share2, Mail, Link2, MousePointer,
  ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface Props {
  orgId: string | null;
  startDate: string;
  endDate: string;
}

type Channel =
  | "Paid Social"
  | "Paid Search"
  | "Organic Social"
  | "Organic Search"
  | "Email"
  | "Referral"
  | "Direct"
  | "Other";

interface ChannelRow {
  channel: Channel;
  sessions: number;
  leads: number;
  cvr: number;
  topSource: string;
  sources: Map<string, { sessions: number; leads: number }>;
}

const CHANNEL_META: Record<Channel, { icon: any; color: string; desc: string }> = {
  "Paid Social":    { icon: Megaphone,     color: "text-fuchsia-400", desc: "Facebook / Instagram / TikTok / LinkedIn ads" },
  "Paid Search":    { icon: Search,        color: "text-amber-400",   desc: "Google / Bing paid search ads" },
  "Organic Social": { icon: Share2,        color: "text-sky-400",     desc: "Unpaid social referrals" },
  "Organic Search": { icon: Search,        color: "text-emerald-400", desc: "Unpaid Google / Bing / DuckDuckGo / etc." },
  "Email":          { icon: Mail,          color: "text-indigo-400",  desc: "Email campaigns and newsletters" },
  "Referral":       { icon: Link2,         color: "text-cyan-400",    desc: "Links from other websites" },
  "Direct":         { icon: MousePointer,  color: "text-muted-foreground", desc: "Typed URL or no referrer" },
  "Other":          { icon: Info,          color: "text-muted-foreground", desc: "Unclassified traffic" },
};

const SOCIAL_DOMAINS = [
  "facebook", "fb.com", "instagram", "tiktok", "linkedin", "twitter", "t.co",
  "x.com", "pinterest", "reddit", "youtube", "youtu.be", "snapchat", "threads",
];
const SEARCH_ENGINES = [
  "google", "bing", "duckduckgo", "yahoo", "yandex", "ecosia", "brave",
  "baidu", "qwant", "startpage",
];
const EMAIL_DOMAINS = ["mail.google", "outlook", "mailchimp", "sendgrid", "constantcontact"];

const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsocial", "paid-social", "paid_social", "display", "banner", "ads"];

function classifyChannel(j: {
  utm_source: string | null;
  utm_medium: string | null;
  landing_referrer_domain: string | null;
}): { channel: Channel; sourceLabel: string } {
  const src = (j.utm_source || "").toLowerCase().trim();
  const med = (j.utm_medium || "").toLowerCase().trim();
  const ref = (j.landing_referrer_domain || "").toLowerCase().trim();

  const isPaid = PAID_MEDIUMS.some((m) => med === m || med.includes(m));
  const isEmailMed = med === "email" || med === "newsletter";
  const isSocialMed = med === "social" || med === "social-network" || med === "sm";
  const isReferralMed = med === "referral";
  const isOrganicMed = med === "organic";

  const srcOrRef = src || ref;
  const isSocialSrc = SOCIAL_DOMAINS.some((d) => srcOrRef.includes(d));
  const isSearchSrc = SEARCH_ENGINES.some((d) => srcOrRef.includes(d));
  const isEmailSrc = EMAIL_DOMAINS.some((d) => srcOrRef.includes(d));

  // Paid
  if (isPaid && isSocialSrc) return { channel: "Paid Social", sourceLabel: src || ref || "social ads" };
  if (isPaid && isSearchSrc) return { channel: "Paid Search", sourceLabel: src || ref || "search ads" };
  if (isPaid) return { channel: "Paid Social", sourceLabel: src || ref || "paid" };

  // Email
  if (isEmailMed || isEmailSrc) return { channel: "Email", sourceLabel: src || ref || "email" };

  // Social
  if (isSocialMed || isSocialSrc) return { channel: "Organic Social", sourceLabel: src || ref || "social" };

  // Search
  if (isOrganicMed || isSearchSrc) return { channel: "Organic Search", sourceLabel: src || ref || "search" };

  // Referral
  if (isReferralMed || ref) return { channel: "Referral", sourceLabel: ref || src || "referral" };

  // Direct
  if (!srcOrRef) return { channel: "Direct", sourceLabel: "Direct" };

  return { channel: "Other", sourceLabel: srcOrRef };
}

export function ChannelBreakdown({ orgId, startDate, endDate }: Props) {
  const startTs = `${startDate}T00:00:00Z`;
  const endTs = `${endDate}T23:59:59Z`;
  const [expanded, setExpanded] = useState<Channel | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["channel_breakdown", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("get_session_journeys", {
        p_org_id: orgId,
        p_start: startTs,
        p_end: endTs,
        p_outcome: "all",
        p_limit: 1000,
        p_offset: 0,
      });
      if (error) throw error;
      return (data || []) as Array<{
        utm_source: string | null;
        utm_medium: string | null;
        utm_campaign: string | null;
        landing_referrer_domain: string | null;
        has_lead: boolean;
        has_conversion: boolean;
      }>;
    },
    enabled: !!orgId,
  });

  const rows: ChannelRow[] = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<Channel, ChannelRow>();
    for (const j of data) {
      const { channel, sourceLabel } = classifyChannel(j);
      const converted = j.has_lead || j.has_conversion;
      let row = map.get(channel);
      if (!row) {
        row = {
          channel, sessions: 0, leads: 0, cvr: 0,
          topSource: sourceLabel,
          sources: new Map(),
        };
        map.set(channel, row);
      }
      row.sessions += 1;
      if (converted) row.leads += 1;
      const s = row.sources.get(sourceLabel) || { sessions: 0, leads: 0 };
      s.sessions += 1;
      if (converted) s.leads += 1;
      row.sources.set(sourceLabel, s);
    }
    const out = Array.from(map.values()).map((r) => {
      r.cvr = r.sessions > 0 ? r.leads / r.sessions : 0;
      // pick top source label by sessions
      let top = r.topSource;
      let topCount = 0;
      for (const [label, v] of r.sources) {
        if (v.sessions > topCount) { topCount = v.sessions; top = label; }
      }
      r.topSource = top;
      return r;
    });
    out.sort((a, b) => b.sessions - a.sessions);
    return out;
  }, [data]);

  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0);
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);

  if (isLoading) {
    return <div className="glass-card p-4 h-40 animate-pulse mb-4" />;
  }
  if (rows.length === 0) return null;

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Traffic by channel</h3>
          <IconTooltip label="Sessions grouped by channel — Paid vs Organic vs Direct vs Referral. CVR = sessions that completed a form fill or Key Action.">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </IconTooltip>
        </div>
        <span className="text-xs text-muted-foreground">
          {totalSessions.toLocaleString()} sessions · {totalLeads.toLocaleString()} conversions
          {data && data.length >= 1000 && <span className="ml-1 opacity-70">(latest 1k)</span>}
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((row) => {
          const meta = CHANNEL_META[row.channel];
          const Icon = meta.icon;
          const sharePct = totalSessions > 0 ? (row.sessions / totalSessions) * 100 : 0;
          const isOpen = expanded === row.channel;
          const sortedSources = Array.from(row.sources.entries())
            .sort((a, b) => b[1].sessions - a[1].sessions)
            .slice(0, 10);
          return (
            <div key={row.channel} className="border border-border/50 rounded-md overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : row.channel)}
                className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/30 transition-colors text-left"
              >
                <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{row.channel}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums shrink-0">
                      <span>{row.sessions.toLocaleString()} sess</span>
                      <span className="text-foreground">{row.leads.toLocaleString()} conv</span>
                      <span className={`font-semibold ${row.cvr >= 0.05 ? "text-success" : row.cvr >= 0.02 ? "text-foreground" : "text-muted-foreground"}`}>
                        {(row.cvr * 100).toFixed(1)}% CVR
                      </span>
                      {isOpen
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />}
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${sharePct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground truncate">
                      Top: <span className="text-foreground/80">{row.topSource}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {sharePct.toFixed(1)}% of traffic
                    </span>
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 bg-muted/10 border-t border-border/40">
                  <div className="text-[11px] text-muted-foreground mb-2">{meta.desc}</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="text-left py-1 font-medium">Source</th>
                        <th className="text-right py-1 font-medium">Sessions</th>
                        <th className="text-right py-1 font-medium">Leads</th>
                        <th className="text-right py-1 font-medium">CVR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSources.map(([label, v]) => (
                        <tr key={label} className="border-t border-border/30">
                          <td className="py-1 text-foreground truncate max-w-[200px]" title={label}>{label}</td>
                          <td className="py-1 text-right tabular-nums text-muted-foreground">{v.sessions.toLocaleString()}</td>
                          <td className="py-1 text-right tabular-nums text-foreground">{v.leads.toLocaleString()}</td>
                          <td className="py-1 text-right tabular-nums text-foreground">
                            {v.sessions > 0 ? ((v.leads / v.sessions) * 100).toFixed(1) : "0.0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
