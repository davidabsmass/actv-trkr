import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { downloadPlugin, getLatestPluginVersion } from "@/lib/plugin-download";
import {
  Download,
  KeyRound,
  PlugZap,
  Link2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ShieldAlert,
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
 * Dedicated flow for connecting an *additional* site to an existing account.
 * Critically: this flow NEVER generates or rotates the org API key. The same
 * org-level key authenticates every connected site.
 *
 * Backend note: `ingest-heartbeat` auto-registers a new `sites` row when an
 * unseen `site_url` reports in with a valid key, so no explicit site-creation
 * step is required here.
 */
export default function AddSite() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const { data: sites } = useSites(orgId);
  const [downloading, setDownloading] = useState(false);
  const [showLostKey, setShowLostKey] = useState(false);

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
      // Newest-first ordering in useSites means sites[0] is the freshest.
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // No apiKey passed → static/unkeyed ZIP. User will paste their existing
      // key into WP admin after installing.
      await downloadPlugin();
      toast.success("Plugin download started");
    } catch (err: any) {
      toast.error("Download failed", { description: err?.message });
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerateWarning = () => {
    // Intentionally route to the API Keys area (general tab) rather than
    // doing it here — users must see the full "Replace key" context and
    // warning before rotating. Rotating disconnects every other site.
    navigate("/settings?tab=general#api-keys");
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
              You already have a license key that works across all your sites — you
              don't need to generate a new one. Just install the plugin on the new
              WordPress site and paste in your existing key.
            </p>
          </div>
        </div>
      </div>

      <Step
        number={1}
        title="Use your existing license key"
        description="The license key you already have is tied to your account, not a single website. The same key works on every WordPress site you connect."
        icon={KeyRound}
      >
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
          <div>
            Grab the license key from wherever you saved it when you first set up
            your original site (password manager, notes, etc.). You'll paste it in
            during Step 3.
          </div>
        </div>

        <Collapsible open={showLostKey} onOpenChange={setShowLostKey} className="mt-3">
          <CollapsibleTrigger asChild>
            <button className="text-xs text-primary hover:underline font-medium">
              {showLostKey ? "Hide" : "Can't find your key?"}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground/80 space-y-2">
              <div className="flex gap-2">
                <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5 text-destructive" />
                <div>
                  <p className="font-semibold text-foreground mb-1">
                    Keys are stored securely (hashed)
                  </p>
                  <p>
                    For security, we never store your raw key — which means we
                    can't re-display it. If you can't locate your saved key, your
                    only option is to <strong>replace</strong> it.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-destructive" />
                <div>
                  <p className="font-semibold text-foreground mb-1">
                    Replacing the key disconnects every connected site
                  </p>
                  <p>
                    You'll need to paste the new key into every WordPress site
                    you've already connected, or they'll stop reporting. Only do
                    this if you're prepared to update each site.
                  </p>
                </div>
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateWarning}
                  className="mt-1"
                >
                  I understand — go to API Keys
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Step>

      <Step
        number={2}
        title="Download & install the plugin on the new site"
        description="Same plugin ZIP you used on your first site. In WordPress, go to Plugins → Add New → Upload Plugin, choose the file, and activate."
        icon={Download}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Preparing download…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download plugin
              </>
            )}
          </Button>
          {latestVersion && (
            <span className="text-xs text-muted-foreground">
              Latest version: v{latestVersion}
            </span>
          )}
        </div>
      </Step>

      <Step
        number={3}
        title="Paste your license key into WordPress"
        description="In the new WordPress site, go to Settings → ACTV TRKR, paste your existing license key, and click Save Changes. We'll detect the new site automatically."
        icon={Link2}
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
                  {newSiteDetected.domain || newSiteDetected.site_url || "Your new site"}{" "}
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
              Waiting for your new site to report in… this usually happens within a
              few seconds of saving the license key in WordPress.
            </p>
          </div>
        )}
      </Step>
    </div>
  );
}
