import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DoorOpen, DoorClosed, Globe, Smartphone, Clock, Target,
  TrendingDown, MapPin, Award,
} from "lucide-react";

interface Props {
  orgId: string | null;
  startDate: string;
  endDate: string;
}

interface Stats {
  total_sessions: number;
  total_leads: number;
  avg_active_seconds: number;
  avg_pageviews: number;
  bounced_sessions: number;
  engaged_sessions: number;
  top_entry_pages: { path: string; sessions: number }[];
  top_exit_pages: { path: string; sessions: number }[];
  top_sources: { source: string; sessions: number; leads: number }[];
  device_breakdown: { device: string; sessions: number }[];
  top_countries: { country: string; sessions: number }[];
  top_converting_pages: { path: string; leads: number; sessions: number }[];
}

function fmtDuration(s: number) {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

function pct(num: number, den: number) {
  if (!den) return "0%";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function StatCard({
  icon: Icon, label, value, sub,
}: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ListCard({
  icon: Icon, title, items, emptyText,
}: {
  icon: any;
  title: string;
  items: { label: string; value: number; sub?: string | number }[];
  emptyText: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-foreground truncate flex-1" title={item.label}>
                  {item.label}
                </span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {item.value.toLocaleString()}
                  {item.sub != null && <span className="ml-1 opacity-60">· {item.sub}</span>}
                </span>
              </div>
              <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full"
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VisitorJourneyStats({ orgId, startDate, endDate }: Props) {
  const startTs = `${startDate}T00:00:00Z`;
  const endTs = `${endDate}T23:59:59Z`;

  const { data, isLoading } = useQuery({
    queryKey: ["journey_stats", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("get_session_journey_stats", {
        p_org_id: orgId,
        p_start: startTs,
        p_end: endTs,
      });
      if (error) throw error;
      return data as unknown as Stats;
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-3 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.total_sessions === 0) {
    return null;
  }

  const conversionRate = pct(data.total_leads, data.total_sessions);
  const bounceRate = pct(data.bounced_sessions, data.total_sessions);

  return (
    <div className="space-y-4 mb-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={Clock}
          label="Avg time on site"
          value={fmtDuration(data.avg_active_seconds)}
          sub={`${data.avg_pageviews} pages / session`}
        />
        <StatCard
          icon={Target}
          label="Conversion rate"
          value={conversionRate}
          sub={`${data.total_leads} leads / ${data.total_sessions} sessions`}
        />
        <StatCard
          icon={TrendingDown}
          label="Bounce rate"
          value={bounceRate}
          sub={`${data.bounced_sessions.toLocaleString()} bounced`}
        />
        <StatCard
          icon={Award}
          label="Engaged visitors"
          value={data.engaged_sessions.toLocaleString()}
          sub={pct(data.engaged_sessions, data.total_sessions) + " of all sessions"}
        />
      </div>

      {/* Breakdown lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <ListCard
          icon={DoorOpen}
          title="Top entry pages"
          emptyText="No entry data."
          items={data.top_entry_pages.map((p) => ({ label: p.path, value: p.sessions }))}
        />
        <ListCard
          icon={DoorClosed}
          title="Top exit pages"
          emptyText="No exit data."
          items={data.top_exit_pages.map((p) => ({ label: p.path, value: p.sessions }))}
        />
        <ListCard
          icon={Globe}
          title="Top traffic sources"
          emptyText="No source data."
          items={data.top_sources.map((s) => ({
            label: s.source,
            value: s.sessions,
            sub: s.leads > 0 ? `${s.leads} leads` : undefined,
          }))}
        />
        <ListCard
          icon={Target}
          title="Best converting entry pages"
          emptyText="No conversions in this range."
          items={data.top_converting_pages.map((p) => ({
            label: p.path,
            value: p.leads,
            sub: `${p.sessions} sessions`,
          }))}
        />
        <ListCard
          icon={Smartphone}
          title="Device mix"
          emptyText="No device data."
          items={data.device_breakdown.map((d) => ({
            label: d.device,
            value: d.sessions,
            sub: pct(d.sessions, data.total_sessions),
          }))}
        />
        <ListCard
          icon={MapPin}
          title="Top countries"
          emptyText="No location data."
          items={data.top_countries.map((c) => ({
            label: c.country,
            value: c.sessions,
            sub: pct(c.sessions, data.total_sessions),
          }))}
        />
      </div>
    </div>
  );
}
