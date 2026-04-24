import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, CheckCircle, AlertTriangle, Settings, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { AddSiteModal } from "@/components/sites/AddSiteModal";
import { Button } from "@/components/ui/button";

export default function SitesSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const { data: sites, isLoading } = useSites(orgId);
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingSiteIds, setRefreshingSiteIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const siteIds = sites?.map((site) => site.id) ?? [];

  const { data: domainHealth } = useQuery({
    queryKey: ["settings_domain_health", siteIds],
    queryFn: async () => {
      if (siteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("domain_health")
        .select("site_id, domain_expiry_date, days_to_domain_expiry, last_checked_at")
        .in("site_id", siteIds);
      if (error) throw error;
      return data;
    },
    enabled: siteIds.length > 0,
  });

  const { data: sslHealth } = useQuery({
    queryKey: ["settings_ssl_health", siteIds],
    queryFn: async () => {
      if (siteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("ssl_health")
        .select("site_id, ssl_expiry_date, days_to_ssl_expiry, last_checked_at")
        .in("site_id", siteIds);
      if (error) throw error;
      return data;
    },
    enabled: siteIds.length > 0,
  });

  const domainHealthBySite = useMemo(
    () => new Map((domainHealth ?? []).map((row) => [row.site_id, row])),
    [domainHealth],
  );

  const sslHealthBySite = useMemo(
    () => new Map((sslHealth ?? []).map((row) => [row.site_id, row])),
    [sslHealth],
  );

  useEffect(() => {
    if (siteIds.length === 0 || refreshingSiteIds.length > 0) return;

    const staleWindowMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const needsRefresh = (lastCheckedAt?: string | null) => {
      if (!lastCheckedAt) return true;
      const checkedAtMs = new Date(lastCheckedAt).getTime();
      return !Number.isFinite(checkedAtMs) || now - checkedAtMs > staleWindowMs;
    };

    const pendingSiteIds = siteIds.filter((siteId) => {
      const domain = domainHealthBySite.get(siteId);
      const ssl = sslHealthBySite.get(siteId);
      // Refresh if the data is stale OR if a previous check left expiry NULL
      // (e.g. crt.sh was down). The new certspotter source is more reliable.
      const sslMissing = !!ssl && ssl.ssl_expiry_date == null;
      const domainMissing = !!domain && domain.domain_expiry_date == null;
      return needsRefresh(domain?.last_checked_at) || needsRefresh(ssl?.last_checked_at) || sslMissing || domainMissing;
    });

    if (pendingSiteIds.length === 0) return;

    let cancelled = false;

    const refresh = async () => {
      setRefreshingSiteIds(pendingSiteIds);
      try {
        await Promise.allSettled(
          pendingSiteIds.map(async (siteId) => {
            const { data, error } = await supabase.functions.invoke("check-domain-ssl", {
              body: { site_id: siteId },
            });

            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || "Automatic domain and SSL check failed.");
          }),
        );

        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["settings_domain_health"] });
          queryClient.invalidateQueries({ queryKey: ["settings_ssl_health"] });
        }
      } finally {
        if (!cancelled) {
          setRefreshingSiteIds([]);
        }
      }
    };

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [siteIds, domainHealthBySite, sslHealthBySite, refreshingSiteIds.length, queryClient]);

  const handleDelete = async (siteId: string, domain: string) => {
    if (!confirm(t("settings.removeSiteConfirm", { domain }))) return;
    setDeletingId(siteId);
    try {
      const { error } = await supabase.from("sites").delete().eq("id", siteId);
      if (error) throw error;
      toast({ title: t("settings.siteRemoved"), description: t("settings.siteRemovedDesc", { domain }) });
      queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("settings.errorRemovingSite"), description: err?.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.connectedSites")}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Site
          </Button>
          <Link
            to="/settings?tab=setup"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Set Up Website
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Sites appear here automatically once the WordPress plugin is installed and connected with your license key. Additional sites are billed at $35/month.
      </p>

      <AddSiteModal
        open={addOpen}
        onOpenChange={setAddOpen}
        isFirstSite={!sites || sites.length === 0}
      />

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("settings.loadingKeys")}</p>
      ) : !sites || sites.length === 0 ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground mb-1">{t("settings.noSitesConnected")}</p>
            <p className="text-xs text-muted-foreground">
              Click <Link to="/settings?tab=setup" className="text-primary hover:underline font-medium">Set Up Website</Link> above to get your license key and install the WordPress plugin. Your site will appear here once connected.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => {
            const domain = domainHealthBySite.get(site.id);
            const ssl = sslHealthBySite.get(site.id);
            const isRefreshing = refreshingSiteIds.includes(site.id);
            const formatExpiry = (date?: string | null, days?: number | null) => {
              if (date) return days != null ? `${date} · ${days}d` : date;
              return isRefreshing ? t("settings.loading") : t("monitoring.unknown");
            };

            return (
            <div key={site.id} className="flex items-start gap-3 group">
              <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{site.domain}</p>
                <p className="text-xs text-muted-foreground">
                  {site.type} · {site.plugin_version ? `v${site.plugin_version}` : t("settings.versionUnknown")} · {t("settings.connected")} {(() => {
                    const d = site.created_at ? new Date(site.created_at) : null;
                    return d && !isNaN(d.getTime()) ? format(d, "MMM d, yyyy") : "—";
                  })()}
                </p>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-x-4">
                  <div className="flex items-center justify-between gap-3 sm:block">
                    <span>{t("monitoring.domainExpiry")}</span>
                    <span className="text-foreground sm:block sm:mt-0.5">{formatExpiry(domain?.domain_expiry_date, domain?.days_to_domain_expiry)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:block">
                    <span>{t("monitoring.sslExpiry")}</span>
                    <span className="text-foreground sm:block sm:mt-0.5">{formatExpiry(ssl?.ssl_expiry_date, ssl?.days_to_ssl_expiry)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(site.id, site.domain)}
                disabled={deletingId === site.id}
                className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )})}
        </div>
      )}
    </div>
  );
}
