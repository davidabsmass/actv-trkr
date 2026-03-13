import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { format, subDays, startOfDay, startOfWeek, subWeeks } from "date-fns";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { WeekOverWeekStrip } from "@/components/dashboard/WeekOverWeekStrip";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { AiInsights } from "@/components/dashboard/AiInsights";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { FormHealthPanel } from "@/components/dashboard/FormHealthPanel";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { ShareableSnapshot } from "@/components/dashboard/ShareableSnapshot";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { KPIRow } from "@/components/dashboard/KPIRow";
import { useOrg } from "@/hooks/use-org";
import { useAlerts, useSites, useForms } from "@/hooks/use-dashboard-data";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import { useSiteSettings, PrimaryFocus } from "@/hooks/use-site-settings";
import {
  BarChart3, Zap, AlertTriangle, Shield, Link2, Globe, CalendarClock,
  ArrowUpRight, ArrowDownRight, Minus, CheckCircle2, XCircle, TrendingUp,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

/* ─── Attention Required Panel ─── */
interface AttentionItem {
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
  link: string;
  linkLabel: string;
}

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
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
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Attention Required
      </h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${severityStyles[item.severity]}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotStyles[item.severity]}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
              </div>
            </div>
            <Link
              to={item.link}
              className="text-xs font-medium text-primary hover:underline whitespace-nowrap ml-3"
            >
              {item.linkLabel} →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Status Cards ─── */
interface StatusCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  icon: React.ReactNode;
  accent?: string;
}

function StatusCard({ label, value, sub, trend, icon, accent }: StatusCardProps) {
  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
        <span className={accent || "text-primary"}>{icon}</span>
      </div>
      <p className="text-2xl font-bold font-mono-data text-foreground">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {trend !== undefined && trend !== 0 && (
          <>
            {trend > 0 ? <ArrowUpRight className="h-3 w-3 kpi-up" /> : <ArrowDownRight className="h-3 w-3 kpi-down" />}
            <span className={`text-xs font-mono-data font-medium ${trend > 0 ? "kpi-up" : "kpi-down"}`}>
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
          </>
        )}
        {trend === 0 && <Minus className="h-3 w-3 kpi-neutral" />}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

/* ─── Overview Page ─── */
const Dashboard = () => {
  const [days, setDays] = useState(30);
  const navigate = useNavigate();
  const { orgId, orgName, orgs } = useOrg();
  const { settings, needsOnboarding } = useSiteSettings();

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
  const { data: formsData } = useForms(orgId);

  // Attention Required data
  const { data: activeIncidents } = useQuery({
    queryKey: ["active_incidents", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("incidents").select("id, type, severity, started_at, site_id")
        .eq("org_id", orgId).is("resolved_at", null).limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: brokenLinksCount } = useQuery({
    queryKey: ["broken_links_count", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count, error } = await supabase
        .from("broken_links").select("*", { count: "exact", head: true })
        .eq("org_id", orgId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!orgId,
  });

  const { data: expiringDomains } = useQuery({
    queryKey: ["expiring_domains", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("domain_health").select("domain, days_to_domain_expiry")
        .eq("org_id", orgId).lt("days_to_domain_expiry", 30).gt("days_to_domain_expiry", 0);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: expiringSSL } = useQuery({
    queryKey: ["expiring_ssl", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("ssl_health").select("site_id, days_to_ssl_expiry")
        .eq("org_id", orgId).lt("days_to_ssl_expiry", 14).gt("days_to_ssl_expiry", 0);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: renewalsDue } = useQuery({
    queryKey: ["renewals_due", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const cutoff = format(subDays(new Date(), -30), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("renewals").select("type, renewal_date, provider_name")
        .eq("org_id", orgId).eq("is_enabled", true)
        .lte("renewal_date", cutoff).gte("renewal_date", format(new Date(), "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const isLoading = !realtimeData;
  const primaryFocus: PrimaryFocus = settings?.primary_focus || "lead_volume";

  // WoW comparison
  const wowData = useMemo(() => {
    const tw = thisWeekData || { totalSessions: 0, totalLeads: 0 };
    const lw = lastWeekData || { totalSessions: 0, totalLeads: 0 };
    const twCvr = tw.totalSessions > 0 ? tw.totalLeads / tw.totalSessions : 0;
    const lwCvr = lw.totalSessions > 0 ? lw.totalLeads / lw.totalSessions : 0;
    const bestPage = thisWeekData?.pages?.sort((a: any, b: any) => b.leads - a.leads)?.[0]?.path;
    return {
      sessions: { current: tw.totalSessions, previous: lw.totalSessions },
      leads: { current: tw.totalLeads, previous: lw.totalLeads },
      cvr: { current: twCvr, previous: lwCvr },
      bestPage,
    };
  }, [thisWeekData, lastWeekData]);

  // Processed data for charts
  const processedData = useMemo(() => {
    if (isLoading || !realtimeData) {
      return {
        kpis: {
          sessions: { value: 0, delta: 0, label: "Sessions" },
          leads: { value: 0, delta: 0, label: "Leads" },
          pageviews: { value: 0, delta: 0, label: "Pageviews" },
          cvr: { value: 0, delta: 0, label: "Conversion Rate" },
        },
        dailyData: [],
        sources: [],
        alerts: [],
      };
    }

    const { totalPageviews, totalSessions, totalLeads, dailyMap } = realtimeData;
    const cvr = totalSessions > 0 ? totalLeads / totalSessions : 0;

    const dailyData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        dateLabel: format(new Date(date), "MMM d"),
        sessions: vals.sessions,
        leads: vals.leads,
        pageviews: vals.pageviews,
        cvr: vals.sessions > 0 ? vals.leads / vals.sessions : 0,
      }));

    const alerts = (alertsData || []).map((a) => ({
      id: a.id,
      severity: a.severity as "warning" | "info" | "error",
      title: a.title,
      detail: typeof a.details === "object" && a.details !== null ? (a.details as any).detail || "" : "",
      date: format(new Date(a.date), "MMM d"),
    }));

    return {
      kpis: {
        sessions: { value: totalSessions, delta: 0, label: "Sessions" },
        leads: { value: totalLeads, delta: 0, label: "Leads" },
        pageviews: { value: totalPageviews, delta: 0, label: "Pageviews" },
        cvr: { value: cvr, delta: 0, label: "Conversion Rate" },
      },
      dailyData,
      sources: realtimeData.sources,
      alerts,
    };
  }, [isLoading, realtimeData, alertsData]);

  // Attention Required items
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    // Active incidents
    if (activeIncidents && activeIncidents.length > 0) {
      items.push({
        severity: "critical",
        label: `${activeIncidents.length} active incident${activeIncidents.length > 1 ? "s" : ""}`,
        detail: activeIncidents.map((i) => i.type).join(", "),
        link: "/monitoring",
        linkLabel: "View details",
      });
    }

    // Conversion drops from alerts
    const convDrops = (alertsData || []).filter(
      (a) => a.severity === "warning" && a.title?.toLowerCase().includes("conversion")
    );
    if (convDrops.length > 0) {
      items.push({
        severity: "warning",
        label: "Conversion rate dropped",
        detail: convDrops[0].title,
        link: "/performance",
        linkLabel: "Investigate",
      });
    }

    // Broken links
    if (brokenLinksCount && brokenLinksCount > 0) {
      items.push({
        severity: "warning",
        label: `${brokenLinksCount} broken link${brokenLinksCount > 1 ? "s" : ""} detected`,
        detail: "May affect user experience and SEO",
        link: "/monitoring?tab=broken-links",
        linkLabel: "View links",
      });
    }

    // Domain expiring
    if (expiringDomains && expiringDomains.length > 0) {
      items.push({
        severity: "warning",
        label: `Domain expiring soon`,
        detail: expiringDomains.map((d) => `${d.domain} (${d.days_to_domain_expiry}d)`).join(", "),
        link: "/monitoring",
        linkLabel: "View details",
      });
    }

    // SSL expiring
    if (expiringSSL && expiringSSL.length > 0) {
      items.push({
        severity: "warning",
        label: `SSL certificate expiring`,
        detail: `${expiringSSL.length} certificate${expiringSSL.length > 1 ? "s" : ""} expiring within 14 days`,
        link: "/monitoring",
        linkLabel: "View details",
      });
    }

    // Renewals due
    if (renewalsDue && renewalsDue.length > 0) {
      items.push({
        severity: "info",
        label: `${renewalsDue.length} renewal${renewalsDue.length > 1 ? "s" : ""} due soon`,
        detail: renewalsDue.map((r) => `${r.type}${r.provider_name ? ` (${r.provider_name})` : ""}`).join(", "),
        link: "/monitoring",
        linkLabel: "View renewals",
      });
    }

    return items;
  }, [activeIncidents, alertsData, brokenLinksCount, expiringDomains, expiringSSL, renewalsDue]);

  // Status cards – focus-aware ordering
  const siteUp = sitesData && sitesData.length > 0
    ? sitesData.every((s) => s.status === "active" || s.status === "ok" || s.status === "UP")
    : null;
  const lastHeartbeat = sitesData?.[0]?.last_heartbeat_at;



  const snapshotData = useMemo(() => ({
    kpis: processedData.kpis, wowData, orgName,
    focus: primaryFocus, generatedAt: new Date().toISOString(),
  }), [processedData.kpis, wowData, orgName, primaryFocus]);

  // Build status cards based on primaryFocus
  const statusCards = useMemo(() => {
    const siteCard = (
      <StatusCard
        key="status"
        label="Site Status"
        value={siteUp === null ? "—" : siteUp ? "UP" : "DOWN"}
        sub={lastHeartbeat ? `Last confirmation ${format(new Date(lastHeartbeat), "MMM d HH:mm")}` : "No confirmation yet"}
        icon={siteUp ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        accent={siteUp === null ? "text-muted-foreground" : siteUp ? "text-success" : "text-destructive"}
      />
    );
    const leadsCard = (
      <StatusCard
        key="leads"
        label="Leads (7d)"
        value={wowData.leads.current}
        trend={pctChange(wowData.leads.current, wowData.leads.previous)}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    );
    const cvrCard = (
      <StatusCard
        key="cvr"
        label="Conversion Rate"
        value={`${(wowData.cvr.current * 100).toFixed(1)}%`}
        trend={pctChange(wowData.cvr.current, wowData.cvr.previous)}
        icon={<BarChart3 className="h-5 w-5" />}
      />
    );
    const sessionsCard = (
      <StatusCard
        key="sessions"
        label="Sessions (7d)"
        value={wowData.sessions.current}
        trend={pctChange(wowData.sessions.current, wowData.sessions.previous)}
        icon={<Globe className="h-5 w-5" />}
      />
    );

    const focusOrder: Record<PrimaryFocus, React.ReactNode[]> = {
      lead_volume: [leadsCard, cvrCard, siteCard, sessionsCard],
      marketing_impact: [sessionsCard, siteCard, leadsCard, cvrCard],
      conversion_performance: [cvrCard, leadsCard, siteCard, sessionsCard],
      paid_optimization: [sessionsCard, cvrCard, leadsCard, siteCard],
    };

    return focusOrder[primaryFocus] || focusOrder.lead_volume;
  }, [siteUp, lastHeartbeat, wowData, revenueImpact, primaryFocus]);

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
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-4" />
              <div className="h-20 bg-muted rounded" />
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
            <div className="flex items-start gap-3 p-4 rounded-lg border border-warning/30 bg-warning/5 animate-slide-up">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">No site connected yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Make sure the plugin is activated on your WordPress site.</p>
                <button onClick={() => navigate("/settings")} className="text-xs font-medium text-primary hover:underline mt-1.5">
                  Go to Settings →
                </button>
              </div>
            </div>
          )}

          {/* Row 1 – Status Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statusCards}
          </div>

          {/* Row 2 – Trends */}
          <WeekOverWeekStrip data={wowData} />
          <TrendsChart data={processedData.dailyData} />

          {/* Row 3 – Attention Required */}
          <AttentionPanel items={attentionItems} />

          {/* Supporting sections */}
          <WeeklySummary primaryFocus={primaryFocus} />
          <AiInsights metrics={{
            sessionsThisWeek: wowData.sessions.current,
            sessionsLastWeek: wowData.sessions.previous,
            leadsThisWeek: wowData.leads.current,
            leadsLastWeek: wowData.leads.previous,
            cvrThisWeek: wowData.cvr.current,
            cvrLastWeek: wowData.cvr.previous,
            topPage: wowData.bestPage || "",
            topSource: processedData.sources?.[0]?.source || "",
            totalForms: formsData?.filter((f) => !f.archived).length || 0,
            primaryFocus,
          }} />
          <FormHealthPanel orgId={orgId} />
          <AlertsSection alerts={processedData.alerts} />
        </div>
      )}
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>Live data • Auto-refreshes every 15s</span>
      </div>
    </div>
  );
};

export default Dashboard;
