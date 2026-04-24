import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { Shield, ChevronLeft, Download, Search, Filter, Eye, DollarSign, Users, TrendingUp, AlertTriangle, BarChart3, ArrowUpDown, KeyRound, RotateCcw, XCircle, ExternalLink, Loader2, CalendarIcon, Activity, UserCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AdminCustomerDetail } from "@/components/admin/AdminCustomerDetail";
import ImportHealthPanel from "@/components/admin/ImportHealthPanel";
import SubscriberSitesPanel from "@/components/admin/SubscriberSitesPanel";
import ReleaseQAPanel from "@/components/admin/ReleaseQAPanel";
import DataWipePanel from "@/components/admin/DataWipePanel";
import SupportAccessPanel from "@/components/admin/SupportAccessPanel";

const OWNER_EMAIL = "david@newuniformdesign.com";

function FeatureUsageWidget() {
  const { data: featureUsage } = useQuery({
    queryKey: ["feature_usage"],
    queryFn: async () => {
      // Unique users who logged in (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: recentLogins } = await (supabase as any)
        .from("login_events")
        .select("email")
        .gte("logged_in_at", thirtyDaysAgo);
      const uniqueUsers30d = new Set((recentLogins || []).map((r: any) => r.email)).size;

      // Total unique users ever
      const { data: allLogins } = await (supabase as any)
        .from("login_events")
        .select("email");
      const uniqueUsersTotal = new Set((allLogins || []).map((r: any) => r.email)).size;

      // Feature adoption: count distinct orgs using each feature
      const [pvRes, evRes, leadsRes, blRes, fhRes, gcRes, seoRes] = await Promise.all([
        supabase.from("pageviews").select("org_id").limit(1000),
        supabase.from("events").select("event_type, org_id").limit(1000),
        supabase.from("leads").select("org_id").limit(1000),
        supabase.from("broken_links").select("org_id").limit(1000),
        supabase.from("form_health_checks").select("org_id").limit(1000),
        supabase.from("goal_completions").select("org_id").limit(1000),
        supabase.from("seo_fix_queue").select("org_id").limit(1000),
      ]);

      const countDistinctOrgs = (rows: any[] | null) => new Set((rows || []).map((r: any) => r.org_id)).size;
      const eventsByType = (rows: any[] | null, type: string) => 
        new Set((rows || []).filter((r: any) => r.event_type === type).map((r: any) => r.org_id)).size;

      const features = [
        { name: "Pageview Tracking", count: countDistinctOrgs(pvRes.data) },
        { name: "Lead Submissions", count: countDistinctOrgs(leadsRes.data) },
        { name: "CTA Clicks", count: eventsByType(evRes.data, "cta_click") },
        { name: "Form Starts", count: eventsByType(evRes.data, "form_start") },
        { name: "Outbound Clicks", count: eventsByType(evRes.data, "outbound_click") },
        { name: "Phone Clicks", count: eventsByType(evRes.data, "tel_click") },
        { name: "Email Clicks", count: eventsByType(evRes.data, "mailto_click") },
        { name: "Download Clicks", count: eventsByType(evRes.data, "download_click") },
        { name: "Form Health Checks", count: countDistinctOrgs(fhRes.data) },
        { name: "SEO Fixes", count: countDistinctOrgs(seoRes.data) },
        { name: "Broken Links", count: countDistinctOrgs(blRes.data) },
        { name: "Goal Completions", count: countDistinctOrgs(gcRes.data) },
      ].sort((a, b) => b.count - a.count);

      return { features, uniqueUsers30d, uniqueUsersTotal };
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Feature Usage (All Orgs)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {featureUsage ? (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="rounded-md bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Active users (30d)</p>
                <p className="text-lg font-bold">{featureUsage.uniqueUsers30d}</p>
              </div>
              <div className="rounded-md bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Total unique users</p>
                <p className="text-lg font-bold">{featureUsage.uniqueUsersTotal}</p>
              </div>
            </div>
            {featureUsage?.features?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Feature</TableHead>
                    <TableHead className="text-xs text-right">Orgs Using</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featureUsage.features.map((f, i) => (
                    <TableRow key={f.name}>
                      <TableCell className="text-xs text-muted-foreground font-mono w-8">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{f.name}</TableCell>
                      <TableCell className="text-sm font-mono text-right">{f.count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function AiUsageWidget() {
  const { data: aiData } = useQuery({
    queryKey: ["owner_ai_usage"],
    queryFn: async () => {
      // Get total calls and per-org breakdown from ai_usage_log
      const { data: logs, error } = await supabase
        .from("ai_usage_log")
        .select("function_name, org_id, created_at");
      if (error) throw error;

      // Get org names
      const { data: orgs } = await supabase.from("orgs").select("id, name");
      const orgMap: Record<string, string> = {};
      orgs?.forEach((o: any) => { orgMap[o.id] = o.name; });

      // Per-org totals
      const orgTotals: Record<string, number> = {};
      const funcTotals: Record<string, number> = {};
      (logs || []).forEach((l: any) => {
        orgTotals[l.org_id] = (orgTotals[l.org_id] || 0) + 1;
        funcTotals[l.function_name] = (funcTotals[l.function_name] || 0) + 1;
      });

      const totalCalls = logs?.length || 0;
      const orgCount = Object.keys(orgTotals).length;
      const avgPerOrg = orgCount > 0 ? (totalCalls / orgCount).toFixed(1) : "0";

      const topOrgs = Object.entries(orgTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ name: orgMap[id] || id.slice(0, 8), count }));

      const topFunctions = Object.entries(funcTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      return { totalCalls, avgPerOrg, topOrgs, topFunctions };
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">AI Usage</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total AI calls</span>
          <span className="font-mono font-medium text-foreground">{aiData?.totalCalls?.toLocaleString() || 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Avg calls/org</span>
          <span className="font-mono font-medium text-foreground">{aiData?.avgPerOrg || "0"}</span>
        </div>
        {aiData?.topFunctions && aiData.topFunctions.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted-foreground pt-1">Top Functions</p>
            {aiData.topFunctions.map((f) => (
              <div key={f.name} className="flex justify-between text-xs">
                <span className="text-foreground truncate max-w-[160px]">{f.name}</span>
                <Badge variant="outline" className="text-[10px]">{f.count}</Badge>
              </div>
            ))}
          </>
        )}
        {aiData?.topOrgs && aiData.topOrgs.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted-foreground pt-1">Top Orgs</p>
            {aiData.topOrgs.map((o) => (
              <div key={o.name} className="flex justify-between text-xs">
                <span className="text-foreground truncate max-w-[160px]">{o.name}</span>
                <Badge variant="secondary" className="text-[10px]">{o.count} calls</Badge>
              </div>
            ))}
          </>
        )}
        {!aiData && <p className="text-xs text-muted-foreground">Loading…</p>}
      </CardContent>
    </Card>
  );
}

function AcquisitionWidget({ subscribers }: { subscribers: any[] }) {
  const referralCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subscribers.forEach((s: any) => {
      const src = s.referral_source || "Direct / Unknown";
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [subscribers]);

  // Also derive from site_url domain as a secondary signal
  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subscribers.forEach((s: any) => {
      if (s.site_url) {
        try {
          const domain = new URL(s.site_url.startsWith("http") ? s.site_url : `https://${s.site_url}`).hostname.replace(/^www\./, "");
          counts[domain] = (counts[domain] || 0) + 1;
        } catch { /* skip */ }
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [subscribers]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Acquisition</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {referralCounts.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted-foreground">Referral Source</p>
            {referralCounts.map(([src, count]) => (
              <div key={src} className="flex justify-between text-sm">
                <span className="text-foreground">{src}</span>
                <Badge variant="outline" className="text-[10px]">{count}</Badge>
              </div>
            ))}
          </>
        )}
        {domainCounts.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted-foreground pt-1">Customer Domains</p>
            {domainCounts.map(([domain, count]) => (
              <div key={domain} className="flex justify-between text-sm">
                <span className="text-foreground truncate max-w-[160px]">{domain}</span>
                <Badge variant="secondary" className="text-[10px]">{count}</Badge>
              </div>
            ))}
          </>
        )}
        {referralCounts.length === 0 && domainCounts.length === 0 && (
          <p className="text-sm text-muted-foreground">No data yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSetup() {
  const { t } = useTranslation();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL;
  // Admins (e.g. Annie) can view the same admin panels as the owner.
  // Destructive actions (Data Wipe, Remove client) stay owner-only.
  const isAdminUser = isAdmin || isOwner;
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"clients" | "metrics" | "subscriber-sites" | "release-qa" | "data-wipe" | "support-access">("metrics");
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "clients" || tab === "metrics" || tab === "subscriber-sites" || tab === "release-qa" || tab === "data-wipe" || tab === "support-access") {
      setActiveMainTab(tab);
    } else if (tab === "app-bible") {
      // Legacy redirect: Launch Checklist removed, send users to Release QA
      setActiveMainTab("release-qa");
      setSearchParams({ tab: "release-qa" }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const switchMainTab = (tab: "clients" | "metrics" | "subscriber-sites" | "release-qa" | "data-wipe" | "support-access") => {
    setActiveMainTab(tab);
    setSearchParams({ tab }, { replace: true });
  };
  const [filterFocus, setFilterFocus] = useState<string>("");
  const [filterOnboarding, setFilterOnboarding] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [logPage, setLogPage] = useState(0);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const LOG_PAGE_SIZE = 20;

  // Client-tier orgs (no monthly charge)
  const CLIENT_TIER_NAMES = ["new uniform", "apyx", "georgia bone"];
  const isClientTier = (name: string) => CLIENT_TIER_NAMES.some((n) => name.toLowerCase().includes(n));

  const focusLabels: Record<string, string> = {
    lead_volume: t("admin.growLeadVolume"),
    marketing_impact: t("admin.marketingImpactLabel"),
    conversion_performance: t("admin.conversionPerformanceLabel"),
    paid_optimization: t("admin.paidOptimizationLabel"),
    get_more_leads: t("admin.getMoreLeads"),
    prove_roi: t("admin.proveRoi"),
    improve_conversion: t("admin.improveConversion"),
    reduce_ad_waste: t("admin.reduceAdWaste"),
  };

  // Fetch all orgs + settings + sites
  const { data: orgsData } = useQuery({
    queryKey: ["admin_orgs_setup"],
    queryFn: async () => {
      const { data: orgs, error } = await supabase.from("orgs").select("id, name, created_at");
      if (error) throw error;
      return orgs;
    },
  });

  const { data: allSettings } = useQuery({
    queryKey: ["admin_all_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: allSites } = useQuery({
    queryKey: ["admin_all_sites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("id, domain, org_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: latestEvents } = useQuery({
    queryKey: ["admin_latest_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_input_events")
        .select("org_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: onboardingResponse } = useQuery({
    queryKey: ["admin_onboarding", selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return null;
      const { data, error } = await supabase
        .from("onboarding_responses")
        .select("*")
        .eq("org_id", selectedOrg)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg,
  });

  const { data: orgEvents } = useQuery({
    queryKey: ["admin_org_events", selectedOrg, logPage],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const { data, error } = await supabase
        .from("user_input_events")
        .select("*")
        .eq("org_id", selectedOrg)
        .order("created_at", { ascending: false })
        .range(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg,
  });

  // Owner-only: subscriber metrics
  const [subSortKey, setSubSortKey] = useState<"created_at" | "mrr" | "last_active_date" | "churn_date">("created_at");
  const [subSortAsc, setSubSortAsc] = useState(false);
  const [subSearch, setSubSearch] = useState("");
  const [managingSub, setManagingSub] = useState<string | null>(null);
  const [billingData, setBillingData] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEmail, setDetailEmail] = useState<string | null>(null);
  const [detailSubscriberId, setDetailSubscriberId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [recalcingMrr, setRecalcingMrr] = useState(false);

  const openDetail = (sub: any) => {
    setDetailEmail(sub.email);
    setDetailSubscriberId(sub.id);
    setDetailOpen(true);
  };

  const handleRecalcMrr = async () => {
    setRecalcingMrr(true);
    try {
      const { data, error } = await supabase.functions.invoke("recalc-subscriber-mrr");
      if (error) throw error;
      const updated = (data as any)?.updated ?? 0;
      const processed = (data as any)?.processed ?? 0;
      toast.success(`Recalculated MRR — ${updated} of ${processed} subscribers updated`);
      queryClient.invalidateQueries({ queryKey: ["owner_subscribers"] });
    } catch (e: any) {
      toast.error(e?.message || "MRR recalculation failed");
    } finally {
      setRecalcingMrr(false);
    }
  };

  const handleDeleteOrg = async (orgId: string, orgName: string) => {
    const confirmation = window.prompt(
      `This will permanently delete "${orgName}" and ALL associated data (sites, leads, events, settings, members, etc.). This cannot be undone.\n\nType the organization name to confirm:`
    );
    if (confirmation !== orgName) {
      if (confirmation !== null) toast.error("Name did not match. Deletion cancelled.");
      return;
    }
    setDeletingOrgId(orgId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-org", {
        body: { orgId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Removed "${orgName}"`);
      queryClient.invalidateQueries({ queryKey: ["admin_orgs_setup"] });
      queryClient.invalidateQueries({ queryKey: ["admin_all_settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin_all_sites"] });
      queryClient.invalidateQueries({ queryKey: ["owner_subscribers"] });
      if (selectedOrg === orgId) setSelectedOrg(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete organization");
    } finally {
      setDeletingOrgId(null);
    }
  };

  const { data: subscribers = [] } = useQuery({
    queryKey: ["owner_subscribers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscribers").select("*");
      if (error) throw error;
      // Enrich with profile data (name, address, phone)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email, full_name, phone, address_line1, address_line2, city, state, postal_code, country");
      const profileMap = new Map((profiles || []).map((p: any) => [p.email, p]));
      return (data || []).map((s: any) => ({
        ...s,
        _profile: profileMap.get(s.email) || null,
      }));
    },
    enabled: isAdminUser,
  });

  const { data: errorLogs = [] } = useQuery({
    queryKey: ["owner_errors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
    enabled: isAdminUser,
  });

  // A sub only counts toward MRR if status is active AND mrr > 0.
  // The mrr > 0 check excludes free-code / 100%-discount subscribers whose
  // recalculated effective MRR is zero.
  const activeSubs = useMemo(() => subscribers.filter((s: any) => s.status === "active"), [subscribers]);
  const payingSubs = useMemo(() => activeSubs.filter((s: any) => Number(s.mrr || 0) > 0), [activeSubs]);
  const churnedSubs = useMemo(() => subscribers.filter((s: any) => s.status === "churned"), [subscribers]);
  const pastDueSubs = useMemo(() => subscribers.filter((s: any) => s.status === "past_due"), [subscribers]);
  const totalMrr = useMemo(() => payingSubs.reduce((sum: number, s: any) => sum + Number(s.mrr || 0), 0), [payingSubs]);
  const avgArpu = payingSubs.length ? totalMrr / payingSubs.length : 0;
  const churnRateVal = subscribers.length ? ((churnedSubs.length / subscribers.length) * 100).toFixed(1) : "0";

  const nowDate = new Date();
  const thisMonthStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const signupsThisMonth = subscribers.filter((s: any) => s.created_at?.startsWith(thisMonthStr)).length;
  const signupsLastMonth = subscribers.filter((s: any) => s.created_at?.startsWith(lastMonthStr)).length;




  const sortedSubs = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    const filtered = q
      ? subscribers.filter((s: any) => {
          const name = (s._profile?.full_name || "").toLowerCase();
          const email = (s.email || "").toLowerCase();
          return name.includes(q) || email.includes(q);
        })
      : subscribers;
    return [...filtered].sort((a: any, b: any) => {
      const av = a[subSortKey] ?? "";
      const bv = b[subSortKey] ?? "";
      return subSortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [subscribers, subSortKey, subSortAsc, subSearch]);

  const toggleSubSort = (key: "created_at" | "mrr" | "last_active_date" | "churn_date") => {
    if (subSortKey === key) setSubSortAsc(!subSortAsc);
    else { setSubSortKey(key); setSubSortAsc(false); }
  };

  const loadBilling = async (email: string) => {
    if (managingSub === email) { setManagingSub(null); setBillingData(null); return; }
    setManagingSub(email);
    setBillingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "get_subscriber_billing", email },
      });
      if (error) throw error;
      setBillingData(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load billing");
      setBillingData(null);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    setActionLoading("reset-" + email);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "send_password_reset", email },
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefund = async (chargeId: string) => {
    if (!confirm("Are you sure you want to issue a full refund for this charge?")) return;
    setActionLoading("refund-" + chargeId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "refund_charge", charge_id: chargeId },
      });
      if (error) throw error;
      toast.success(`Refund processed: $${data.refund.amount}`);
      if (managingSub) loadBilling(managingSub);
    } catch (err: any) {
      toast.error(err.message || "Refund failed");
    } finally {
      setActionLoading(null);
    }
  };

  const [cancelDatePickerSub, setCancelDatePickerSub] = useState<string | null>(null);
  const [cancelDate, setCancelDate] = useState<Date | undefined>(undefined);

  const handleCancelSub = async (subscriptionId: string, immediate: boolean) => {
    const msg = immediate ? "Cancel immediately? The customer will lose access now." : "Cancel at end of billing period?";
    if (!confirm(msg)) return;
    setActionLoading("cancel-" + subscriptionId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "cancel_subscription", subscription_id: subscriptionId, immediate },
      });
      if (error) throw error;
      toast.success(immediate ? "Subscription cancelled immediately" : "Subscription will cancel at period end");
      if (managingSub) loadBilling(managingSub);
    } catch (err: any) {
      toast.error(err.message || "Cancel failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSubOnDate = async (subscriptionId: string) => {
    if (!cancelDate) { toast.error("Please select a date"); return; }
    if (!confirm(`Cancel subscription on ${format(cancelDate, "PPP")}?`)) return;
    setActionLoading("cancel-" + subscriptionId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "cancel_subscription", subscription_id: subscriptionId, cancel_at: cancelDate.toISOString() },
      });
      if (error) throw error;
      toast.success(`Subscription will cancel on ${format(cancelDate, "PPP")}`);
      setCancelDatePickerSub(null);
      setCancelDate(undefined);
      if (managingSub) loadBilling(managingSub);
    } catch (err: any) {
      toast.error(err.message || "Cancel failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (sub: any) => {
    if (!confirm(`Permanently delete ${sub.email}? This cannot be undone.`)) return;
    setActionLoading("delete-" + sub.email);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "delete_user",
          subscriber_id: sub.id,
          email: typeof sub.email === "string" ? sub.email.trim().toLowerCase() : undefined,
        },
      });
      if (error) {
        const body = error?.context?.body
          ? await new Response(error.context.body).json().catch(() => null)
          : null;
        throw new Error(body?.error || error.message || "Delete failed");
      }
      if (data?.error) throw new Error(data.error);


      toast.success(data?.deleted_user ? `User ${sub.email} deleted` : `Subscriber ${sub.email} deleted`);
      queryClient.invalidateQueries({ queryKey: ["owner_subscribers"] });
      setManagingSub(null);
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setActionLoading(null);
    }
  };

  const enrichedOrgs = useMemo(() => {
    if (!orgsData) return [];
    const settingsMap: Record<string, any> = {};
    allSettings?.forEach((s) => { settingsMap[s.org_id] = s; });
    const sitesMap: Record<string, any[]> = {};
    allSites?.forEach((s) => { if (!sitesMap[s.org_id]) sitesMap[s.org_id] = []; sitesMap[s.org_id].push(s); });
    const lastEventMap: Record<string, string> = {};
    latestEvents?.forEach((e) => { if (!lastEventMap[e.org_id]) lastEventMap[e.org_id] = e.created_at; });

    return orgsData.map((org) => ({
      ...org,
      settings: settingsMap[org.id] || null,
      sites: sitesMap[org.id] || [],
      lastEvent: lastEventMap[org.id] || null,
    })).filter((org) => {
      if (searchQuery && !org.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterFocus && org.settings?.primary_focus !== filterFocus) return false;
      if (filterOnboarding === "complete" && !org.settings?.onboarding_completed) return false;
      if (filterOnboarding === "incomplete" && org.settings?.onboarding_completed) return false;
      return true;
    });
  }, [orgsData, allSettings, allSites, latestEvents, searchQuery, filterFocus, filterOnboarding]);

  const selectedOrgName = orgsData?.find((o) => o.id === selectedOrg)?.name;
  const selectedSettings = allSettings?.find((s) => s.org_id === selectedOrg);

  const exportJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = (rows: any[], filename: string) => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const [activeTab, setActiveTab] = useState<"answers" | "log" | "exports">("answers");

  if (roleLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    navigate("/dashboard");
    return null;
  }

  // Detail view
  if (selectedOrg) {
    return (
      <div>
        <button onClick={() => setSelectedOrg(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ChevronLeft className="h-4 w-4" /> {t("admin.backToSites")}
        </button>
        <h1 className="text-xl font-bold text-foreground mb-1">{selectedOrgName}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t("admin.auditTrail")}</p>

        <div className="flex gap-1 mb-6 border-b border-border">
          {(["answers", "log", "exports"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "answers" ? t("admin.onboardingAnswers") : tab === "log" ? t("admin.changeLog") : t("admin.exports")}
            </button>
          ))}
        </div>

        {activeTab === "answers" && (
          <div className="space-y-4">
            <div className="glass-card p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("admin.primaryFocus")}</p>
                  <p className="text-sm font-medium text-foreground">{focusLabels[selectedSettings?.primary_focus || selectedSettings?.primary_goal] || t("admin.notSet")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("admin.onboarding")}</p>
                  <p className="text-sm font-medium text-foreground">{selectedSettings?.onboarding_completed ? `✅ ${t("admin.complete")}` : `⏳ ${t("admin.incomplete")}`}</p>
                </div>
              </div>
              {onboardingResponse && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("admin.completedAt")}</p>
                    <p className="text-sm text-foreground">{format(new Date(onboardingResponse.completed_at), "PPp")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("admin.leadForms")}</p>
                    <div className="space-y-1">
                      {(onboardingResponse.selected_forms_json as any[])?.map((f: any, i: number) => (
                        <p key={i} className="text-xs text-foreground">
                          Form {f.form_id?.slice(0, 8)}… — {f.counts_as_lead ? `✅ ${t("admin.lead")}` : `❌ ${t("admin.notLead")}`} — ${f.estimated_value || 0}
                        </p>
                      )) || <p className="text-xs text-muted-foreground">{t("admin.noFormData")}</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("admin.notificationPrefs")}</p>
                    <p className="text-xs text-foreground">{JSON.stringify(onboardingResponse.notification_prefs_json)}</p>
                  </div>
                  <button
                    onClick={() => exportJSON(onboardingResponse, `onboarding-${selectedOrg}.json`)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    <Download className="h-3 w-3" /> {t("admin.exportJson")}
                  </button>
                </>
              )}
              {!onboardingResponse && <p className="text-sm text-muted-foreground">{t("admin.noOnboardingData")}</p>}
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">{t("admin.dateTime")}</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">{t("admin.eventType")}</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">{t("admin.details")}</th>
                    <th className="text-right py-2 text-xs font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {orgEvents?.map((evt) => (
                    <>
                      <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 text-xs text-foreground">{format(new Date(evt.created_at), "MMM d, HH:mm")}</td>
                        <td className="py-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">{evt.event_type}</span>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                          {JSON.stringify(evt.event_payload).slice(0, 60)}…
                        </td>
                        <td className="py-2 text-right">
                          <button onClick={() => setExpandedEvent(expandedEvent === evt.id ? null : evt.id)} className="text-xs text-primary hover:underline">
                            <Eye className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                      {expandedEvent === evt.id && (
                        <tr key={`${evt.id}-detail`}>
                          <td colSpan={4} className="p-3 bg-muted/20">
                            <pre className="text-xs text-foreground whitespace-pre-wrap overflow-auto max-h-40">{JSON.stringify(evt.event_payload, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {(!orgEvents || orgEvents.length === 0) && (
                    <tr><td colSpan={4} className="py-4 text-center text-sm text-muted-foreground">{t("admin.noEventsYet")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={logPage === 0} onClick={() => setLogPage((p) => p - 1)} className="px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded disabled:opacity-50">{t("admin.prev")}</button>
              <span className="text-xs text-muted-foreground">{t("admin.page", { page: logPage + 1 })}</span>
              <button onClick={() => setLogPage((p) => p + 1)} className="px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded disabled:opacity-50" disabled={!orgEvents || orgEvents.length < LOG_PAGE_SIZE}>{t("admin.next")}</button>
            </div>
          </div>
        )}

        {activeTab === "exports" && (
          <div className="glass-card p-5 space-y-3">
            <p className="text-sm text-muted-foreground">{t("admin.downloadAuditData")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => onboardingResponse && exportCSV([onboardingResponse], `onboarding-${selectedOrg}.csv`)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                disabled={!onboardingResponse}
              >
                <Download className="h-3 w-3" /> {t("admin.onboardingCsv")}
              </button>
              <button
                onClick={() => orgEvents && exportCSV(orgEvents, `events-${selectedOrg}.csv`)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                disabled={!orgEvents || orgEvents.length === 0}
              >
                <Download className="h-3 w-3" /> {t("admin.eventsCsv")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sites list view
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">{t("admin.setupInputs")}</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{t("admin.setupInputsDesc")}</p>

      {/* Owner-only tab switcher */}
      {isAdminUser && (
        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          <button
            onClick={() => switchMainTab("metrics")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeMainTab === "metrics" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Business Metrics
          </button>
          <button
            onClick={() => switchMainTab("subscriber-sites")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeMainTab === "subscriber-sites" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Subscriber Sites
          </button>
          <button
            onClick={() => switchMainTab("clients")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeMainTab === "clients" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Clients
          </button>
          <button
            onClick={() => switchMainTab("release-qa")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeMainTab === "release-qa" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Release QA
          </button>
          <button
            onClick={() => switchMainTab("data-wipe")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeMainTab === "data-wipe" ? "border-destructive text-destructive" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Data Wipe
          </button>
          <button
            onClick={() => switchMainTab("support-access")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeMainTab === "support-access" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Support Access
          </button>
        </div>
      )}

      {activeMainTab === "release-qa" && isAdminUser && (
        <ReleaseQAPanel />
      )}

      {activeMainTab === "data-wipe" && isOwner && (
        <DataWipePanel />
      )}

      {activeMainTab === "support-access" && isAdminUser && (
        <SupportAccessPanel />
      )}

      {activeMainTab === "subscriber-sites" && isAdminUser && (
        <SubscriberSitesPanel />
      )}

      {(activeMainTab === "metrics" || activeMainTab === "clients") && isAdminUser && (
        <div className="mb-6">
          <ImportHealthPanel />
        </div>
      )}

      {activeMainTab === "clients" && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("admin.searchOrganizations")}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select
              value={filterFocus}
              onChange={(e) => setFilterFocus(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground"
            >
              <option value="">{t("admin.allFocusTypes")}</option>
              <option value="lead_volume">{t("admin.leadVolume")}</option>
              <option value="marketing_impact">{t("admin.marketingImpact")}</option>
              <option value="conversion_performance">{t("admin.conversionPerformance")}</option>
              <option value="paid_optimization">{t("admin.paidOptimization")}</option>
            </select>
            <select
              value={filterOnboarding}
              onChange={(e) => setFilterOnboarding(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground"
            >
              <option value="">{t("admin.allOnboarding")}</option>
              <option value="complete">{t("admin.complete")}</option>
              <option value="incomplete">{t("admin.incomplete")}</option>
            </select>
          </div>

          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                   <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t("admin.organization")}</th>
                   <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Tier</th>
                   <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">{t("admin.domain")}</th>
                   <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t("admin.focus")}</th>
                   <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">{t("admin.onboarded")}</th>
                   <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">{t("admin.lastChange")}</th>
                   <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground"></th>
                 </tr>
               </thead>
               <tbody>
                 {enrichedOrgs.map((org) => {
                   const tier = isClientTier(org.name) ? "client" : "paid";
                   const isDeleting = deletingOrgId === org.id;
                   return (
                   <tr key={org.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedOrg(org.id)}>
                     <td className="px-4 py-3 font-medium text-foreground">{org.name}</td>
                     <td className="px-4 py-3">
                       <Badge variant={tier === "client" ? "secondary" : "default"} className="text-[10px]">
                         {tier === "client" ? "Client" : "Paid"}
                       </Badge>
                     </td>
                     <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{org.sites?.[0]?.domain || "—"}</td>
                     <td className="px-4 py-3">
                       <span className="text-xs">{focusLabels[org.settings?.primary_focus] || "—"}</span>
                     </td>
                     <td className="px-4 py-3 text-center">
                       {org.settings?.onboarding_completed ? (
                         <span className="text-xs text-success">✅</span>
                       ) : (
                         <span className="text-xs text-muted-foreground">⏳</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                       {org.lastEvent ? format(new Date(org.lastEvent), "MMM d, HH:mm") : "—"}
                     </td>
                     <td className="px-4 py-3 text-right whitespace-nowrap">
                       <span className="text-xs text-primary mr-3">{t("admin.view")}</span>
                       {isOwner && (
                         <button
                           onClick={(e) => { e.stopPropagation(); handleDeleteOrg(org.id, org.name); }}
                           disabled={isDeleting}
                           className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50 inline-flex items-center gap-1"
                           title="Remove client (owner only)"
                         >
                           {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                           Remove
                         </button>
                       )}
                     </td>
                   </tr>
                   );
                 })}
                 {enrichedOrgs.length === 0 && (
                   <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">{t("admin.noOrgsFound")}</td></tr>
                 )}
               </tbody>
            </table>
          </div>
        </>
      )}

      {activeMainTab === "metrics" && isAdminUser && (
        <div className="space-y-6">
          {/* KPIs — Top-line */}
          {(() => {
            const arr = totalMrr * 12;
            const paidSubs = activeSubs.filter((s: any) => Number(s.mrr || 0) > 0);
            const clientSubs = enrichedOrgs.filter((o) => isClientTier(o.name)).length;
            const ltv = churnedSubs.length > 0
              ? (activeSubs.reduce((s: number, sub: any) => s + Number(sub.mrr || 0), 0) / (churnedSubs.length / Math.max(subscribers.length, 1)))
              : totalMrr * 24; // assume 24-month LTV if no churn
            const revenueGrowth = signupsLastMonth > 0
              ? (((signupsThisMonth - signupsLastMonth) / signupsLastMonth) * 100).toFixed(0)
              : signupsThisMonth > 0 ? "∞" : "0";
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                  <OwnerKpiCard icon={DollarSign} label="MRR" value={`$${totalMrr.toFixed(0)}`} />
                  <OwnerKpiCard icon={DollarSign} label="ARR" value={`$${arr.toFixed(0)}`} />
                  <OwnerKpiCard icon={Users} label="Paid Customers" value={String(paidSubs.length)} />
                  <OwnerKpiCard icon={Users} label="Client Tier" value={String(clientSubs)} />
                  <OwnerKpiCard icon={DollarSign} label="ARPU" value={`$${avgArpu.toFixed(0)}/mo`} />
                  <OwnerKpiCard icon={TrendingUp} label="Est. LTV" value={`$${ltv.toFixed(0)}`} />
                  <OwnerKpiCard icon={TrendingUp} label="Churn Rate" value={`${churnRateVal}%`} />
                  <OwnerKpiCard icon={AlertTriangle} label="Past Due" value={String(pastDueSubs.length)} />
                </div>

                {/* Growth & Valuation Context */}
                <div className="grid md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Growth</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">New this month</span>
                        <span className="font-medium text-foreground">{signupsThisMonth}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">New last month</span>
                        <span className="font-medium text-foreground">{signupsLastMonth}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">MoM Growth</span>
                        <span className="font-medium text-foreground">{revenueGrowth}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Orgs</span>
                        <span className="font-medium text-foreground">{enrichedOrgs.length}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Valuation Multiples</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">3x ARR</span>
                        <span className="font-medium text-foreground">${(arr * 3).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">5x ARR</span>
                        <span className="font-medium text-foreground">${(arr * 5).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">10x ARR</span>
                        <span className="font-medium text-foreground">${(arr * 10).toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground pt-1">SaaS companies typically sell at 3–10x ARR depending on growth rate and churn.</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Unit Economics</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">ARPU</span>
                        <span className="font-medium text-foreground">${avgArpu.toFixed(2)}/mo</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Est. LTV</span>
                        <span className="font-medium text-foreground">${ltv.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Churned</span>
                        <span className="font-medium text-foreground">{churnedSubs.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Failed Payments</span>
                        <span className="font-medium text-foreground">{pastDueSubs.length}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })()}


          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">
                  Subscribers ({sortedSubs.length}{subSearch ? ` of ${subscribers.length}` : ""})
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRecalcMrr}
                    disabled={recalcingMrr}
                    className="gap-1.5"
                    title="Re-pull each subscriber's effective MRR from Stripe (applies any active discount/coupon)"
                  >
                    {recalcingMrr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    {recalcingMrr ? "Recalculating…" : "Recalc MRR"}
                  </Button>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      placeholder="Search by name or email"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSubSort("created_at")}>
                      Signup <ArrowUpDown className="inline h-3 w-3 ml-1" />
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSubSort("mrr")}>
                      MRR <ArrowUpDown className="inline h-3 w-3 ml-1" />
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSubs.map((s: any) => (
                    <>
                      <TableRow key={s.id}>
                        <TableCell className="text-xs font-medium">{s._profile?.full_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.email}</TableCell>
                        <TableCell><Badge variant="outline">{s.plan}</Badge></TableCell>
                        <TableCell className="text-xs">{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "default" : s.status === "past_due" ? "destructive" : "secondary"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>${Number(s.mrr || 0).toFixed(0)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => openDetail(s)}>
                              <UserCog className="h-3 w-3 mr-1" />
                              Details
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadBilling(s.email)}>
                              {managingSub === s.email ? "Close" : "Billing"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {managingSub === s.email && (
                        <TableRow key={`${s.id}-manage`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            {billingLoading ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading billing data…
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {/* Quick Actions */}
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm" variant="outline"
                                    onClick={() => handleSendPasswordReset(s.email)}
                                    disabled={actionLoading === "reset-" + s.email}
                                  >
                                    <KeyRound className="h-3.5 w-3.5 mr-1" />
                                    {actionLoading === "reset-" + s.email ? "Sending…" : "Send Password Reset"}
                                  </Button>
                                  <Button
                                    size="sm" variant="destructive"
                                    onClick={() => handleDeleteUser(s)}
                                    disabled={actionLoading === "delete-" + s.email}
                                  >
                                    <XCircle className="h-3.5 w-3.5 mr-1" />
                                    {actionLoading === "delete-" + s.email ? "Deleting…" : "Delete User"}
                                  </Button>
                                </div>

                                {/* Subscriptions */}
                                {billingData?.subscriptions?.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-foreground mb-2">Subscriptions</h4>
                                    <div className="space-y-2">
                                       {billingData.subscriptions.map((sub: any, index: number) => {
                                        const toDate = (v: any) => {
                                          if (!v) return null;
                                          const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
                                          return isNaN(d.getTime()) ? null : d;
                                        };
                                        const periodStart = toDate(sub.current_period_start);
                                        const periodEnd = toDate(sub.current_period_end);
                                        const createdDate = toDate(sub.created);
                                        const latestInvoiceDate = toDate(sub.latest_invoice_created);
                                        const fallbackDate = periodStart || periodEnd || createdDate || latestInvoiceDate;
                                        const isLatestActive = sub.status === "active" && index === 0;

                                        return (
                                        <div key={sub.id} className="flex items-center justify-between bg-background rounded-lg border border-border p-3">
                                          <div className="space-y-0.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <Badge variant={sub.status === "active" ? "default" : sub.status === "canceled" ? "destructive" : "secondary"}>{sub.status}</Badge>
                                              {isLatestActive && <Badge variant="outline">Latest active</Badge>}
                                              <span className="text-sm font-medium">${sub.amount}/{sub.interval}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              {periodStart || periodEnd
                                                ? `Period: ${periodStart ? periodStart.toLocaleDateString() : "—"} – ${periodEnd ? periodEnd.toLocaleDateString() : "—"}`
                                                : fallbackDate
                                                  ? `Started: ${fallbackDate.toLocaleDateString()}`
                                                  : "Date unavailable"}
                                              {sub.cancel_at_period_end && " · Cancelling at period end"}
                                              {sub.cancel_at && !sub.cancel_at_period_end && ` · Cancelling on ${new Date(sub.cancel_at * 1000).toLocaleDateString()}`}
                                              {sub.canceled_at && ` · Canceled ${new Date(sub.canceled_at * 1000).toLocaleDateString()}`}
                                            </p>
                                            {sub.product_name && sub.product_name !== sub.plan && (
                                              <p className="text-[11px] text-muted-foreground">{sub.product_name}</p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground/60 font-mono">{sub.id}</p>
                                          </div>
                                          {sub.status === "active" && !sub.cancel_at_period_end && !sub.cancel_at && (
                                            <div className="flex flex-col gap-1.5">
                                              <div className="flex gap-1">
                                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                                  onClick={() => handleCancelSub(sub.id, false)}
                                                  disabled={!!actionLoading}>
                                                  Cancel at End
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                                  onClick={() => { setCancelDatePickerSub(cancelDatePickerSub === sub.id ? null : sub.id); setCancelDate(undefined); }}
                                                  disabled={!!actionLoading}>
                                                  <CalendarIcon className="h-3 w-3 mr-1" />
                                                  Cancel on Date
                                                </Button>
                                                <Button size="sm" variant="destructive" className="h-7 text-xs"
                                                  onClick={() => handleCancelSub(sub.id, true)}
                                                  disabled={!!actionLoading}>
                                                  Cancel Now
                                                </Button>
                                              </div>
                                              {cancelDatePickerSub === sub.id && (
                                                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                                                  <input
                                                    type="date"
                                                    className="text-xs bg-background border border-border rounded px-2 py-1"
                                                    min={format(new Date(), "yyyy-MM-dd")}
                                                    value={cancelDate ? format(cancelDate, "yyyy-MM-dd") : ""}
                                                    onChange={(e) => setCancelDate(e.target.value ? new Date(e.target.value + "T00:00:00") : undefined)}
                                                  />
                                                  <Button size="sm" className="h-7 text-xs"
                                                    onClick={() => handleCancelSubOnDate(sub.id)}
                                                    disabled={!cancelDate || !!actionLoading}>
                                                    Confirm
                                                  </Button>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        );
                                       })}

                                    </div>
                                  </div>
                                )}

                                {/* Payment History */}
                                {billingData?.charges?.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-foreground mb-2">Payment History</h4>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b border-border">
                                            <th className="text-left py-1.5 text-xs font-medium text-muted-foreground">Date</th>
                                            <th className="text-left py-1.5 text-xs font-medium text-muted-foreground">Amount</th>
                                            <th className="text-left py-1.5 text-xs font-medium text-muted-foreground">Status</th>
                                            <th className="text-right py-1.5 text-xs font-medium text-muted-foreground">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {billingData.charges.map((c: any) => (
                                            <tr key={c.id} className="border-b border-border/50">
                                              <td className="py-1.5 text-xs">{new Date(c.created * 1000).toLocaleDateString()}</td>
                                              <td className="py-1.5 text-xs font-medium">${c.amount} {c.currency.toUpperCase()}</td>
                                              <td className="py-1.5">
                                                <Badge variant={c.status === "succeeded" ? "default" : "secondary"} className="text-[10px]">
                                                  {c.refunded ? `Refunded $${c.amount_refunded}` : c.status}
                                                </Badge>
                                              </td>
                                              <td className="py-1.5 text-right">
                                                <div className="flex gap-1 justify-end">
                                                  {c.receipt_url && (
                                                    <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[10px]">
                                                      <a
                                                        href={c.receipt_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(event) => event.stopPropagation()}
                                                      >
                                                        <ExternalLink className="h-3 w-3 mr-1" /> Receipt
                                                      </a>
                                                    </Button>
                                                  )}
                                                  {c.status === "succeeded" && !c.refunded && (
                                                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                                                      onClick={() => handleRefund(c.id)}
                                                      disabled={actionLoading === "refund-" + c.id}>
                                                      <RotateCcw className="h-3 w-3 mr-1" />
                                                      {actionLoading === "refund-" + c.id ? "…" : "Refund"}
                                                    </Button>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {!billingData?.customer && (
                                  <p className="text-sm text-muted-foreground">No Stripe customer found for this email.</p>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Feature Usage — moved below subscribers */}
          <FeatureUsageWidget />

          {/* Product Intelligence & Acquisition */}
          <div className="grid md:grid-cols-2 gap-4">
            <AiUsageWidget />
            <AcquisitionWidget subscribers={subscribers} />
          </div>

          {/* Recent Errors */}
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Errors ({errorLogs.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorLogs.slice(0, 20).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{e.action}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[400px] truncate">{e.error_message || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
      <AdminCustomerDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        email={detailEmail}
        subscriberId={detailSubscriberId}
      />
    </div>
  );
}

function OwnerKpiCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}