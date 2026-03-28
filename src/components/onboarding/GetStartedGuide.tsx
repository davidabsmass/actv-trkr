import { useState } from "react";
import { Download, Plug, Activity, ChevronRight } from "lucide-react";
import { downloadPlugin } from "@/lib/plugin-download";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface GetStartedGuideProps {
  compact?: boolean;
}

export default function GetStartedGuide({ compact = false }: GetStartedGuideProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPlugin();
      toast.success("Plugin downloaded successfully");
    } catch {
      toast.error("Download failed — please try again");
    } finally {
      setDownloading(false);
    }
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
              <p className="text-sm text-muted-foreground mb-3">
                Log into your ACTV TRKR account and download the WordPress plugin.
              </p>
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
              <ul className="space-y-1.5 mb-3">
                <li className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                  <span>Copy your <strong className="text-foreground">API Key</strong> from your ACTV TRKR dashboard</span>
                </li>
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
