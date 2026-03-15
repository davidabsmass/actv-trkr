import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { format, subDays, startOfDay, startOfWeek, subWeeks } from "date-fns";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { LatestSummary } from "@/components/dashboard/LatestSummary";
import { WhatsWorking } from "@/components/dashboard/WhatsWorking";
import { TopPagesAndSources } from "@/components/dashboard/TopPagesAndSources";
import { useOrg } from "@/hooks/use-org";
import { useAlerts, useSites, useForms } from "@/hooks/use-dashboard-data";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import { useSiteSettings } from "@/hooks/use-site-settings";
import {
  BarChart3, Zap, AlertTriangle, Globe, Search,
  ArrowUpRight, ArrowDownRight, Minus, TrendingUp, TrendingDown,
  MapPin, Megaphone,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ─── KPI Card ─── */
interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  icon: React.ReactNode;
  accent?: string;
}

function KPICard({ label, value, sub, trend, icon, accent }: KPICardProps) {
  return (
    <div className="glass-card p-4 animate-slide-up">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
        <span className={accent || "text-primary"}>{icon}</span>
      </div>
      <p className="text-xl font-bold font-mono-data text-foreground leading-tight">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {trend !== undefined && trend !== 0 && (
          <>
            {trend > 0 ? <ArrowUpRight className="h-3 w-3 kpi-up" /> : <ArrowDownRight className="h-3 w-3 kpi-down" />}
            <span className={`text-[10px] font-mono-data font-medium ${trend > 0 ? "kpi-up" : "kpi-down"}`}>
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
          </>
        )}
        {trend === 0 && <Minus className="h-3 w-3 kpi-neutral" />}
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

/* ─── Attention Required Panel ─── */
interface AttentionItem {
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
  link: string;
  linkLabel: string;
}

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const severityStyles = {
    critical: "border-destructive/30 bg-destructive/5",
    warning: "border-warning/30 bg-warning/5",
    info: "border-primary/20 bg-primary/5",
  };
  const dotStyles = {
    critical: "bg-destructive",
    warning: "bg-warning",
    info: "bg-primary",
  };

  return (
    <div className="glass-card p-5 animate-slide-up h-full">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Needs Attention
      </h3>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${severityStyles[item.severity]}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotStyles[item.severity]}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
                </div>
              </div>
              <Link
                to={item.link}
                className="text-[10px] font-medium text-primary hover:underline whitespace-nowrap ml-2"
              >
                {item.linkLabel} →
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Everything looks good — no issues detected.</p>
      )}
    </div>
  );
}

/* ─── Dashboard ─── */
const Dashboard = () => {
  const [days, setDays] = useState(30);
  const navigate = useNavigate();
  const { orgId, orgName, orgs } = useOrg();
  const { needsOnboarding } = useSiteSettings();

  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");
  const thisWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const lastWeekStart = format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), "yyyy-MM-dd");
  const lastWeekEnd = format(subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), "yyyy-MM-dd");

  const { data: realtimeData } = useRealtimeDashboard(orgId, startDate, endDate);
  const { data: thisWeekData } = useRealtimeDashboard(orgId, thisWeekStart, endDate);
  const { data: lastWeekData } = useRealtimeDashboard(orgId, lastWeekStart, lastWeekEnd);
  const { data: alertsData } = useAlerts(orgId);
  const { data: sitesData } = useSites(orgId);

  // SEO movement
  const { data: seoMovement } = useQuery({
    queryKey: ["dashboard_seo_movement", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("seo_scans")
        .select("score, scanned_at")
        .eq("org_id", orgId)
        .order("scanned_at", { ascending: false })
        .limit(2);
      if (!data || data.length === 0) return null;
      const latest = data[0];
      const previous = data.length > 1 ? data[1] : null;
      return {
        score: latest.score,
        change: previous ? latest.score - previous.score : 0,
        scannedAt: latest.scanned_at,
      };
    },
    enabled: !!orgId,
  });

  // Needs attention page (highest exit rate page from kpi_daily)
  const { data: needsAttentionPage } = useQuery({
    queryKey: ["dashboard_attention_page", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const start = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const { data } = await supabase
        .from("kpi_daily")
        .select("dimension, value")
        .eq("org_id", orgId)
        .eq("metric", "page_exit_rate")
        .gte("date", start)
        .not("dimension", "is", null)
        .order("value", { ascending: false })
        .limit(1);
      if (!data || data.length === 0) return null;
      return { path: data[0].dimension || "—", exitRate: Number(data[0].value || 0) };
    },
    enabled: !!orgId,
  });

  // Attention items
  const { data: activeIncidents } = useQuery({
    queryKey: ["active_incidents", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("incidents").select("id, type, severity")
        .eq("org_id", orgId).is("resolved_at", null).limit(10);
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: brokenLinksCount } = useQuery({
    queryKey: ["broken_links_count", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from("broken_links").select("*", { count: "exact", head: true })
        .eq("org_id", orgId);
      return count || 0;
    },
    enabled: !!orgId,
  });

  const { data: expiringDomains } = useQuery({
    queryKey: ["expiring_domains", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("domain_health").select("domain, days_to_domain_expiry")
        .eq("org_id", orgId).lt("days_to_domain_expiry", 30).gt("days_to_domain_expiry", 0);
      return data || [];
    },
    enabled: !!orgId,
  });

  const isLoading = !realtimeData;

  const wowData = useMemo(() => {
    const tw = thisWeekData || { totalSessions: 0, totalLeads: 0 };
    const lw = lastWeekData || { totalSessions: 0, totalLeads: 0 };
    const twCvr = tw.totalSessions > 0 ? tw.totalLeads / tw.totalSessions : 0;
    const lwCvr = lw.totalSessions > 0 ? lw.totalLeads / lw.totalSessions : 0;
    return {
      sessions: { current: tw.totalSessions, previous: lw.totalSessions },
      leads: { current: tw.totalLeads, previous: lw.totalLeads },
      cvr: { current: twCvr, previous: lwCvr },
    };
  }, [thisWeekData, lastWeekData]);

  const topSource = useMemo(() => {
    const sources = realtimeData?.sources || [];
    if (sources.length === 0) return null;
    const sorted = [...sources].sort((a: any, b: any) => (b.sessions || b.count || 0) - (a.sessions || a.count || 0));
    return sorted[0];
  }, [realtimeData]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    if (activeIncidents && activeIncidents.length > 0) {
      items.push({
        severity: "critical",
        label: `${activeIncidents.length} active incident${activeIncidents.length > 1 ? "s" : ""}`,
        detail: activeIncidents.map((i) => i.type).join(", "),
        link: "/monitoring",
        linkLabel: "View",
      });
    }
    const convDrops = (alertsData || []).filter(
      (a) => a.severity === "warning" && a.title?.toLowerCase().includes("conversion")
    );
    if (convDrops.length > 0) {
      items.push({ severity: "warning", label: "Conversion rate dropped", detail: convDrops[0].title, link: "/performance", linkLabel: "Investigate" });
    }
    if (brokenLinksCount && brokenLinksCount > 0) {
      items.push({ severity: "warning", label: `${brokenLinksCount} broken link${brokenLinksCount > 1 ? "s" : ""}`, detail: "May affect UX and SEO", link: "/monitoring?tab=broken-links", linkLabel: "View" });
    }
    if (expiringDomains && expiringDomains.length > 0) {
      items.push({ severity: "warning", label: "Domain expiring soon", detail: expiringDomains.map((d) => `${d.domain} (${d.days_to_domain_expiry}d)`).join(", "), link: "/monitoring", linkLabel: "View" });
    }
    // Add nightly negative findings
    return items;
  }, [activeIncidents, alertsData, brokenLinksCount, expiringDomains]);

  return (
    <div>
      {needsOnboarding && orgs && orgs.length > 0 && <OnboardingModal />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground">{orgName}</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector selectedDays={days} onDaysChange={setDays} />
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-success/10 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" />
            <span className="text-[11px] font-medium text-success">Live</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-4" />
              <div className="h-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : !orgs || orgs.length === 0 ? (
        <div className="glass-card p-8 text-center animate-slide-up">
          <Zap className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No organization yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Create your first org to start tracking.</p>
          <button onClick={() => navigate("/onboarding")} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            Set up an organization
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sitesData && sitesData.length === 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 animate-slide-up">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-foreground mb-1">Get started — connect your website</h3>
                  <p className="text-sm text-muted-foreground">
                    Download the ACTV TRKR plugin, install it on WordPress, and paste your API key to start tracking.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/settings?tab=setup")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  Start Setup <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Row 1 – 6 KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPICard
              label="Sessions (7d)"
              value={wowData.sessions.current.toLocaleString()}
              trend={pctChange(wowData.sessions.current, wowData.sessions.previous)}
              icon={<Globe className="h-4 w-4" />}
            />
            <KPICard
              label="Leads (7d)"
              value={wowData.leads.current}
              trend={pctChange(wowData.leads.current, wowData.leads.previous)}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KPICard
              label="Conversion Rate"
              value={`${(wowData.cvr.current * 100).toFixed(1)}%`}
              trend={pctChange(wowData.cvr.current, wowData.cvr.previous)}
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <KPICard
              label="Top Source"
              value={topSource?.source || topSource?.referrer_domain || "—"}
              sub={topSource ? `${topSource.sessions || topSource.count || 0} sessions` : undefined}
              icon={<Megaphone className="h-4 w-4" />}
              accent="text-accent-foreground"
            />
            <KPICard
              label="Needs Attention"
              value={needsAttentionPage?.path || "—"}
              sub={needsAttentionPage ? `${Math.round(needsAttentionPage.exitRate)}% exit rate` : undefined}
              icon={<MapPin className="h-4 w-4" />}
              accent="text-warning"
            />
            <KPICard
              label="SEO Score"
              value={seoMovement?.score ?? "—"}
              trend={seoMovement?.change || undefined}
              sub={seoMovement ? undefined : "No scan yet"}
              icon={<Search className="h-4 w-4" />}
              accent={seoMovement ? (seoMovement.change >= 0 ? "text-success" : "text-destructive") : "text-muted-foreground"}
            />
          </div>

          {/* Row 2 – Latest Summary */}
          <LatestSummary />

          {/* Row 3 – Three-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AttentionPanel items={attentionItems} />
            <WhatsWorking />
            <TopPagesAndSources />
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>Fresh data • Auto-refreshes every 15s</span>
      </div>
    </div>
  );
};

export default Dashboard;
