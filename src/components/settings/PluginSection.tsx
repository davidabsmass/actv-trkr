import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Download, Loader2 } from "lucide-react";
import pluginThumb from "@/assets/actv-trkr-plugin-thumb.jpg";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function PluginSection() {
  const { t } = useTranslation();
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

  const { data: latestVersion } = useQuery({
    queryKey: ["latest_plugin_version"],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plugin-update-check?action=check&version=0.0.0&t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json.version as string;
    },
    staleTime: 1000 * 60,
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const zipUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-plugin-zip?t=${Date.now()}`;
      const response = await fetch(zipUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("content-disposition") || "";
      const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
      const fileName = match?.[1] || "actv-trkr.zip";
      const versionMatch = /actv-trkr-(\d+\.\d+\.\d+)\.zip/.exec(fileName);
      const version = versionMatch?.[1] || "";
      const a = document.createElement("a");
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Plugin v${version || "latest"} downloaded!`);
    } catch (e: any) {
      toast.error(e.message || t("settings.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <img src={pluginThumb} alt="ACTV TRKR Plugin" className="h-10 w-10 rounded-lg object-cover" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.wordpressPlugin")}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">v{latestVersion || "—"}</span>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? t("settings.downloadingPlugin") : t("settings.downloadPlugin")}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        {t("settings.pluginDownloadDesc")}
      </p>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t("settings.apiKeyStatus")}
        </label>
        <div className="mt-1">
          {activeKey ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-success/10 text-success border border-success/20">
                <Check className="h-3 w-3" />
                {t("settings.active")}
              </span>
              <span className="text-xs text-muted-foreground">
                {activeKey.label} · {t("settings.created").toLowerCase()} {new Date(activeKey.created_at).toLocaleDateString()}
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-destructive/10 text-destructive border border-destructive/20">
              {t("settings.noActiveKey")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}