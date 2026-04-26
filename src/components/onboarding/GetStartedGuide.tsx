import { useState } from "react";
import { Download, Plug, Activity, ChevronRight, Copy, Check } from "lucide-react";
import { downloadPlugin, PluginDownloadError } from "@/lib/plugin-download";
import { reportDownloadFailure } from "@/lib/report-download-failure";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface GetStartedGuideProps {
  compact?: boolean;
}

export default function GetStartedGuide({ compact = false }: GetStartedGuideProps) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { orgId } = useOrg();

  const { data: apiKey } = useQuery({
    queryKey: ["api-key-for-setup", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("key_hash")
        .eq("org_id", orgId!)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data?.key_hash ?? null;
    },
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPlugin();
      toast.success("Plugin downloaded successfully");
    } catch (e: any) {
      const isStructured = e instanceof PluginDownloadError;
      await reportDownloadFailure({
        stage: isStructured ? e.stage : "unknown",
        error: e,
        httpStatus: isStructured ? e.httpStatus : null,
        downloadUrl: isStructured ? e.downloadUrl : undefined,
        surface: "onboarding",
        orgId,
      });
      toast.error("Download failed — our team has been notified.");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API Key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={compact ? "" : "max-w-2xl mx-auto"}>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">
          Get Started in 3 Simple Steps
        </h2>
        <p className="text-muted-foreground mt-1">
          Set up tracking on your WordPress site in under 5 minutes.
        </p>
      </div>

      <div className="space-y-5">
        {/* Step 1 */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-bold">
              1
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Download className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Download & Install the Plugin
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">In your WordPress dashboard:</p>
              <ul className="space-y-1.5 mb-4">
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Go to <strong className="text-foreground">Plugins → Add New → Upload Plugin</strong></span>
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Upload the ACTV TRKR file and click <strong className="text-foreground">Activate</strong></span>
                </li>
              </ul>
              <p className="text-xs text-primary/80 font-medium">
                No code, no complicated setup.
              </p>

              <Button
                onClick={handleDownload}
                disabled={downloading}
                size="sm"
                className="mt-4"
              >
                <Download className="h-4 w-4 mr-2" />
                {downloading ? "Downloading…" : "Download Plugin"}
              </Button>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-bold">
              2
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Plug className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Connect Your Website
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                After activating the plugin, you'll see the ACTV TRKR settings panel.
              </p>

              {/* API Key display */}
              <p className="text-sm font-semibold text-foreground mb-2">Copy this API Key:</p>
              {apiKey ? (
                <div className="flex items-center gap-2 mb-4">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono text-foreground break-all select-all">
                    {apiKey}
                  </code>
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" aria-label={copied ? "API key copied" : "Copy API key"} onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-4 italic">
                  No active API key found. Go to <strong className="text-foreground">Settings → API Keys</strong> to generate one.
                </p>
              )}

              <ul className="space-y-1.5 mb-3">
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Paste it into the plugin settings</span>
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Click <strong className="text-foreground">Connect</strong></span>
                </li>
              </ul>
              <p className="text-xs text-primary/80 font-medium">
                Your site is now linked and ready to start tracking.
              </p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-bold">
              3
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Watch Your Data Come to Life
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Within minutes, ACTV TRKR begins collecting:
              </p>
              <ul className="space-y-1.5">
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Visitor activity</span>
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Form submissions</span>
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Traffic trends</span>
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Lead insights</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
