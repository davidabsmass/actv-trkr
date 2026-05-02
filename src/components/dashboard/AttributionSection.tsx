import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronRight, Info, Megaphone, Search, Share2, Mail, Link2, MousePointer } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";

interface SourceRow { source: string; sessions: number; leads: number; cvr: number }
interface CampaignRow { campaign: string; sessions: number; leads: number; cvr: number }

interface AttributionProps {
  sources: SourceRow[];
  campaigns: CampaignRow[];
  /** Raw count of session referrers we collapsed into "Direct" because they
   * matched one of the org's own domains. Surfaced as a transparent footnote. */
  selfReferralSessions?: number;
}

type Channel =
  | "Paid Search"
  | "Paid Social"
  | "Organic Search"
  | "Organic Social"
  | "Email"
  | "Referral"
  | "Direct"
  | "Other";

const CHANNEL_META: Record<Channel, { icon: any; tone: string; desc: string }> = {
  "Paid Search":    { icon: Search,       tone: "text-amber-400",      desc: "Google / Bing paid ads" },
  "Paid Social":    { icon: Megaphone,    tone: "text-fuchsia-400",    desc: "Facebook / Instagram / TikTok / LinkedIn ads" },
  "Organic Search": { icon: Search,       tone: "text-emerald-400",    desc: "Unpaid search engine traffic" },
  "Organic Social": { icon: Share2,       tone: "text-sky-400",        desc: "Unpaid social referrals" },
  "Email":          { icon: Mail,         tone: "text-indigo-400",     desc: "Email and newsletter traffic" },
  "Referral":       { icon: Link2,        tone: "text-cyan-400",       desc: "Links from other websites" },
  "Direct":         { icon: MousePointer, tone: "text-muted-foreground", desc: "Typed URL or no referrer" },
  "Other":          { icon: Info,         tone: "text-muted-foreground", desc: "Unclassified traffic" },
};

const SEARCH_LABELS = new Set(["Google", "Bing", "DuckDuckGo", "Yahoo", "Yandex", "Baidu", "Ecosia", "Brave Search", "Naver"]);
const SOCIAL_LABELS = new Set(["Facebook", "Instagram", "LinkedIn", "X (Twitter)", "TikTok", "Pinterest", "Reddit", "YouTube", "Snapchat", "Threads"]);
const EMAIL_LABELS = new Set(["HubSpot Email", "Mailchimp", "Constant Contact", "SendGrid", "Webmail", "Gmail App"]);
const AI_LABELS = new Set(["ChatGPT", "Perplexity", "Claude", "Gemini"]);

/** Bucket a (already canonicalized) source label into a marketing channel. */
function classifyChannel(label: string): Channel {
  if (label === "Direct" || !label) return "Direct";
  if (SEARCH_LABELS.has(label)) return "Organic Search";
  if (SOCIAL_LABELS.has(label)) return "Organic Social";
  if (EMAIL_LABELS.has(label)) return "Email";
  if (AI_LABELS.has(label)) return "Referral"; // AI assistants count as referrals
  // Fallback: anything else with a hostname-like label is a Referral
  return "Referral";
}

type SortKey = "sessions" | "leads" | "cvr";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === "desc"
    ? <ChevronDown className="h-3 w-3 text-primary" />
    : <ChevronUp className="h-3 w-3 text-primary" />;
}

export function AttributionSection({ sources, campaigns, selfReferralSessions = 0 }: AttributionProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"channel" | "source" | "campaign">("channel");
  const [sortKey, setSortKey] = useState<SortKey>("sessions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Channel | null>(null);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Aggregate sources into channels.
  const channels = useMemo(() => {
    const map = new Map<Channel, { sessions: number; leads: number; sources: SourceRow[] }>();
    for (const row of sources) {
      const ch = classifyChannel(row.source);
      const cur = map.get(ch) || { sessions: 0, leads: 0, sources: [] };
      cur.sessions += row.sessions;
      cur.leads += row.leads;
      cur.sources.push(row);
      map.set(ch, cur);
    }
    const out = Array.from(map.entries()).map(([channel, v]) => ({
      channel,
      sessions: v.sessions,
      leads: v.leads,
      cvr: v.sessions > 0 ? v.leads / v.sessions : 0,
      sources: v.sources.sort((a, b) => b.sessions - a.sessions),
    }));
    out.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return out;
  }, [sources, sortKey, sortDir]);

  const sortedSources = useMemo(() => {
    return [...sources].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [sources, sortKey, sortDir]);

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [campaigns, sortKey, sortDir]);

  const thClass = "text-right py-2 px-2 text-muted-foreground font-medium tracking-wider sticky top-0 bg-card cursor-pointer select-none hover:text-foreground transition-colors text-xs";

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {t("dashboard.attribution")}
          <IconTooltip label="Where your traffic and leads come from — grouped by channel, then by raw source / UTM campaign.">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </IconTooltip>
        </h3>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button
            onClick={() => setTab("channel")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === "channel" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Channel
          </button>
          <button
            onClick={() => setTab("source")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === "source" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.source")}
          </button>
          <button
            onClick={() => setTab("campaign")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === "campaign" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.campaign")}
          </button>
        </div>
      </div>

      {/* CHANNEL VIEW — primary: groups raw sources into marketing channels */}
      {tab === "channel" && (
        <ScrollArea className={channels.length > 8 ? "h-[420px]" : ""}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium tracking-wider sticky top-0 bg-card text-xs">
                  Channel
                </th>
                <th className={thClass} onClick={() => handleSort("sessions")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.sessions")} <SortIcon active={sortKey === "sessions"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("leads")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.leads")} <SortIcon active={sortKey === "leads"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("cvr")}>
                  <span className="inline-flex items-center gap-1 justify-end">CVR <SortIcon active={sortKey === "cvr"} dir={sortDir} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {channels.map((row) => {
                const meta = CHANNEL_META[row.channel];
                const Icon = meta.icon;
                const isExpanded = expanded === row.channel;
                return (
                  <>
                    <tr
                      key={row.channel}
                      className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : row.channel)}
                    >
                      <td className="py-2 px-2 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                          <span>{row.channel}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                        {row.sessions.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">
                        {row.leads.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-data text-foreground">
                        {(row.cvr * 100).toFixed(2)}%
                      </td>
                    </tr>
                    {isExpanded && row.sources.map((src, i) => (
                      <tr key={`${row.channel}-${i}`} className="bg-muted/20 text-muted-foreground">
                        <td className="py-1.5 pl-9 pr-2 text-xs">{src.source}</td>
                        <td className="py-1.5 px-2 text-right font-mono-data text-xs">{src.sessions.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-right font-mono-data text-xs">{src.leads.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-right font-mono-data text-xs">{(src.cvr * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* RAW SOURCE VIEW — flat list, canonical names already collapsed upstream */}
      {tab === "source" && (
        <ScrollArea className={sortedSources.length > 15 ? "h-[420px]" : ""}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium tracking-wider sticky top-0 bg-card text-xs">{t("dashboard.source")}</th>
                <th className={thClass} onClick={() => handleSort("sessions")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.sessions")} <SortIcon active={sortKey === "sessions"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("leads")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.leads")} <SortIcon active={sortKey === "leads"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("cvr")}>
                  <span className="inline-flex items-center gap-1 justify-end">CVR <SortIcon active={sortKey === "cvr"} dir={sortDir} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSources.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="py-2 px-2 font-medium text-foreground">{row.source}</td>
                  <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">{row.sessions.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">{row.leads.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right font-mono-data text-foreground">{(row.cvr * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* CAMPAIGN VIEW */}
      {tab === "campaign" && (
        <ScrollArea className={sortedCampaigns.length > 15 ? "h-[420px]" : ""}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium tracking-wider sticky top-0 bg-card text-xs">{t("dashboard.campaign")}</th>
                <th className={thClass} onClick={() => handleSort("sessions")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.sessions")} <SortIcon active={sortKey === "sessions"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("leads")}>
                  <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.leads")} <SortIcon active={sortKey === "leads"} dir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => handleSort("cvr")}>
                  <span className="inline-flex items-center gap-1 justify-end">CVR <SortIcon active={sortKey === "cvr"} dir={sortDir} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedCampaigns.length === 0 ? (
                <tr><td colSpan={4} className="py-6 px-2 text-center text-muted-foreground">No UTM campaigns tagged in this date range.</td></tr>
              ) : sortedCampaigns.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="py-2 px-2 font-medium text-foreground">{row.campaign}</td>
                  <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">{row.sessions.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">{row.leads.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right font-mono-data text-foreground">{(row.cvr * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {selfReferralSessions > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Excluded {selfReferralSessions.toLocaleString()} self-referral session{selfReferralSessions === 1 ? "" : "s"} (visitors hopping between your own pages or subdomains). Counted as Direct.
        </p>
      )}
    </div>
  );
}
