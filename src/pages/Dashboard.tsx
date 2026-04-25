import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { HowToButton } from "@/components/HowToButton";
import { HOWTO_DASHBOARD } from "@/components/howto/page-content";
import { GetStartedBanner } from "@/components/dashboard/GetStartedBanner";

import { useNavigate, Link } from "react-router-dom";
import { format, subDays, startOfDay } from "date-fns";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { LatestSummary } from "@/components/dashboard/LatestSummary";
import { AiInsights } from "@/components/dashboard/AiInsights";
import { WhatsWorking } from "@/components/dashboard/WhatsWorking";
import { TopPagesAndSources } from "@/components/dashboard/TopPagesAndSources";
import { TrendsMiniChart } from "@/components/dashboard/TrendsMiniChart";
import { FunnelWidget, type GoalFunnelEntry } from "@/components/dashboard/FunnelWidget";
import { RevenueWidget } from "@/components/dashboard/RevenueWidget";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { useOrg } from "@/hooks/use-org";
import { useSeoVisibility } from "@/hooks/use-seo-visibility";
import { useAlerts, useSites, useForms } from "@/hooks/use-dashboard-data";
import { useDashboardOverview } from "@/hooks/use-dashboard-overview";
import { useSiteSettings } from "@/hooks/use-site-settings";
import {
  BarChart3, Zap, AlertTriangle, Globe, Search,
  ArrowUpRight, ArrowDownRight, Minus, TrendingUp, TrendingDown,
  MapPin, Megaphone, CheckCircle2, ShieldAlert, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddSiteModal } from "@/components/sites/AddSiteModal";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ─── KPI Card ─── */
type KpiVariant = "primary" | "success" | "warning" | "info";

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number | null;
  icon: React.ReactNode;
  accent?: string;
  valueClassName?: string;
  valueTitle?: string;
  variant?: KpiVariant;
  series?: number[];
}

const KPI_VARIANT_COLOR: Record<KpiVariant, string> = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  info: "hsl(var(--info))",
};

function KPICard({ label, value, sub, trend, icon, accent, valueClassName, valueTitle, variant = "primary", series }: KPICardProps) {
  return (
    <div className="kpi-card p-4 animate-slide-up min-h-[132px] flex flex-col" data-variant={variant}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
        <IconTooltip label={label}>
          <span className="icon-chip" data-tone={variant === "primary" ? undefined : variant}>
            {icon}
          </span>
        </IconTooltip>
      </div>
      <p
        className={`text-xl font-bold font-mono-data text-foreground leading-tight ${valueClassName || ""}`}
        title={valueTitle}
      >
        {value}
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        {trend !== undefined && trend !== null && trend !== 0 && (
          <>
            {trend > 0 ? <ArrowUpRight className="h-3 w-3 kpi-up" /> : <ArrowDownRight className="h-3 w-3 kpi-down" />}
            <span className={`text-xs font-mono-data font-medium ${trend > 0 ? "kpi-up" : "kpi-down"}`}>
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
          </>
        )}
        {trend === 0 && <Minus className="h-3 w-3 kpi-neutral" />}
        {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
      </div>
      {series && series.length > 1 && (
        <div className="mt-auto -mx-1 pt-1.5">
          <Sparkline data={series} color={KPI_VARIANT_COLOR[variant]} height={24} />
        </div>
      )}
    </div>
  );
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return 0; // no change
  if (prev === 0) return null; // no baseline — don't show misleading spike
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

function AttentionPanel({ items, t }: { items: AttentionItem[]; t: (key: string) => string }) {
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

  const markAttentionChecked = useCallback(() => {
    localStorage.setItem("attention_last_checked", new Date().toISOString());
  }, []);

  return (
    <div className="glass-card p-5 animate-slide-up h-full">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        {t("dashboard.needsAttention")}
      </h3>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${severityStyles[item.severity]}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotStyles[item.severity]}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
                </div>
              </div>
              <Link
                to={item.link}
                onClick={markAttentionChecked}
                className="text-xs font-medium text-primary hover:underline whitespace-nowrap ml-2"
              >
                {item.linkLabel} →
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("dashboard.allClear")}</p>
      )}
    </div>
  );
}

/* ─── Dashboard ─── */
const Dashboard = () => {
  const [days, setDays] = useState(30);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const navigate = useNavigate();
  const { orgId, orgName, orgs, orgCreatedAt } = useOrg();
  const { t } = useTranslation();
  const { seoVisible, seoAdvanced } = useSeoVisibility();
  const { needsOnboarding, settings } = useSiteSettings();
  const { data: formsData } = useForms(orgId);

  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  // Previous period for comparison (same length, immediately before)
  const prevEndDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");
  const prevStartDate = format(subDays(startOfDay(new Date()), days * 2), "yyyy-MM-dd");

  const { data: realtimeData } = useDashboardOverview(orgId, startDate, endDate);
  const { data: prevPeriodData } = useDashboardOverview(orgId, prevStartDate, prevEndDate);
  const { data: alertsData } = useAlerts(orgId);
  const { data: sitesData } = useSites(orgId);

  // SEO movement (only fetch if SEO is visible)
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
    enabled: !!orgId && seoVisible,
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

  const { data: expiringSSL } = useQuery({
    queryKey: ["expiring_ssl", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("ssl_health").select("site_id, days_to_ssl_expiry")
        .eq("org_id", orgId).lt("days_to_ssl_expiry", 30).gt("days_to_ssl_expiry", 0);
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: unhealthyForms } = useQuery({
    queryKey: ["unhealthy_forms", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("form_health_checks").select("form_id, is_rendered, last_checked_at, page_url")
        .eq("org_id", orgId).eq("is_rendered", false);
      return data || [];
    },
    enabled: !!orgId,
  });

  // Security threats – only show events newer than last attention check
  const [attentionLastChecked, setAttentionLastChecked] = useState(() => localStorage.getItem("attention_last_checked"));
  const { data: recentSecurityEvents } = useQuery({
    queryKey: ["recent_security_events", orgId, attentionLastChecked],
    queryFn: async () => {
      if (!orgId) return [];
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const sinceTime = attentionLastChecked && attentionLastChecked > since24h ? attentionLastChecked : since24h;
      const { data } = await supabase
        .from("security_events").select("id, event_type, severity, title")
        .eq("org_id", orgId)
        .is("reviewed_at", null)
        .in("severity", ["high", "critical"])
        .gte("occurred_at", sinceTime)
        .limit(10);
      return data || [];
    },
    enabled: !!orgId,
  });

  // Stale SEO fixes (pending > 1 hour)
  const { data: staleSeoFixes } = useQuery({
    queryKey: ["stale_seo_fixes", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("seo_fix_queue").select("*", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "pending").lt("created_at", oneHourAgo);
      return count || 0;
    },
    enabled: !!orgId && seoVisible,
  });

  // Pending monitoring alerts (unsent)
  const { data: pendingAlerts } = useQuery({
    queryKey: ["pending_monitoring_alerts", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from("monitoring_alerts").select("*", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "pending");
      return count || 0;
    },
    enabled: !!orgId,
  });

  // Low SEO score
  const lowSeoScore = seoMovement && seoMovement.score !== null && seoMovement.score < 60;
  const seoScoreDrop = seoMovement && seoMovement.change < -10;

  const { data: formStartsCount } = useQuery({
    queryKey: ["form_starts_count", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from("form_submission_logs").select("*", { count: "exact", head: true })
        .eq("org_id", orgId).gte("occurred_at", `${startDate}T00:00:00Z`).lte("occurred_at", `${endDate}T23:59:59.999Z`);
      return count || 0;
    },
    enabled: !!orgId,
  });

  // Overview Form Fills KPI: count only leads captured live since install
  // (created_at >= org install date), excluding historical backfilled entries.
  // This keeps the Dashboard's headline number a "fresh start" while other
  // pages (Performance, Reports) continue to include imported history.
  const { data: freshLeadsCurrent } = useQuery({
    queryKey: ["dashboard_fresh_leads", orgId, startDate, endDate, orgCreatedAt],
    queryFn: async () => {
      if (!orgId) return 0;
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;
      const installCutoff = orgCreatedAt || dayStart;
      const cutoff = new Date(installCutoff) > new Date(dayStart) ? installCutoff : dayStart;
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .neq("status", "trashed")
        .gte("created_at", cutoff)
        .lte("created_at", dayEnd);
      return count || 0;
    },
    enabled: !!orgId,
  });

  const { data: freshLeadsPrevious } = useQuery({
    queryKey: ["dashboard_fresh_leads_prev", orgId, prevStartDate, prevEndDate, orgCreatedAt],
    queryFn: async () => {
      if (!orgId) return 0;
      const dayStart = `${prevStartDate}T00:00:00Z`;
      const dayEnd = `${prevEndDate}T23:59:59.999Z`;
      const installCutoff = orgCreatedAt || dayStart;
      const cutoff = new Date(installCutoff) > new Date(dayStart) ? installCutoff : dayStart;
      // If the entire previous window is before install, return 0
      if (new Date(cutoff) > new Date(dayEnd)) return 0;
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .neq("status", "trashed")
        .gte("created_at", cutoff)
        .lte("created_at", dayEnd);
      return count || 0;
    },
    enabled: !!orgId,
  });

  // Goal conversions for funnel widget
  const { data: goalFunnelData } = useQuery<GoalFunnelEntry[]>({
    queryKey: ["funnel_goal_conversions", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      const { data: goals } = await supabase
        .from("conversion_goals" as any)
        .select("id,name,goal_type,tracking_rules")
        .eq("org_id", orgId)
        .eq("is_active", true);

      if (!goals || goals.length === 0) return [];

      // Count from goal_completions
      const { data: completions } = await supabase
        .from("goal_completions" as any)
        .select("goal_id")
        .eq("org_id", orgId)
        .gte("completed_at", dayStart)
        .lte("completed_at", dayEnd);

      const countMap: Record<string, number> = {};
      (completions || []).forEach((c: any) => {
        countMap[c.goal_id] = (countMap[c.goal_id] || 0) + 1;
      });

      // Count form_submission goals from leads table
      const formGoals = (goals as any[]).filter(g => g.goal_type === "form_submission");
      for (const goal of formGoals) {
        const rules = goal.tracking_rules || {};
        let query = supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd);
        if (rules.form_id && rules.form_id !== "all") {
          query = query.eq("form_id", rules.form_id);
        }
        const { count } = await query;
        countMap[goal.id] = (countMap[goal.id] || 0) + (count || 0);
      }

      // Fallback: count click goals from raw events if no completions
      const CLICK_TYPES = ["cta_click", "outbound_click", "tel_click", "mailto_click"];
      const clickGoals = (goals as any[]).filter(g => CLICK_TYPES.includes(g.goal_type));
      for (const goal of clickGoals) {
        if ((countMap[goal.id] || 0) > 0) continue;
        const rules = goal.tracking_rules || {};
        const { data: events } = await supabase
          .from("events")
          .select("target_text,meta,session_id")
          .eq("org_id", orgId)
          .in("event_type", CLICK_TYPES)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd)
          .limit(1000);
        if (events) {
          const matchedSessions = new Set<string>();
          (events as any[]).forEach((evt) => {
            const text = (evt.target_text || "").toLowerCase();
            const label = String((evt.meta as any)?.target_label || "").toLowerCase();
            const href = String((evt.meta as any)?.target_href || "").toLowerCase();
            if (rules.text_contains) {
              const needle = String(rules.text_contains).toLowerCase();
              if (!text.includes(needle) && !label.includes(needle)) return;
            }
            if (rules.href_contains) {
              const needle = String(rules.href_contains).toLowerCase();
              if (!href.includes(needle) && !text.includes(needle)) return;
            }
            matchedSessions.add(evt.session_id || evt.occurred_at);
          });
          countMap[goal.id] = matchedSessions.size;
        }
      }

      return (goals as any[]).map(g => ({
        name: g.name,
        count: countMap[g.id] || 0,
      }));
    },
    enabled: !!orgId,
  });

  // Calculate org age to suppress misleading comparisons for new orgs
  const orgAgeDays = useMemo(() => {
    if (!orgCreatedAt) return Infinity;
    return Math.floor((Date.now() - new Date(orgCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
  }, [orgCreatedAt]);
  // Suppress period-over-period comparisons unless we have at least a full prior
  // period of tracking history. Showing "+1350% vs last period" when the prior
  // window only had 1 session is misleading — wait until the org has been
  // tracking for at least 2× the selected range so the comparison is meaningful.
  const orgTooNewForComparison = orgAgeDays < days * 2;

  const isLoading = !realtimeData;

  const periodData = useMemo(() => {
    const curr = realtimeData || { totalSessions: 0, totalLeads: 0 };
    const prev = prevPeriodData || { totalSessions: 0, totalLeads: 0 };
    // Include goal conversions in overall CVR.
    // NOTE: A single session can fire multiple goal events (e.g. mailto + form),
    // so we cap conversions at the session count to keep CVR ≤ 100% until we
    // have proper session-level dedup of goal events.
    const goalTotal = (goalFunnelData || []).reduce((s: number, g: any) => s + (g.count || 0), 0);
    const rawConversions = curr.totalLeads + goalTotal;
    const currConversions = Math.min(rawConversions, curr.totalSessions);
    const currCvr = curr.totalSessions > 0 ? currConversions / curr.totalSessions : 0;
    const prevCvr = prev.totalSessions > 0 ? Math.min(prev.totalLeads, prev.totalSessions) / prev.totalSessions : 0;
    return {
      sessions: { current: curr.totalSessions, previous: prev.totalSessions },
      leads: { current: curr.totalLeads, previous: prev.totalLeads },
      cvr: { current: currCvr, previous: prevCvr },
    };
  }, [realtimeData, prevPeriodData, goalFunnelData]);

  // Per-KPI sparkline series, derived from dailyMap if available
  const kpiSeries = useMemo(() => {
    const dailyMap = (realtimeData as any)?.dailyMap as Record<string, { sessions: number; leads: number; pageviews: number }> | undefined;
    if (!dailyMap) return { sessions: [] as number[], leads: [] as number[], cvr: [] as number[] };
    const ordered = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b));
    return {
      sessions: ordered.map(([, v]) => v.sessions),
      leads: ordered.map(([, v]) => v.leads),
      cvr: ordered.map(([, v]) => (v.sessions > 0 ? (v.leads / v.sessions) * 100 : 0)),
    };
  }, [realtimeData]);

  const topSource = useMemo(() => {
    const sources = realtimeData?.sources || [];
    if (sources.length === 0) return null;
    const sorted = [...sources].sort((a: any, b: any) => (b.sessions || b.count || 0) - (a.sessions || a.count || 0));
    return sorted[0];
  }, [realtimeData]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    // Active downtime incidents
    if (activeIncidents && activeIncidents.length > 0) {
      items.push({
        severity: "critical",
        label: t("dashboard.activeIncidents", { count: activeIncidents.length }),
        detail: activeIncidents.map((i) => i.type).join(", "),
        link: "/monitoring",
        linkLabel: t("dashboard.view"),
      });
    }
    // Security threats
    if (recentSecurityEvents && recentSecurityEvents.length > 0) {
      const critCount = recentSecurityEvents.filter((e) => e.severity === "critical").length;
      items.push({
        severity: critCount > 0 ? "critical" : "warning",
        label: t("dashboard.securityEvents", { count: recentSecurityEvents.length }),
        detail: recentSecurityEvents[0]?.title || t("dashboard.potentialThreat"),
        link: "/security",
        linkLabel: t("dashboard.review"),
      });
    }
    // Conversion drops (suppress for new orgs)
    if (!orgTooNewForComparison) {
      const convDrops = (alertsData || []).filter(
        (a) => a.severity === "warning" && a.title?.toLowerCase().includes("conversion")
      );
      if (convDrops.length > 0) {
        items.push({ severity: "warning", label: t("dashboard.conversionDropped"), detail: convDrops[0].title, link: "/performance", linkLabel: t("dashboard.investigate") });
      }
    }
    // Broken links
    if (brokenLinksCount && brokenLinksCount > 0) {
      items.push({ severity: "warning", label: t("dashboard.brokenLinks", { count: brokenLinksCount }), detail: t("dashboard.mayAffectUxSeo"), link: "/monitoring?tab=broken-links", linkLabel: t("dashboard.view") });
    }
    // Domain expiry
    if (expiringDomains && expiringDomains.length > 0) {
      const minDays = Math.min(...expiringDomains.map((d) => d.days_to_domain_expiry || 999));
      items.push({ severity: minDays <= 5 ? "critical" : "warning", label: t("dashboard.domainExpiring"), detail: expiringDomains.map((d) => `${d.domain} (${d.days_to_domain_expiry}d)`).join(", "), link: "/monitoring", linkLabel: t("dashboard.view") });
    }
    // SSL expiry
    if (expiringSSL && expiringSSL.length > 0) {
      const minDays = Math.min(...expiringSSL.map((s) => s.days_to_ssl_expiry || 999));
      items.push({ severity: minDays <= 5 ? "critical" : "warning", label: t("dashboard.sslExpiring"), detail: t("dashboard.sslCertsExpiring", { count: expiringSSL.length }), link: "/monitoring", linkLabel: t("dashboard.view") });
    }
    // Unhealthy forms
    if (unhealthyForms && unhealthyForms.length > 0) {
      items.push({ severity: "warning", label: t("dashboard.formsNotRendering", { count: unhealthyForms.length }), detail: t("dashboard.formsBrokenMissing"), link: "/forms", linkLabel: t("dashboard.check") });
    }
    // SEO score issues (only if SEO is visible)
    if (seoVisible && lowSeoScore) {
      items.push({ severity: "warning", label: t("dashboard.seoScoreLow", { score: seoMovement?.score }), detail: t("dashboard.reviewSeoIssues"), link: "/seo", linkLabel: t("dashboard.fix") });
    } else if (seoVisible && seoScoreDrop) {
      items.push({ severity: "warning", label: t("dashboard.seoScoreDropped", { points: Math.abs(seoMovement!.change) }), detail: t("dashboard.recentScanIssues"), link: "/seo", linkLabel: t("dashboard.review") });
    }
    // Stale SEO fixes (only if SEO is visible)
    if (seoVisible && staleSeoFixes && staleSeoFixes > 0) {
      items.push({ severity: "warning", label: t("dashboard.staleSeoFixes", { count: staleSeoFixes }), detail: t("dashboard.pluginCronStuck"), link: "/seo", linkLabel: t("dashboard.view") });
    }
    // Pending monitoring alerts
    if (pendingAlerts && pendingAlerts > 0) {
      items.push({ severity: "info", label: t("dashboard.pendingAlerts", { count: pendingAlerts }), detail: t("dashboard.alertsAwaitingDelivery"), link: "/monitoring", linkLabel: t("dashboard.view") });
    }
    return items;
  }, [activeIncidents, recentSecurityEvents, alertsData, brokenLinksCount, expiringDomains, expiringSSL, unhealthyForms, lowSeoScore, seoScoreDrop, seoMovement, staleSeoFixes, pendingAlerts, seoVisible, orgTooNewForComparison, t]);

  // Redirect to setup if current org has no connected sites (skip in preview).
  // Important: do NOT redirect while the onboarding modal still needs to be shown —
  // otherwise the modal mounts and is immediately unmounted by the navigation,
  // causing it to "flash" and disappear before the user can answer the questions.
  const isPreview = typeof window !== "undefined" && (window.location.hostname.includes("lovableproject.com") || window.location.hostname.includes("id-preview--"));
  useEffect(() => {
    if (!isPreview && !isLoading && !needsOnboarding && sitesData && sitesData.length === 0 && orgId) {
      navigate("/settings?tab=setup", { replace: true });
    }
  }, [isPreview, isLoading, needsOnboarding, sitesData, orgId, navigate]);

  return (
    <div>
      {needsOnboarding && orgs && orgs.length > 0 && <OnboardingModal />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold text-foreground">{t("dashboard.overview")}</h1>
            <HowToButton {...HOWTO_DASHBOARD} />
          </div>
          <p className="text-sm text-muted-foreground">{orgName}</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector selectedDays={days} onDaysChange={setDays} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddSiteOpen(true)}
            className="h-8 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Site
          </Button>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-success/10 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" />
            <span className="text-xs font-medium text-success">{t("dashboard.live")}</span>
          </div>
        </div>
      </div>

      <AddSiteModal
        open={addSiteOpen}
        onOpenChange={setAddSiteOpen}
        isFirstSite={!sitesData || sitesData.length === 0}
      />

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
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("dashboard.noOrgYet")}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t("dashboard.noOrgDesc")}</p>
          <button onClick={() => navigate("/onboarding")} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            {t("dashboard.setupOrg")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Row 1 – 6 KPI Cards */}
          <div className={`grid grid-cols-2 md:grid-cols-3 ${seoAdvanced ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-3`}>
            <KPICard
              variant="primary"
              label={`${t("dashboard.sessions")} (${days}d)`}
              value={periodData.sessions.current.toLocaleString()}
              trend={orgTooNewForComparison ? null : pctChange(periodData.sessions.current, periodData.sessions.previous)}
              icon={<Globe className="h-4 w-4" />}
              series={kpiSeries.sessions}
            />
            <KPICard
              variant="success"
              label={`${t("dashboard.formFills")} (${days}d)`}
              value={(freshLeadsCurrent ?? 0).toLocaleString()}
              valueTitle="Counted from your install date forward — historical imports excluded on the Overview."
              trend={orgTooNewForComparison ? null : pctChange(freshLeadsCurrent ?? 0, freshLeadsPrevious ?? 0)}
              icon={<TrendingUp className="h-4 w-4" />}
              series={kpiSeries.leads}
            />
            <KPICard
              variant="warning"
              label={t("dashboard.conversionRate")}
              value={`${(periodData.cvr.current * 100).toFixed(1)}%`}
              trend={orgTooNewForComparison ? null : pctChange(periodData.cvr.current, periodData.cvr.previous)}
              icon={<BarChart3 className="h-4 w-4" />}
              series={kpiSeries.cvr}
            />
            <KPICard
              variant="info"
              label={t("dashboard.topSource")}
              value={topSource?.source || "—"}
              valueClassName="text-xs font-medium truncate"
              valueTitle={topSource?.source || undefined}
              sub={topSource ? `${topSource.sessions} ${t("common.sessions")}` : undefined}
              icon={<Megaphone className="h-4 w-4" />}
            />
            <div
              className="kpi-card p-4 animate-slide-up min-h-[132px] flex flex-col"
              data-variant={attentionItems.length === 0 ? "success" : attentionItems.some(i => i.severity === "critical") ? "warning" : "warning"}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{t("dashboard.needsAttention")}</span>
                <span
                  className="icon-chip"
                  data-tone={attentionItems.length === 0 ? "success" : attentionItems.some(i => i.severity === "critical") ? "warning" : "warning"}
                >
                  {attentionItems.length === 0 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : attentionItems.some(i => i.severity === "critical") ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </span>
              </div>
              {attentionItems.length > 0 ? (
                <div className="space-y-1.5 max-h-[80px] overflow-y-auto">
                  {attentionItems.map((item, i) => (
                    <Link key={i} to={item.link} onClick={() => { const ts = new Date().toISOString(); localStorage.setItem("attention_last_checked", ts); setAttentionLastChecked(ts); }} className="flex items-center gap-1.5 group">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.severity === "critical" ? "bg-destructive" : item.severity === "warning" ? "bg-warning" : "bg-primary"}`} />
                      <span className="text-xs text-foreground group-hover:text-primary truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold font-mono-data text-success">0</span>
                  <span className="text-xs font-medium text-success">{t("dashboard.allClearShort")}</span>
                </div>
              )}
            </div>
            {seoAdvanced && (
              <KPICard
                label={t("dashboard.seoScore")}
                value={seoMovement?.score ?? "—"}
                trend={seoMovement?.change || undefined}
                sub={seoMovement ? undefined : t("dashboard.noScanYet")}
                icon={<Search className="h-4 w-4" />}
                accent={seoMovement ? (seoMovement.change >= 0 ? "text-success" : "text-destructive") : "text-muted-foreground"}
              />
            )}
          </div>


          {/* AI Insights – auto-generates on load */}
          <AiInsights
            orgId={orgId}
            metrics={{
              sessionsThisWeek: periodData.sessions.current,
              sessionsLastWeek: periodData.sessions.previous,
              leadsThisWeek: periodData.leads.current,
              leadsLastWeek: periodData.leads.previous,
              cvrThisWeek: periodData.cvr.current,
              cvrLastWeek: periodData.cvr.previous,
              topSource: topSource?.source,
              totalForms: formsData?.length || 0,
              primaryFocus: settings?.primary_focus || "lead_volume",
            }}
          />

          {/* Row 3 – Latest Summary */}
          <LatestSummary />

          {/* Row 4 – Key insights stacked */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WhatsWorking />
            <FunnelWidget
              totalSessions={realtimeData?.totalSessions || 0}
              totalPageviews={realtimeData?.totalPageviews || 0}
              totalLeads={realtimeData?.totalLeads || 0}
              formStarts={formStartsCount || undefined}
              goalConversions={goalFunnelData || undefined}
            />
          </div>
          <RevenueWidget orgId={orgId} startDate={startDate} endDate={endDate} />
          <TopPagesAndSources startDate={startDate} endDate={endDate} />
        </div>
      )}

      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>{t("dashboard.freshData")}</span>
      </div>
    </div>
  );
};

export default Dashboard;
