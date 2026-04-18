import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import { formatDistanceToNow } from "date-fns";
import { ShieldAlert, AlertTriangle, CheckCircle2, Lock, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FleetReport {
  id: string;
  site_id: string | null;
  domain: string;
  plugin_version: string | null;
  mode: string;
  forced_safe_mode: boolean;
  boot_failure_count: number;
  in_boot_loop: boolean;
  migration_lock_held: boolean;
  disabled_modules: string[];
  open_breakers: string[];
  last_error: string | null;
  blocked_versions: string[];
  reported_at: string;
}

const modeConfig: Record<string, { label: string; cls: string; icon: any }> = {
  healthy:          { label: "Healthy",         cls: "text-success bg-success/10 border-success/20",         icon: CheckCircle2 },
  degraded:         { label: "Degraded",        cls: "text-warning bg-warning/10 border-warning/20",         icon: AlertTriangle },
  reduced_mode:     { label: "Reduced Mode",    cls: "text-warning bg-warning/10 border-warning/20",         icon: ShieldAlert },
  migration_locked: { label: "Migration Locked", cls: "text-destructive bg-destructive/10 border-destructive/20", icon: Lock },
  safe_mode:        { label: "Safe Mode",       cls: "text-warning bg-warning/10 border-warning/20",         icon: ShieldAlert },
  unknown:          { label: "Unknown",         cls: "text-muted-foreground bg-muted/30 border-border",      icon: Activity },
};

export function FleetHealthWidget() {
  const { orgId } = useOrg();
  const { isAdmin } = useUserRole();
  const { isOrgAdmin } = useOrgRole(orgId);
  const canView = isAdmin || isOrgAdmin;

  const { data: reports, isLoading } = useQuery({
    queryKey: ["fleet_health_reports", orgId],
    queryFn: async () => {
      if (!orgId) return [] as FleetReport[];
      // Latest report per site_id (or domain when site_id is null).
      const { data, error } = await supabase
        .from("plugin_health_reports")
        .select("id, site_id, domain, plugin_version, mode, forced_safe_mode, boot_failure_count, in_boot_loop, migration_lock_held, disabled_modules, open_breakers, last_error, blocked_versions, reported_at")
        .eq("org_id", orgId)
        .order("reported_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const seen = new Set<string>();
      const latest: FleetReport[] = [];
      for (const r of (data ?? []) as FleetReport[]) {
        const key = r.site_id ?? `domain:${r.domain}`;
        if (seen.has(key)) continue;
        seen.add(key);
        latest.push(r);
      }
      return latest;
    },
    enabled: !!orgId && canView,
    refetchInterval: 60_000,
  });

  if (!canView) return null;
  if (isLoading) return null;
  if (!reports || reports.length === 0) return null;

  const unhealthy = reports.filter((r) => r.mode !== "healthy");
  const total = reports.length;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warning" /> Fleet Plugin Health
        </h3>
        <span className="text-xs text-muted-foreground">
          {unhealthy.length} of {total} site{total === 1 ? "" : "s"} need attention
        </span>
      </div>

      {unhealthy.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 className="h-4 w-4" />
          All connected sites report healthy plugin state.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {unhealthy.map((r) => {
            const cfg = modeConfig[r.mode] ?? modeConfig.unknown;
            const Icon = cfg.icon;
            return (
              <div
                key={r.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/40"
              >
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-foreground truncate">{r.domain}</p>
                    <Badge variant="outline" className={`${cfg.cls} border text-[10px]`}>
                      {cfg.label}
                    </Badge>
                    {r.plugin_version && (
                      <span className="text-[10px] text-muted-foreground">v{r.plugin_version}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                    {r.in_boot_loop && <span>boot loop ({r.boot_failure_count})</span>}
                    {r.migration_lock_held && <span>migration lock held</span>}
                    {r.forced_safe_mode && <span>forced safe mode</span>}
                    {r.disabled_modules.length > 0 && (
                      <span>{r.disabled_modules.length} module{r.disabled_modules.length === 1 ? "" : "s"} off</span>
                    )}
                    {r.open_breakers.length > 0 && (
                      <span>{r.open_breakers.length} breaker{r.open_breakers.length === 1 ? "" : "s"} open</span>
                    )}
                    {r.blocked_versions.length > 0 && (
                      <span>{r.blocked_versions.length} blocked version{r.blocked_versions.length === 1 ? "" : "s"}</span>
                    )}
                    <span className="ml-auto">
                      {formatDistanceToNow(new Date(r.reported_at), { addSuffix: true })}
                    </span>
                  </div>
                  {r.last_error && (
                    <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">{r.last_error}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
