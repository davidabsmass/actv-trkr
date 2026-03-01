import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plug, Copy, Check, ExternalLink, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function PluginSection() {
  const { orgId } = useOrg();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { data: activeKey } = useQuery({
    queryKey: ["active_api_key", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, label, created_at, key_hash")
        .eq("org_id", orgId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data?.length) return null;
      return data[0];
    },
    enabled: !!orgId,
  });

  const endpointUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const zipUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-plugin-zip`;
      const response = await fetch(zipUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "actv-trkr.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Plugin downloaded! Upload via WordPress → Plugins → Add New → Upload.");
    } catch (e: any) {
      toast.error(e.message || "Failed to download plugin");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">WordPress Plugin</h3>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {downloading ? "Downloading…" : "Download Plugin"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Download the plugin, upload it to WordPress, then paste these connection settings.
      </p>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Connection Settings</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste these values into WordPress → Settings → ACTV TRKR.
        </p>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Endpoint URL
            </label>
            <div className="flex items-center gap-1.5 mt-1">
              <code className="text-xs font-mono text-secondary-foreground bg-secondary rounded px-2 py-1.5 flex-1 truncate">
                {endpointUrl}
              </code>
              <button
                onClick={() => copyToClipboard(endpointUrl, "endpoint")}
                className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors"
                title="Copy endpoint"
              >
                {copiedField === "endpoint" ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              API Key Status
            </label>
            <div className="mt-1">
              {activeKey ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-success/10 text-success border border-success/20">
                    <Check className="h-3 w-3" />
                    Active
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {activeKey.label} · created {new Date(activeKey.created_at).toLocaleDateString()}
                  </span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                  No active key
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
