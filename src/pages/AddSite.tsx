import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { downloadPlugin, getLatestPluginVersion } from "@/lib/plugin-download";
import {
  Download,
  PlugZap,
  CheckCircle2,
  Loader2,
  Sparkles,
  KeyRound,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";

interface StepProps {
  number: number;
  title: string;
  description: string;
  icon: React.ElementType;
  children?: React.ReactNode;
}

function Step({ number, title, description, icon: Icon, children }: StepProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 flex gap-4 sm:gap-5">
      <div className="flex-shrink-0">
        <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
          {number}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm sm:text-base font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{description}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * "Add another site" — one-click pre-keyed plugin download.
 *
 * Behavior:
 *   1. Generates a NEW raw API key (and inserts the hash into `api_keys`)
 *      WITHOUT revoking the org's existing active key. Both keys remain valid
 *      so previously-connected sites keep reporting.
 *   2. Calls `serve-plugin-zip` with the new raw key in `x-actvtrkr-api-key`,
 *      so the downloaded ZIP arrives with `mm_api_key` already populated.
 *   3. The user just installs + activates in WordPress. No paste, no copy.
 *
 * Fallback path: a collapsible "I already have my license key" reveals the
 * legacy unkeyed download + manual paste flow for users who prefer that.
 *
 * Backend note: `ingest-heartbeat` auto-registers a new `sites` row when an
 * unseen `site_url` reports in with any valid org key, so no explicit
 * site-creation step is required.
 */
export default function AddSite() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const { data: sites } = useSites(orgId);
  const [preparing, setPreparing] = useState(false);
  const [downloadedFor, setDownloadedFor] = useState(false);
  const [showManualFlow, setShowManualFlow] = useState(false);
  const [manualDownloading, setManualDownloading] = useState(false);

  // Snapshot the site count at mount so we can detect the new site arriving.
  const initialSiteCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (initialSiteCountRef.current === null && sites) {
      initialSiteCountRef.current = sites.length;
    }
  }, [sites]);

  const newSiteDetected = useMemo(() => {
    if (initialSiteCountRef.current === null || !sites) return null;
    if (sites.length > initialSiteCountRef.current) {
      return sites[0];
    }
    return null;
  }, [sites]);

  // Poll for newly-registered sites while on this page.
  useQuery({
    queryKey: ["sites-poll", orgId],
    queryFn: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
      return Date.now();
    },
    enabled: !!orgId && !newSiteDetected,
    refetchInterval: 5000,
  });

  const { data: latestVersion } = useQuery({
    queryKey: ["plugin-version"],
    queryFn: getLatestPluginVersion,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * One-click flow: mint a new key (without revoking existing) → embed it in
   * the ZIP via serve-plugin-zip → trigger browser download. Raw key is held
   * only in memory for the duration of the download request.
   */
  const handlePreparedDownload = async () => {
    if (!orgId) {
      toast.error("No organization selected");
      return;
    }
    setPreparing(true);
    try {
      const rawKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(rawKey),
      );
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // IMPORTANT: do NOT revoke existing active keys. We want all previously
      // connected sites to keep working.
      const { error: insertErr } = await supabase.from("api_keys").insert({
        org_id: orgId,
        key_hash: keyHash,
        label: "Additional site key",
      });
      if (insertErr) throw insertErr;

      await downloadPlugin(rawKey);
      setDownloadedFor(true);
      toast.success("Plugin downloaded — install & activate in WordPress");
    } catch (err: any) {
      toast.error("Could not prepare plugin download", {
        description: err?.message || "Please try again.",
      });
    } finally {
      setPreparing(false);
    }
  };

  const handleManualDownload = async () => {
    setManualDownloading(true);
    try {
      await downloadPlugin();
      toast.success("Plugin download started");
    } catch (err: any) {
      toast.error("Download failed", { description: err?.message });
    } finally {
      setManualDownloading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10 flex-shrink-0">
            <PlugZap className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Connect another website
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We'll prepare a plugin file with your account already linked — no
              license key to copy, paste, or remember. Just install and activate
              in WordPress.
            </p>
          </div>
        </div>
      </div>

      <Step
        number={1}
        title="Download your pre-configured plugin"
        description="The downloaded plugin will already be linked to your account. No license key step required on the WordPress side."
        icon={Sparkles}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handlePreparedDownload} disabled={preparing}>
            {preparing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Preparing your plugin…
              </>
            ) : downloadedFor ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Download again
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download pre-configured plugin
              </>
            )}
          </Button>
          {latestVersion && (
            <span className="text-xs text-muted-foreground">
              Latest version: v{latestVersion}
            </span>
          )}
        </div>
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
          <div>
            Your existing sites stay connected — we don't touch the key they're
            already using. This download contains a separate key for the new
            site only.
          </div>
        </div>
      </Step>

      <Step
        number={2}
        title="Install & activate in WordPress"
        description="In the new WordPress site, go to Plugins → Add New → Upload Plugin, choose the file you just downloaded, install it, and click Activate. You're done — no settings to configure."
        icon={PlugZap}
      />

      <Step
        number={3}
        title="We'll detect it automatically"
        description="The new site will start reporting within a few seconds of activation."
        icon={CheckCircle2}
      >
        {newSiteDetected ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground mb-1">
                  New site connected!
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {newSiteDetected.display_name || newSiteDetected.domain || newSiteDetected.url || "Your new site"}{" "}
                  is now reporting to your dashboard.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => navigate("/")}>
                    Go to Dashboard
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate("/settings?tab=general")}
                  >
                    Back to Settings
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/40 p-3 flex items-center gap-3">
            <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Waiting for your new site to report in… this usually happens
              within a few seconds of activating the plugin.
            </p>
          </div>
        )}
      </Step>

      {/* Fallback for users who'd rather paste their existing key */}
      <Collapsible open={showManualFlow} onOpenChange={setShowManualFlow}>
        <CollapsibleTrigger asChild>
          <button className="text-xs text-muted-foreground hover:text-foreground underline">
            {showManualFlow ? "Hide" : "Already have your license key? Use it instead"}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Manual setup with your existing key
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Download the plain plugin, install it in WordPress, then go to
              Settings → ACTV TRKR and paste in your existing license key.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualDownload}
              disabled={manualDownloading}
            >
              {manualDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing download…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download plain plugin
                </>
              )}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
