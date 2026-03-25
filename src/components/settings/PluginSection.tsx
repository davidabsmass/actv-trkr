import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Download, Loader2 } from "lucide-react";
import pluginThumb from "@/assets/actv-trkr-plugin-thumb.jpg";
import { toast } from "sonner";

export default function PluginSection() {
  const { orgId } = useOrg();
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const zipUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-plugin-zip?t=${Date.now()}`;
      const response = await fetch(zipUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Extract versioned filename from Content-Disposition header
      const contentDisposition = response.headers.get("content-disposition") || "";
      const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
      const fileName = match?.[1] || "actv-trkr.zip";

      // Extract version from filename for toast
      const versionMatch = /actv-trkr-(\d+\.\d+\.\d+)\.zip/.exec(fileName);
      const version = versionMatch?.[1] || "";

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Plugin v${version || "latest"} downloaded! Upload via WordPress → Plugins → Add New → Upload.`);
    } catch (e: any) {
      toast.error(e.message || "Failed to download plugin");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <img src={pluginThumb} alt="ACTV TRKR Plugin" className="h-10 w-10 rounded-lg object-cover" />
          <h3 className="text-sm font-semibold text-foreground">WordPress Plugin</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">v1.4.0</span>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? "Downloading…" : "Download Plugin"}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Download the plugin, upload it to WordPress, then paste your API key in Settings → ACTV TRKR.
      </p>

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
  );
}
