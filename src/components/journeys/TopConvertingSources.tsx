import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Info } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface Props {
  orgId: string | null;
  startDate: string;
  endDate: string;
}

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

function classify(j: {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_referrer_domain: string | null;
}): { label: string; channel: string; isAd: boolean } {
  const src = (j.utm_source || "").toLowerCase().trim();
  const med = (j.utm_medium || "").toLowerCase().trim();
  const camp = (j.utm_campaign || "").trim();
  const ref = (j.landing_referrer_domain || "").toLowerCase().trim();
  const srcOrRef = src || ref;

  const isPaid = PAID_MEDIUMS.some((m) => med === m || med.includes(m));
  const isSocialSrc = SOCIAL_DOMAINS.some((d) => srcOrRef.includes(d));
  const isSearchSrc = SEARCH_ENGINES.some((d) => srcOrRef.includes(d));
  const isEmailSrc = EMAIL_DOMAINS.some((d) => srcOrRef.includes(d));
  const isEmailMed = med === "email" || med === "newsletter";
  const isSocialMed = med === "social" || med === "social-network" || med === "sm";
  const isOrganicMed = med === "organic";

  let channel = "Other";
  if (isPaid && isSocialSrc) channel = "Paid Social";
  else if (isPaid && isSearchSrc) channel = "Paid Search";
  else if (isPaid) channel = "Paid";
  else if (isEmailMed || isEmailSrc) channel = "Email";
  else if (isSocialMed || isSocialSrc) channel = "Organic Social";
  else if (isOrganicMed || isSearchSrc) channel = "Organic Search";
  else if (ref) channel = "Referral";
  else if (!srcOrRef) channel = "Direct";

  // Build label: prefer campaign for ads, else utm_source, else referrer host
  const base = src || ref || "direct";
  const label = isPaid && camp ? `${base} · ${camp}` : base;
  return { label, channel, isAd: isPaid };
}

export function TopConvertingSources({ orgId, startDate, endDate }: Props) {
  const startTs = `${startDate}T00:00:00Z`;
  const endTs = `${endDate}T23:59:59Z`;

  const { data, isLoading } = useQuery({
    queryKey: ["top_converting_sources", orgId, startDate, endDate],
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

  const rows = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<string, { label: string; channel: string; isAd: boolean; sessions: number; conversions: number }>();
    for (const j of data) {
      const { label, channel, isAd } = classify(j);
      const converted = j.has_lead || j.has_conversion;
      const key = `${channel}::${label}`;
      let row = map.get(key);
      if (!row) {
        row = { label, channel, isAd, sessions: 0, conversions: 0 };
        map.set(key, row);
      }
      row.sessions += 1;
      if (converted) row.conversions += 1;
    }
    return Array.from(map.values())
      .filter((r) => r.conversions > 0)
      .map((r) => ({ ...r, cvr: r.sessions > 0 ? r.conversions / r.sessions : 0 }))
      .sort((a, b) => b.conversions - a.conversions || b.cvr - a.cvr)
      .slice(0, 25);
  }, [data]);

  if (isLoading) return <div className="glass-card p-4 h-40 animate-pulse mb-4" />;

  if (rows.length === 0) {
    return (
      <div className="glass-card p-6 mb-4 text-center">
        <Trophy className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <div className="text-sm text-foreground font-medium">No converting sources yet</div>
        <p className="text-xs text-muted-foreground mt-1">
          Once visitors arrive from a referrer or ad and complete a form fill or Key Action, they'll appear here.
        </p>
      </div>
    );
  }

  const totalConv = rows.reduce((s, r) => s + r.conversions, 0);

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">Top converting sources</h3>
          <IconTooltip label="Referrers and ads ranked by sessions that completed a form fill or Key Action. Campaign name is appended for paid traffic when available.">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </IconTooltip>
        </div>
        <span className="text-xs text-muted-foreground">
          {totalConv.toLocaleString()} conversions · top {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left py-2 font-medium w-8">#</th>
              <th className="text-left py-2 font-medium">Source / Campaign</th>
              <th className="text-left py-2 font-medium">Channel</th>
              <th className="text-right py-2 font-medium">Sessions</th>
              <th className="text-right py-2 font-medium">Conversions</th>
              <th className="text-right py-2 font-medium">CVR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.channel}-${r.label}`} className="border-b border-border/20 hover:bg-muted/20">
                <td className="py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="py-2 text-foreground truncate max-w-[280px]" title={r.label}>
                  {r.label}
                  {r.isAd && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400/90 border border-amber-400/30 rounded px-1 py-0.5">
                      Ad
                    </span>
                  )}
                </td>
                <td className="py-2 text-muted-foreground">{r.channel}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.sessions.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums text-foreground font-semibold">{r.conversions.toLocaleString()}</td>
                <td className={`py-2 text-right tabular-nums font-semibold ${r.cvr >= 0.05 ? "text-success" : r.cvr >= 0.02 ? "text-foreground" : "text-muted-foreground"}`}>
                  {(r.cvr * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
