import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, CheckCircle, AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

export default function SitesSection() {
  const { orgId } = useOrg();
  const { data: sites, isLoading } = useSites(orgId);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddSite = async () => {
    if (!siteUrl || !orgId) return;
    setSaving(true);
    try {
      let domain: string;
      try {
        domain = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname;
      } catch {
        domain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
      }
      const { error } = await supabase.from("sites").insert({ org_id: orgId, domain });
      if (error) throw error;
      toast({ title: "Site added", description: `${domain} has been registered.` });
      setSiteUrl("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error adding site", description: err?.message || "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (siteId: string, domain: string) => {
    if (!confirm(`Remove ${domain}? This won't delete historical data.`)) return;
    setDeletingId(siteId);
    try {
      const { error } = await supabase.from("sites").delete().eq("id", siteId);
      if (error) throw error;
      toast({ title: "Site removed", description: `${domain} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error removing site", description: err?.message || "Something went wrong" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Connected Sites</h3>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Site
          </button>
        )}
      </div>

      {showForm && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="e.g. www.example.com"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSite()}
            className="flex-1 px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={handleAddSite}
            disabled={!siteUrl || saving}
            className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add"}
          </button>
          <button
            onClick={() => { setShowForm(false); setSiteUrl(""); }}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !sites || sites.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">No sites connected yet</p>
              <p className="text-xs text-muted-foreground">
                Click "Add Site" above or install the WordPress plugin. The site will appear here once registered.
              </p>
            </div>
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
              <button
                onClick={() => handleDelete(site.id, site.domain)}
                disabled={deletingId === site.id}
                className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                title="Remove site"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
