import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { downloadPlugin } from "@/lib/plugin-download";
import { Download, Plug, Copy, Check, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function PluginSection() {
  const { orgId } = useOrg();
  const [downloading, setDownloading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const handleDownload = async () => {
    if (!activeKey) {
      toast({
        variant: "destructive",
        title: "No active API key",
        description: "Generate an API key first in the API Keys section.",
      });
      return;
    }
    // Plugin download without baked key — user must configure manually
    toast({
      title: "Plugin download",
      description: "For security, API keys are no longer baked into downloads. Copy your key from the API Keys section and paste it in the WordPress plugin settings.",
    });
  };

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
      <div className="flex items-center gap-2 mb-1">
        <Plug className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">WordPress Plugin</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Download the latest plugin or check your connection settings.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Download Card */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Download Plugin</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Download the plugin, then configure your API key and endpoint in WordPress → Settings → ACTV TRKR.
          </p>
          <button
            onClick={handleDownload}
            disabled={downloading || !activeKey}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 w-full justify-center"
          >
            {downloading ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                Download actv-trkr.zip
              </>
            )}
          </button>
          <p className="text-[11px] text-muted-foreground">
            Current version: <span className="font-mono text-foreground">1.2.0</span>
          </p>
        </div>

        {/* Connection Info Card */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Connection Settings</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Use these values if you need to manually configure the plugin in WordPress → Settings → ACTV TRKR.
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
    </div>
  );
}
