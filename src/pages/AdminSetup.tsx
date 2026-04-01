import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { Shield, ChevronLeft, Download, Search, Filter, Eye, DollarSign, Users, TrendingUp, AlertTriangle, BarChart3, ArrowUpDown, KeyRound, RotateCcw, XCircle, ExternalLink, Loader2, CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const OWNER_EMAIL = "david@newuniformdesign.com";

export default function AdminSetup() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL;
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"clients" | "metrics">("clients");
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
  const [managingSub, setManagingSub] = useState<string | null>(null);
  const [billingData, setBillingData] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: subscribers = [] } = useQuery({
    queryKey: ["owner_subscribers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscribers").select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: isOwner,
  });

  const { data: errorLogs = [] } = useQuery({
    queryKey: ["owner_errors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
    enabled: isOwner,
  });

  const activeSubs = useMemo(() => subscribers.filter((s: any) => s.status === "active"), [subscribers]);
  const churnedSubs = useMemo(() => subscribers.filter((s: any) => s.status === "churned"), [subscribers]);
  const pastDueSubs = useMemo(() => subscribers.filter((s: any) => s.status === "past_due"), [subscribers]);
  const totalMrr = useMemo(() => activeSubs.reduce((sum: number, s: any) => sum + Number(s.mrr || 0), 0), [activeSubs]);
  const avgArpu = activeSubs.length ? totalMrr / activeSubs.length : 0;
  const churnRateVal = subscribers.length ? ((churnedSubs.length / subscribers.length) * 100).toFixed(1) : "0";

  const nowDate = new Date();
  const thisMonthStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const signupsThisMonth = subscribers.filter((s: any) => s.created_at?.startsWith(thisMonthStr)).length;
  const signupsLastMonth = subscribers.filter((s: any) => s.created_at?.startsWith(lastMonthStr)).length;

  const featureCountsOwner = useMemo(() => {
    const counts: Record<string, number> = {};
    activeSubs.forEach((s: any) => {
      const features = Array.isArray(s.features_used) ? s.features_used : [];
      features.forEach((f: string) => { counts[f] = (counts[f] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeSubs]);

  const avgAiCalls = activeSubs.length
    ? (activeSubs.reduce((sum: number, s: any) => sum + Number(s.ai_calls_per_day_avg || 0), 0) / activeSubs.length).toFixed(1)
    : "0";

  const referralCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subscribers.forEach((s: any) => {
      const src = s.referral_source || "Unknown";
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [subscribers]);

  const sortedSubs = useMemo(() => {
    return [...subscribers].sort((a: any, b: any) => {
      const av = a[subSortKey] ?? "";
      const bv = b[subSortKey] ?? "";
      return subSortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [subscribers, subSortKey, subSortAsc]);

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
      // Find user_id from profiles
      const { data: profile } = await supabase.from("profiles").select("user_id").eq("email", sub.email).maybeSingle();
      if (profile?.user_id) {
        await supabase.functions.invoke("admin-manage-user", {
          body: { action: "delete_user", user_id: profile.user_id },
        });
      }
      toast.success(`User ${sub.email} deleted`);
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
      {isOwner && (
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            onClick={() => setActiveMainTab("clients")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeMainTab === "clients" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Clients
          </button>
          <button
            onClick={() => setActiveMainTab("metrics")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeMainTab === "metrics" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Business Metrics
          </button>
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
                     <td className="px-4 py-3 text-right">
                       <span className="text-xs text-primary">{t("admin.view")}</span>
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

      {activeMainTab === "metrics" && isOwner && (
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

          {/* Subscriber Table */}
          <Card>
            <CardHeader><CardTitle className="text-base">Subscribers ({subscribers.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Site</TableHead>
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
                        <TableCell className="font-mono text-xs">{s.email}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">{s.site_url || "—"}</TableCell>
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
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadBilling(s.email)}>
                              {managingSub === s.email ? "Close" : "Manage"}
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
                                       {billingData.subscriptions.map((sub: any) => {
                                        const toDate = (v: any) => {
                                          if (!v) return null;
                                          const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
                                          return isNaN(d.getTime()) ? null : d;
                                        };
                                        const periodStart = toDate(sub.current_period_start);
                                        const periodEnd = toDate(sub.current_period_end);
                                        const createdDate = toDate(sub.created);
                                        return (
                                        <div key={sub.id} className="flex items-center justify-between bg-background rounded-lg border border-border p-3">
                                          <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                              <Badge variant={sub.status === "active" ? "default" : sub.status === "canceled" ? "destructive" : "secondary"}>{sub.status}</Badge>
                                              <span className="text-sm font-medium">${sub.amount}/{sub.interval}</span>
                                              {createdDate && <span className="text-xs text-muted-foreground">Created {createdDate.toLocaleDateString()}</span>}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              Period: {periodStart ? periodStart.toLocaleDateString() : "—"} – {periodEnd ? periodEnd.toLocaleDateString() : "—"}
                                              {sub.cancel_at_period_end && " · Cancelling at period end"}
                                              {sub.cancel_at && !sub.cancel_at_period_end && ` · Cancelling on ${new Date(sub.cancel_at * 1000).toLocaleDateString()}`}
                                              {sub.canceled_at && ` · Canceled ${new Date(sub.canceled_at * 1000).toLocaleDateString()}`}
                                            </p>
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
                                                    <a href={c.receipt_url} target="_blank" rel="noopener noreferrer">
                                                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2">
                                                        <ExternalLink className="h-3 w-3 mr-1" /> Receipt
                                                      </Button>
                                                    </a>
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

          {/* Product Intelligence & Acquisition */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Feature Usage</CardTitle></CardHeader>
              <CardContent>
                {featureCountsOwner.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {featureCountsOwner.map(([name, count]) => (
                      <div key={name} className="flex justify-between text-sm">
                        <span className="text-foreground">{name}</span>
                        <span className="text-muted-foreground">{count} sites</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">AI Usage</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Avg AI calls/site/day:</span>
                  <span className="ml-2 font-mono text-foreground">{avgAiCalls}</span>
                </div>
                <div className="text-sm font-medium text-foreground">High usage sites:</div>
                {activeSubs
                  .filter((s: any) => Number(s.ai_calls_per_day_avg) > 50)
                  .map((s: any) => (
                    <div key={s.id} className="text-xs flex justify-between">
                      <span className="truncate max-w-[140px]">{s.site_url || s.email}</span>
                      <Badge variant="destructive">{Number(s.ai_calls_per_day_avg).toFixed(0)}/day</Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Acquisition</CardTitle></CardHeader>
              <CardContent>
                {referralCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {referralCounts.map(([src, count]) => (
                      <div key={src} className="flex justify-between text-sm">
                        <span className="text-foreground">{src}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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