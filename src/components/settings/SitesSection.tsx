import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import { Globe, CheckCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

export default function SitesSection() {
  const { orgId } = useOrg();
  const { data: sites, isLoading } = useSites(orgId);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Connected Sites</h3>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !sites || sites.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">No sites connected yet</p>
              <p className="text-xs text-muted-foreground">
                Install the WordPress plugin on your site and activate it. The site will appear here once the first pageview is received.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Setup checklist:</p>
            <ol className="list-decimal list-inside space-y-0.5 pl-1">
              <li>Download the plugin from Settings → API Keys</li>
              <li>Upload & activate in WordPress → Plugins</li>
              <li>Verify the API key is set in Settings → Mission Metrics</li>
              <li>Visit any page on your site to trigger the first pageview</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {sites.map((site) => (
            <div key={site.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/50">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-success flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-secondary-foreground">{site.domain}</p>
                  <p className="text-[11px] text-secondary-foreground/70">
                    {site.type} · {site.plugin_version ? `v${site.plugin_version}` : "version unknown"} · connected {format(new Date(site.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
