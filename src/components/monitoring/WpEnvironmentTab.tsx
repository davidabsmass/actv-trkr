import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, AlertTriangle, Shield, Globe, Info, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface WpEnvPlugin {
  slug: string;
  name: string;
  version: string;
}

interface WpEnvUpdate {
  slug: string;
  name: string;
  new_version: string;
}

interface WpEnvironmentRow {
  id: string;
  site_id: string;
  org_id: string;
  wp_version: string | null;
  php_version: string | null;
  theme_name: string | null;
  theme_version: string | null;
  active_plugins: WpEnvPlugin[];
  plugin_updates: WpEnvUpdate[];
  core_update_available: string | null;
  last_reported_at: string;
}

export default function WpEnvironmentTab({ siteId, orgId }: { siteId: string | null; orgId: string | null }) {
  const { data: envData, isLoading } = useQuery({
    queryKey: ["wp_environment", siteId],
    queryFn: async () => {
      if (!siteId) return null;
      const { data, error } = await supabase
        .from("site_wp_environment" as any)
        .select("*")
        .eq("site_id", siteId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as WpEnvironmentRow | null;
    },
    enabled: !!siteId && !!orgId,
  });

  if (!siteId) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Select a site above to view WordPress environment details.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card p-5 animate-pulse">
            <div className="h-4 w-32 bg-muted rounded mb-3" />
            <div className="h-20 bg-muted/30 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!envData) {
    return (
      <div className="glass-card p-6 text-center space-y-2">
        <Package className="h-6 w-6 text-muted-foreground mx-auto" />
        <p className="text-sm font-medium text-foreground">No environment data yet</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          WordPress environment details will appear here after the plugin's first sync. Make sure ACTV TRKR plugin v1.6.2+ is installed.
        </p>
      </div>
    );
  }

  const plugins: WpEnvPlugin[] = Array.isArray(envData.active_plugins) ? envData.active_plugins : [];
  const updates: WpEnvUpdate[] = Array.isArray(envData.plugin_updates) ? envData.plugin_updates : [];
  const updateSlugs = new Set(updates.map(u => u.slug));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {/* Plugin Updates */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Plugin Updates
          </h3>
          {updates.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-5 text-center">
              <CheckCircle2 className="h-5 w-5 text-primary mx-auto mb-2" />
              <p className="text-xs font-medium text-foreground mb-1">All plugins up to date</p>
              <p className="text-xs text-muted-foreground">{plugins.length} active plugin{plugins.length !== 1 ? "s" : ""} — no updates available.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {updates.map((u, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground">→ v{u.new_version}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-warning text-warning shrink-0">Update Available</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Plugins List */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Active Plugins ({plugins.length})
          </h3>
          {plugins.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-5 text-center">
              <Shield className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No plugin data received yet.</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
              {plugins.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-xs text-foreground truncate mr-2">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                    v{p.version}
                    {updateSlugs.has(p.slug) && (
                      <AlertTriangle className="h-3 w-3 text-warning" />
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Core WordPress */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Core WordPress
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">WordPress</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">{envData.wp_version || "—"}</span>
                {envData.core_update_available ? (
                  <Badge variant="outline" className="text-[10px] border-warning text-warning">→ {envData.core_update_available}</Badge>
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">PHP</span>
              <span className="text-xs font-medium text-foreground">{envData.php_version || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Theme</span>
              <span className="text-xs font-medium text-foreground truncate ml-2 text-right">
                {envData.theme_name || "—"}{envData.theme_version ? ` (${envData.theme_version})` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Last reported</span>
              <span className="text-xs text-foreground">{format(new Date(envData.last_reported_at), "MMM d, HH:mm")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Environment data is reported automatically every 5 minutes. Last update: {format(new Date(envData.last_reported_at), "MMM d, yyyy 'at' h:mm a")}</span>
        </div>
      </div>
    </>
  );
}
