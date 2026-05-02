import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";
import {
  Activity, Globe, Shield, Link2, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Plus, Trash2, Bell, ChevronRight, ExternalLink, FileSearch, EyeOff,
  Package, Info, LogIn,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import WpEnvironmentTab from "@/components/monitoring/WpEnvironmentTab";
import { TrackingStatusCard, TrackingAlertsPanel, TrackingInterruptionsTable, SiteHealthBanner } from "@/components/monitoring/TrackingHealthPanel";
import { ConsentStatusIndicator, DataIntegrityNotice, ComplianceWarnings } from "@/components/monitoring/ComplianceStatusPanel";
import { FleetHealthWidget } from "@/components/monitoring/FleetHealthWidget";
import { callManageImportJob } from "@/lib/manage-import-job";
import { HowToButton } from "@/components/HowToButton";
import { AddSiteHeaderButton } from "@/components/sites/AddSiteHeaderButton";
import { HOWTO_MONITORING } from "@/components/howto/page-content";

export default function MonitoringPage() {
  const { orgId } = useOrg();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const siteParam = searchParams.get("site");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [autoSelected, setAutoSelected] = useState(false);

  // Fetch sites with monitoring data
  const { data: sites, isLoading } = useQuery({
    queryKey: ["monitoring_sites", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: incidents } = useQuery({
    queryKey: ["incidents", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("incidents")
        .select("*")
        .eq("org_id", orgId)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Filter health tables by site_id (not org_id) to avoid stale org_id mismatches
  // when a site has been moved between orgs but historical health rows kept the
  // original org_id. RLS still enforces access.
  const siteIds = sites?.map((s) => s.id) ?? [];

  const { data: domainHealth } = useQuery({
    queryKey: ["domain_health", siteIds],
    queryFn: async () => {
      if (siteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("domain_health")
        .select("*")
        .in("site_id", siteIds);
      if (error) throw error;
      return data;
    },
    enabled: siteIds.length > 0,
  });

  const { data: sslHealth } = useQuery({
    queryKey: ["ssl_health", siteIds],
    queryFn: async () => {
      if (siteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("ssl_health")
        .select("*")
        .in("site_id", siteIds);
      if (error) throw error;
      return data;
    },
    enabled: siteIds.length > 0,
  });

  const selectedSite = sites?.find(s => s.id === selectedSiteId) || null;

  // Select a requested site from the sidebar switcher, or auto-select first site when tab param is present.
  useEffect(() => {
    if (!sites || sites.length === 0) return;

    if (siteParam && sites.some((site) => site.id === siteParam)) {
      setSelectedSiteId(siteParam);
      setAutoSelected(true);
      return;
    }

    if (tabParam && !autoSelected && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
      setAutoSelected(true);
    }
  }, [tabParam, siteParam, sites, autoSelected, selectedSiteId]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card p-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/4 mb-4" />
            <div className="h-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (selectedSite) {
    return (
      <SiteDetail
        site={selectedSite}
        incidents={incidents?.filter(i => i.site_id === selectedSite.id) || []}
        domainHealth={domainHealth?.find(d => d.site_id === selectedSite.id)}
        sslHealth={sslHealth?.find(s => s.site_id === selectedSite.id)}
        onBack={() => setSelectedSiteId(null)}
        initialTab={tabParam || undefined}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold text-foreground">{t("monitoring.title")}</h1>
            <HowToButton {...HOWTO_MONITORING} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{t("monitoring.subtitle")}</p>
        </div>
        <AddSiteHeaderButton />
      </div>
      <div className="mb-6" />

      {/* Sites overview grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sites?.map(site => {
          const domain = domainHealth?.find(d => d.site_id === site.id);
          const ssl = sslHealth?.find(s => s.site_id === site.id);
          const activeIncidents = incidents?.filter(i => i.site_id === site.id && !i.resolved_at) || [];

          return (
            <button
              key={site.id}
              onClick={() => setSelectedSiteId(site.id)}
              className="glass-card p-5 text-left hover:border-primary/30 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <StatusDot status={site.status} />
                  <span className="text-sm font-semibold text-foreground">{site.domain}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t("monitoring.lastConfirmation")}</span>
                  <span className="text-foreground">
                    {site.last_heartbeat_at ? format(new Date(site.last_heartbeat_at), "MMM d, HH:mm") : t("monitoring.never")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("monitoring.domainExpiry")}</span>
                  <span className={domain?.days_to_domain_expiry && domain.days_to_domain_expiry <= 30 ? "text-warning" : "text-foreground"}>
                    {domain?.days_to_domain_expiry != null ? `${domain.days_to_domain_expiry}d` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("monitoring.sslExpiry")}</span>
                  <span className={ssl?.days_to_ssl_expiry && ssl.days_to_ssl_expiry <= 30 ? "text-warning" : "text-foreground"}>
                    {ssl?.days_to_ssl_expiry != null ? `${ssl.days_to_ssl_expiry}d` : "—"}
                  </span>
                </div>
                {activeIncidents.length > 0 && (
                  <div className="flex items-center gap-1 pt-1">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    <span className="text-destructive font-medium">{t("monitoring.activeIncident", { count: activeIncidents.length })}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {(!sites || sites.length === 0) && (
          <div className="col-span-full glass-card p-8 text-center">
            <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("monitoring.noSites")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`w-2 h-2 rounded-full ${status === "UP" ? "bg-success" : "bg-destructive animate-pulse"}`} />
  );
}

// ─── Site Detail ────────────────────────────────────────────────

interface SiteDetailProps {
  site: any;
  incidents: any[];
  domainHealth: any;
  sslHealth: any;
  onBack: () => void;
  initialTab?: string;
}

function SiteDetail({ site, incidents, domainHealth, sslHealth, onBack, initialTab }: SiteDetailProps) {
  const { orgId } = useOrg();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [autoCheckingDomainSsl, setAutoCheckingDomainSsl] = useState(false);

  useEffect(() => {
    const needsDomainRefresh = !domainHealth?.last_checked_at || (Date.now() - new Date(domainHealth.last_checked_at).getTime()) > 24 * 60 * 60 * 1000;
    const needsSslRefresh = !sslHealth?.last_checked_at || (Date.now() - new Date(sslHealth.last_checked_at).getTime()) > 24 * 60 * 60 * 1000;

    if ((!needsDomainRefresh && !needsSslRefresh) || autoCheckingDomainSsl) return;

    let cancelled = false;

    const refresh = async () => {
      setAutoCheckingDomainSsl(true);
      try {
        const { data, error } = await supabase.functions.invoke("check-domain-ssl", {
          body: { site_id: site.id },
        });

        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Automatic domain and SSL check failed.");

        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["domain_health"] });
          queryClient.invalidateQueries({ queryKey: ["ssl_health"] });
        }
      } catch (err) {
        console.error("Automatic domain/SSL refresh failed", err);
      } finally {
        if (!cancelled) {
          setAutoCheckingDomainSsl(false);
        }
      }
    };

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [site.id, domainHealth?.last_checked_at, sslHealth?.last_checked_at, autoCheckingDomainSsl, queryClient]);

  const { data: brokenLinks } = useQuery({
    queryKey: ["broken_links", site.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broken_links")
        .select("*")
        .eq("site_id", site.id)
        .order("last_seen_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });



  const { data: notifRules } = useQuery({
    queryKey: ["notif_rules", site.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_notification_rules")
        .select("*")
        .eq("site_id", site.id);
      if (error) throw error;
      return data;
    },
  });



  const toggleRule = useMutation({
    mutationFn: async ({ alertType, channel, enabled }: { alertType: string; channel: string; enabled: boolean }) => {
      const { error } = await supabase.from("site_notification_rules").upsert({
        site_id: site.id,
        org_id: orgId!,
        alert_type: alertType,
        channel,
        is_enabled: enabled,
      }, { onConflict: "site_id,alert_type,channel" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notif_rules", site.id] }),
  });

  const alertTypes = ["DOWNTIME", "FORM_FAILURE", "CONVERSION_DROP", "DOMAIN_EXPIRING", "SSL_EXPIRING", "PLUGIN_UPDATE", "PLUGIN_VULNERABILITY", "WP_CORE_UPDATE"];
  const channels = ["in_app", "email"];

  const getRuleEnabled = (alertType: string, channel: string) => {
    return notifRules?.find(r => r.alert_type === alertType && r.channel === channel)?.is_enabled ?? false;
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4 flex items-center gap-1">
        ← {t("monitoring.allSites")}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <StatusDot status={site.status} />
        <h1 className="text-2xl font-bold text-foreground">{site.domain}</h1>
        <Badge variant={site.status === "UP" ? "default" : "destructive"}>
          {site.status}
        </Badge>
        <WpAdminLoginButton siteId={site.id} domain={site.domain} />
      </div>

      <Tabs defaultValue={initialTab || "overview"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t("monitoring.overview")}</TabsTrigger>
          <TabsTrigger value="form-checks">{t("monitoring.formChecks")}</TabsTrigger>
          <TabsTrigger value="broken-links">{t("monitoring.brokenLinks")}</TabsTrigger>
          <TabsTrigger value="domain-ssl">{t("monitoring.domainSsl")}</TabsTrigger>
          <TabsTrigger value="plugin-wp">{t("monitoring.pluginWp")}</TabsTrigger>
          <TabsTrigger value="notifications">{t("monitoring.notifications")}</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <ComplianceWarnings />
          <SiteHealthBanner siteId={site.id} />
          <DataIntegrityNotice siteId={site.id} />
           <div className="grid gap-4 md:grid-cols-4">
            <TrackingStatusCard siteId={site.id} />
            <ConsentStatusIndicator />
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Activity className="h-4 w-4" /> Last Confirmation
              </div>
              <p className="text-lg font-semibold text-foreground">
                {site.last_heartbeat_at ? format(new Date(site.last_heartbeat_at), "MMM d, HH:mm:ss") : "Never"}
              </p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Globe className="h-4 w-4" /> Domain Expiry
              </div>
              <p className="text-lg font-semibold text-foreground">
                {domainHealth?.days_to_domain_expiry != null ? `${domainHealth.days_to_domain_expiry} days` : "Unknown"}
              </p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Shield className="h-4 w-4" /> SSL Expiry
              </div>
              <p className="text-lg font-semibold text-foreground">
                {sslHealth?.days_to_ssl_expiry != null ? `${sslHealth.days_to_ssl_expiry} days` : "Unknown"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TrackingAlertsPanel siteId={site.id} />
            <TrackingInterruptionsTable siteId={site.id} />
          </div>

          {/* Incidents */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent Incidents</h3>
            {incidents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No incidents recorded.</p>
            ) : (
              <div className="space-y-2">
                {incidents.slice(0, 10).map(inc => (
                  <div key={inc.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      {inc.resolved_at ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-sm text-foreground">{inc.type}</span>
                      <Badge variant="outline" className="text-xs">{inc.severity}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(inc.started_at), "MMM d, HH:mm")}
                      {inc.resolved_at && ` → ${format(new Date(inc.resolved_at), "HH:mm")}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Form Checks */}
        <TabsContent value="form-checks" className="space-y-4">
          <FormChecksTab siteId={site.id} orgId={orgId!} />
        </TabsContent>

        {/* Broken Links */}
        <TabsContent value="broken-links" className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Broken Links ({brokenLinks?.length || 0})
              </h3>
              
            </div>
            {(!brokenLinks || brokenLinks.length === 0) ? (
              <p className="text-xs text-muted-foreground">No broken links detected. Scans run automatically.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {brokenLinks.map(bl => (
                  <div key={bl.id} className="flex items-start justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{bl.broken_url}</p>
                      <p className="text-xs text-muted-foreground truncate">on {bl.source_page}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <Badge variant="outline">{bl.status_code || "?"}</Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">×{bl.occurrences}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Domain & SSL */}
        <TabsContent value="domain-ssl" className="space-y-4">
          <div className="flex justify-end mb-1">
            <CheckDomainSslButton siteId={site.id} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4" /> Domain Health
              </h3>
              {domainHealth ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Domain</span><span className="text-foreground">{domainHealth.domain}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Expiry</span><span className="text-foreground">{domainHealth.domain_expiry_date || "Unknown"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Days left</span>
                    <span className={domainHealth.days_to_domain_expiry <= 30 ? "text-warning font-semibold" : "text-foreground"}>
                      {domainHealth.days_to_domain_expiry ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="text-foreground">{domainHealth.source}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last checked</span><span className="text-foreground">{format(new Date(domainHealth.last_checked_at), "MMM d, HH:mm")}</span></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Checking automatically…</p>
              )}
            </div>

            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" /> SSL Health
              </h3>
              {sslHealth ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Expiry</span><span className="text-foreground">{sslHealth.ssl_expiry_date || "Unknown"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Days left</span>
                    <span className={sslHealth.days_to_ssl_expiry && sslHealth.days_to_ssl_expiry <= 30 ? "text-warning font-semibold" : "text-foreground"}>
                      {sslHealth.days_to_ssl_expiry ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Issuer</span><span className="text-foreground">{sslHealth.issuer || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last checked</span><span className="text-foreground">{format(new Date(sslHealth.last_checked_at), "MMM d, HH:mm")}</span></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Checking automatically…</p>
              )}
            </div>
          </div>
        </TabsContent>


        {/* Plugin & WordPress */}
        <TabsContent value="plugin-wp" className="space-y-4">
          <FleetHealthWidget />
          <WpEnvironmentTab siteId={site.id} orgId={orgId} />
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notification Rules
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Alert Type</th>
                    {channels.map(ch => (
                      <th key={ch} className="text-center py-2 text-muted-foreground font-medium capitalize">{ch.replace("_", " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alertTypes.map(at => (
                    <tr key={at} className="border-b border-border last:border-0">
                      <td className="py-3 text-foreground">{at.replace(/_/g, " ")}</td>
                      {channels.map(ch => (
                        <td key={ch} className="text-center py-3">
                          <Switch
                            checked={getRuleEnabled(at, ch)}
                            onCheckedChange={(checked) => toggleRule.mutate({ alertType: at, channel: ch, enabled: checked })}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
// ─── Check Domain & SSL Button ──────────────────────────────────

function CheckDomainSslButton({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-domain-ssl", {
        body: { site_id: siteId },
      });
      if (error) throw error;
      if (!data?.ok) {
        throw new Error(data?.error || "We couldn’t complete the domain and SSL check.");
      }
      toast({ title: "Check complete", description: `Checked ${data?.checked || 0} site(s).` });
      queryClient.invalidateQueries({ queryKey: ["domain_health"] });
      queryClient.invalidateQueries({ queryKey: ["ssl_health"] });
    } catch (err: any) {
      toast({ title: "Check failed", description: err?.message || "The check did not complete.", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleCheck} disabled={checking} className="gap-1">
      <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
      {checking ? "Checking…" : "Check Now"}
    </Button>
  );
}

// ─── Add Renewal Dialog ─────────────────────────────────────────



// ─── Form Checks Tab ────────────────────────────────────────────

function FormChecksTab({ siteId, orgId }: { siteId: string; orgId: string }) {
  const queryClient = useQueryClient();
  const [rescanning, setRescanning] = useState(false);

  const { data: checks, isLoading } = useQuery({
    queryKey: ["form_health_checks", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_health_checks")
        .select("*, forms(name, provider, external_form_id)")
        .eq("site_id", siteId)
        .eq("org_id", orgId);
      if (error) throw error;
      return data;
    },
  });

  const { data: forms } = useQuery({
    queryKey: ["site_forms_for_checks", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("id, name, page_url")
        .eq("site_id", siteId)
        .eq("org_id", orgId)
        .eq("archived", false);
      if (error) throw error;
      return data;
    },
  });

  const handleRescanForms = async () => {
    try {
      setRescanning(true);
      const [siteSyncResult, discoverResult] = await Promise.all([
        supabase.functions.invoke("trigger-site-sync", {
          body: { site_id: siteId, force_backfill: true },
        }),
        callManageImportJob<{ discovered?: number; auto_started_jobs?: number }>("discover", {
          body: { site_id: siteId },
        }),
      ]);

      if (siteSyncResult.error) throw siteSyncResult.error;
      if (siteSyncResult.data?.error) throw new Error(siteSyncResult.data.error);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["site_forms_for_checks", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["form_health_checks", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["form_integrations"] }),
      ]);

      const discovered = discoverResult?.discovered ?? 0;
      const autoStartedJobs = discoverResult?.auto_started_jobs ?? 0;
      const backfillInProgress = Boolean(siteSyncResult.data?.backfill_in_progress || autoStartedJobs > 0);

      toast({
        title: "Re-scan started",
        description: backfillInProgress
          ? `We restarted discovery and background entry import for this site${discovered > 0 ? ` (${discovered} form${discovered === 1 ? "" : "s"} found)` : ""}.`
          : "We restarted form discovery for this site.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Re-scan failed",
        description: err?.message || "We couldn’t re-scan this site right now.",
      });
    } finally {
      setRescanning(false);
    }
  };

  if (isLoading) {
    return <div className="glass-card p-6 animate-pulse"><div className="h-20 bg-muted rounded" /></div>;
  }

  const checksMap = new Map((checks || []).map(c => [c.form_id, c]));

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileSearch className="h-4 w-4" /> Form Liveness Checks
        </h3>
        <Button size="sm" variant="outline" onClick={handleRescanForms} disabled={rescanning} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? "animate-spin" : ""}`} />
          {rescanning ? "Re-scanning…" : "Re-scan Forms"}
        </Button>
      </div>

      {(!forms || forms.length === 0) ? (
        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-xs text-muted-foreground">No forms discovered for this site yet.</p>
          <p className="text-xs text-muted-foreground">Use Re-scan Forms to retry WordPress discovery and background backfill when auto-detect misses forms.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {forms.map(form => {
            const check = checksMap.get(form.id);
            const isRendered = check ? check.is_rendered : null;
            const lastChecked = check?.last_checked_at;
            const lastRendered = (check as any)?.last_rendered_at as string | undefined;
            const httpStatus = (check as any)?.last_http_status as number | null | undefined;
            const failureReason = (check as any)?.last_failure_reason as string | null | undefined;

            return (
              <div key={form.id} className="flex items-start justify-between py-3 border-b border-border last:border-0 gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`p-1.5 rounded-md mt-0.5 ${isRendered === false ? "bg-destructive/10" : isRendered === true ? "bg-success/10" : "bg-muted"}`}>
                    {isRendered === false ? (
                      <EyeOff className="h-3.5 w-3.5 text-destructive" />
                    ) : isRendered === true ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{form.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {form.page_url || "No page URL detected"}
                    </p>
                    {isRendered === false && (
                      <p className="text-xs text-destructive mt-1">
                        {failureReason || (httpStatus ? `Page returned HTTP ${httpStatus}` : "Form markup not detected on page")}
                        {lastRendered && (
                          <span className="text-muted-foreground"> · last seen {format(new Date(lastRendered), "MMM d, yyyy")}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge variant={isRendered === false ? "destructive" : isRendered === true ? "default" : "outline"}>
                    {isRendered === false ? "Not Found" : isRendered === true ? "Detected" : "Pending"}
                  </Badge>
                  {lastChecked && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(lastChecked), "MMM d, HH:mm")}
                    </p>
                  )}
                  {isRendered === false && (
                    <FixFormUrlButton
                      formId={form.id}
                      currentUrl={form.page_url || null}
                      siteId={siteId}
                      onUpdated={() => {
                        queryClient.invalidateQueries({ queryKey: ["form_health_checks", siteId] });
                        queryClient.invalidateQueries({ queryKey: ["site_forms_for_checks", siteId] });
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        The plugin checks each form's page hourly to verify the form HTML is still present. Forms behind logins or modals may not be detected. If a form is marked Not Found but you know it's live, use Fix URL to point us at the correct page.
      </p>
    </div>
  );
}

// ─── Fix Form URL Button ────────────────────────────────────────

function FixFormUrlButton({
  formId,
  currentUrl,
  siteId,
  onUpdated,
}: {
  formId: string;
  currentUrl: string | null;
  siteId: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentUrl || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
      toast({ title: "Invalid URL", description: "Enter a full URL starting with https://", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("forms")
        .update({ page_url: trimmed })
        .eq("id", formId);
      if (updateError) throw updateError;

      // Re-probe immediately so the user sees a fresh result.
      await supabase.functions.invoke("trigger-site-sync", { body: { site_id: siteId } });

      toast({ title: "URL updated", description: "We'll re-check the form shortly." });
      setOpen(false);
      onUpdated();
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message || "Could not update the form URL.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">Fix URL</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update form page URL</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste the page where this form is currently embedded. We'll re-check it right away.
          </p>
          <Input
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://example.com/contact"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save & re-check"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── WP Admin Magic Login Button ──────────────────────────────

function WpAdminLoginButton({ siteId, domain }: { siteId: string; domain: string }) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-wp-login", {
        body: { site_id: siteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.login_url) {
        window.open(data.login_url, "_blank", "noopener");
      }
    } catch (err: any) {
      toast({
        title: "WP Admin login failed",
        description: err?.message || "Could not generate login link. Make sure the plugin is updated.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleLogin} disabled={loading} className="gap-1.5 ml-auto">
      <LogIn className="h-3.5 w-3.5" />
      {loading ? "Generating…" : "WP Admin"}
    </Button>
  );
}
