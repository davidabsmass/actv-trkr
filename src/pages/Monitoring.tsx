import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";
import {
  Activity, Globe, Shield, Link2, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Plus, Trash2, Bell, ChevronRight, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

export default function MonitoringPage() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
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

  const { data: domainHealth } = useQuery({
    queryKey: ["domain_health", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("domain_health")
        .select("*")
        .eq("org_id", orgId);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: sslHealth } = useQuery({
    queryKey: ["ssl_health", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("ssl_health")
        .select("*")
        .eq("org_id", orgId);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const selectedSite = sites?.find(s => s.id === selectedSiteId) || null;

  // Auto-select first site when tab param is present
  useEffect(() => {
    if (tabParam && !autoSelected && sites && sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
      setAutoSelected(true);
    }
  }, [tabParam, sites, autoSelected, selectedSiteId]);

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
      <h1 className="text-2xl font-bold text-foreground mb-1">Site Monitoring</h1>
      <p className="text-sm text-muted-foreground mb-6">Uptime, health, and alerts across all sites.</p>

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
                  <span>Last confirmation</span>
                  <span className="text-foreground">
                    {site.last_heartbeat_at ? format(new Date(site.last_heartbeat_at), "MMM d, HH:mm") : "Never"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Domain expiry</span>
                  <span className={domain?.days_to_domain_expiry && domain.days_to_domain_expiry <= 30 ? "text-warning" : "text-foreground"}>
                    {domain?.days_to_domain_expiry != null ? `${domain.days_to_domain_expiry}d` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>SSL expiry</span>
                  <span className={ssl?.days_to_ssl_expiry && ssl.days_to_ssl_expiry <= 30 ? "text-warning" : "text-foreground"}>
                    {ssl?.days_to_ssl_expiry != null ? `${ssl.days_to_ssl_expiry}d` : "—"}
                  </span>
                </div>
                {activeIncidents.length > 0 && (
                  <div className="flex items-center gap-1 pt-1">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    <span className="text-destructive font-medium">{activeIncidents.length} active incident{activeIncidents.length > 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {(!sites || sites.length === 0) && (
          <div className="col-span-full glass-card p-8 text-center">
            <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No sites connected yet. Add a site in Settings.</p>
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
  const queryClient = useQueryClient();

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

  const { data: renewals } = useQuery({
    queryKey: ["renewals", site.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewals")
        .select("*")
        .eq("site_id", site.id)
        .order("renewal_date", { ascending: true });
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

  const addRenewal = useMutation({
    mutationFn: async (values: { type: string; provider_name: string; renewal_date: string }) => {
      const { error } = await supabase.from("renewals").insert({
        site_id: site.id,
        org_id: orgId!,
        ...values,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["renewals", site.id] });
      toast({ title: "Renewal added" });
    },
  });

  const deleteRenewal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("renewals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["renewals", site.id] }),
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

  const alertTypes = ["DOWNTIME", "FORM_FAILURE", "CONVERSION_DROP", "DOMAIN_EXPIRING", "SSL_EXPIRING", "RENEWAL_DUE"];
  const channels = ["in_app", "email", "sms"];

  const getRuleEnabled = (alertType: string, channel: string) => {
    return notifRules?.find(r => r.alert_type === alertType && r.channel === channel)?.is_enabled ?? false;
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4 flex items-center gap-1">
        ← All Sites
      </button>

      <div className="flex items-center gap-3 mb-6">
        <StatusDot status={site.status} />
        <h1 className="text-2xl font-bold text-foreground">{site.domain}</h1>
        <Badge variant={site.status === "UP" ? "default" : "destructive"}>
          {site.status}
        </Badge>
      </div>

      <Tabs defaultValue={initialTab || "overview"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="broken-links">Broken Links</TabsTrigger>
          <TabsTrigger value="domain-ssl">Domain & SSL</TabsTrigger>
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
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
                      <Badge variant="outline" className="text-[10px]">{inc.severity}</Badge>
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

        {/* Broken Links */}
        <TabsContent value="broken-links" className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Broken Links ({brokenLinks?.length || 0})
              </h3>
              <ScanBrokenLinksButton siteId={site.id} />
            </div>
            {(!brokenLinks || brokenLinks.length === 0) ? (
              <p className="text-xs text-muted-foreground">No broken links detected. Run a scan to check.</p>
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
            <CheckDomainSslButton />
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
                <p className="text-xs text-muted-foreground">No domain data yet. Click "Check Now" above.</p>
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
                <p className="text-xs text-muted-foreground">No SSL data yet. Click "Check Now" above.</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Renewals */}
        <TabsContent value="renewals" className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Renewals
              </h3>
              <AddRenewalDialog onAdd={(values) => addRenewal.mutate(values)} />
            </div>

            {(!renewals || renewals.length === 0) ? (
              <p className="text-xs text-muted-foreground">No renewals tracked yet.</p>
            ) : (
              <div className="space-y-2">
                {renewals.map(r => {
                  const daysUntil = r.renewal_date ? Math.ceil((new Date(r.renewal_date).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm text-foreground font-medium">{r.provider_name || r.type}</p>
                        <p className="text-xs text-muted-foreground capitalize">{r.type} • {r.renewal_date || "No date"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {daysUntil !== null && (
                          <Badge variant={daysUntil <= 14 ? "destructive" : "outline"}>
                            {daysUntil}d
                          </Badge>
                        )}
                        <button onClick={() => deleteRenewal.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

// ─── Scan Broken Links Button ───────────────────────────────────

function ScanBrokenLinksButton({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-broken-links", {
        body: { site_id: siteId },
      });
      if (error) throw error;
      toast({ title: "Scan complete", description: `Found ${data?.broken_found || 0} broken links.` });
      queryClient.invalidateQueries({ queryKey: ["broken_links", siteId] });
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleScan} disabled={scanning} className="gap-1">
      <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
      {scanning ? "Scanning…" : "Scan Now"}
    </Button>
  );
}

// ─── Add Renewal Dialog ─────────────────────────────────────────

function AddRenewalDialog({ onAdd }: { onAdd: (values: { type: string; provider_name: string; renewal_date: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("hosting");
  const [provider, setProvider] = useState("");
  const [date, setDate] = useState("");

  const handleSubmit = () => {
    if (!date) return;
    onAdd({ type, provider_name: provider, renewal_date: date });
    setOpen(false);
    setProvider("");
    setDate("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Renewal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hosting">Hosting</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
              <SelectItem value="ssl">SSL</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Provider name" value={provider} onChange={e => setProvider(e.target.value)} />
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <Button onClick={handleSubmit} className="w-full">Add Renewal</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
