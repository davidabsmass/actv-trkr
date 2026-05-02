import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  Link2,
  Copy,
  Loader2,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { downloadPlugin, getLatestPluginVersion } from "@/lib/plugin-download";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface StepProps {
  number: number;
  title: string;
  description: string;
  action?: React.ReactNode;
  icon: React.ElementType;
}

function Step({ number, title, description, action, icon: Icon }: StepProps) {
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
        {action}
      </div>
    </div>
  );
}

export default function WebsiteSetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const { activeTier } = usePlanTier();
  const { data: sites } = useSites(orgId);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Raw key only ever lives in memory after generation. Never persisted, never re-fetchable.
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [keyVisible, setKeyVisible] = useState(true);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testFailed, setTestFailed] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const { data: latestVersion } = useQuery({
    queryKey: ["latest_plugin_version", "plugin_info"],
    queryFn: getLatestPluginVersion,
    staleTime: 1000 * 60,
  });

  const { data: apiKeyData, isLoading: keyLoading } = useQuery({
    queryKey: ["active_api_key_setup", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, label, created_at")
        .eq("org_id", orgId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!orgId,
  });

  const connectedSites = sites?.filter((s) => s.last_heartbeat_at || s.plugin_version) ?? [];
  const websiteConnected = connectedSites.length > 0;

  const generateKey = async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      // Revoke existing active keys first (one-active-key policy)
      const { data: existing } = await supabase
        .from("api_keys")
        .select("id")
        .eq("org_id", orgId)
        .is("revoked_at", null);
      for (const k of existing ?? []) {
        await supabase
          .from("api_keys")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", k.id);
      }

      // Raw key — this is the secret. It's shown to the user ONCE and never persisted in plain text.
      const rawKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(rawKey)
      );
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error } = await supabase.from("api_keys").insert({
        org_id: orgId,
        key_hash: keyHash,
        label: "Website License Key",
      });
      if (error) throw error;

      setRevealedKey(rawKey);
      setAcknowledged(false);
      setKeyVisible(true);
      setConfirmRegenerate(false);
      await queryClient.invalidateQueries({ queryKey: ["active_api_key_setup", orgId] });
      toast.success("License key generated — copy and save it now");
    } catch (e: any) {
      toast.error(e.message || "Could not generate key");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // If we just minted a key in this session, bake it into the ZIP so the
      // user gets a pre-configured plugin (no copy/paste required). Falls back
      // to the plain ZIP if the key isn't available (e.g. user dismissed it).
      await downloadPlugin(revealedKey || undefined);
      toast.success(
        revealedKey
          ? "Pre-configured plugin downloaded — install & activate, no key to paste"
          : "Plugin downloaded",
      );
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      toast.success("License key copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Please select and copy manually.");
    }
  };

  const handleDismissKey = () => {
    if (!acknowledged) {
      toast.error("Please confirm you've saved the key first");
      return;
    }
    setRevealedKey(null);
    setKeyVisible(true);
    setCopied(false);
  };

  const handleTestConnection = async () => {
    if (!orgId) return;
    setTesting(true);
    setTestFailed(false);
    try {
      // Force-refresh the sites query so we read live state, not cached.
      await queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
      const { data, error } = await supabase
        .from("sites")
        .select("id, last_heartbeat_at, plugin_version")
        .eq("org_id", orgId);
      if (error) throw error;
      const connected = (data ?? []).some(
        (s) => s.last_heartbeat_at || s.plugin_version,
      );
      if (connected) {
        setShowSuccessModal(true);
      } else {
        setTestFailed(true);
        toast.error(
          "No signal yet. Make sure the plugin is activated and the license key is saved in WordPress.",
        );
      }
    } catch (e: any) {
      setTestFailed(true);
      toast.error(e.message || "Could not test connection");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
          Set Up Your Website
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Connect your WordPress site in 4 simple steps. Everything you need is on this page.
        </p>
        {websiteConnected && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success border border-success/20 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Site connected
          </div>
        )}
      </div>

      {/* 3 Steps */}
      <div className="space-y-3 mb-8">
        <Step
          number={1}
          icon={Download}
          title="Download & Install the Plugin"
          description="Download the ACTV TRKR plugin, then in WordPress go to Plugins → Add Plugin → Upload Plugin. Upload the zip, install it, and activate it."
          action={
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading
                ? "Downloading…"
                : `Download Plugin${latestVersion ? ` v${latestVersion}` : ""}`}
            </button>
          }
        />

        <Step
          number={2}
          icon={KeyRound}
          title="Get Your License Key"
          description="This key links your WordPress site to your account. We generate it for you here."
          action={
            <div className="space-y-3">
              {keyLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : revealedKey ? (
                // ONE-TIME REVEAL: shown only in memory after generation
                <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3 sm:p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-foreground leading-relaxed">
                      <span className="font-semibold">Save this key in a safe place now.</span>{" "}
                      For your security, we will never show it again. If you lose it, you'll need to generate a new one — which will disconnect your current WordPress install until you update it.
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type={keyVisible ? "text" : "password"}
                      readOnly
                      value={revealedKey}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 font-mono text-xs px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setKeyVisible((v) => !v)}
                        title={keyVisible ? "Hide" : "Show"}
                        className="inline-flex items-center justify-center px-3 py-2.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors"
                      >
                        {keyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={handleCopyKey}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                    />
                    <span>I've copied my license key and saved it in a safe place.</span>
                  </label>
                  <button
                    onClick={handleDismissKey}
                    disabled={!acknowledged}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Done — hide key
                  </button>
                </div>
              ) : apiKeyData ? (
                // KEY EXISTS but not in memory — never re-displayable
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-secondary text-secondary-foreground font-mono text-xs">
                    <span className="text-muted-foreground">••••••••••••••••••••••••••••••••</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-success font-sans font-medium not-italic">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your license key is active and hidden for security. We only show keys once at the time of generation. If you've lost your key, you'll need to generate a new one — your WordPress site will be disconnected until you paste in the new key.
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <span className="text-muted-foreground">
                      Plan: <span className="font-medium text-foreground capitalize">{activeTier}</span>
                    </span>
                    {confirmRegenerate ? (
                      <div className="flex items-center gap-2">
                        <span className="text-warning font-medium">Generate a new key? Your site will disconnect.</span>
                        <button
                          onClick={generateKey}
                          disabled={generating}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-warning text-warning-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Yes, generate new
                        </button>
                        <button
                          onClick={() => setConfirmRegenerate(false)}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRegenerate(true)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Generate new key
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={generateKey}
                  disabled={generating}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  {generating ? "Generating…" : "Generate License Key"}
                </button>
              )}
            </div>
          }
        />

        <Step
          number={3}
          icon={Link2}
          title="Paste the Key in WordPress"
          description="In WordPress, go to Settings → ACTV TRKR. Paste the license key from Step 2 into the License Key field, then click Save Changes."
        />

        <Step
          number={4}
          icon={PlugZap}
          title="Test the Connection"
          description="Click below to confirm your site is talking to ACTV TRKR. If it's connected, you're all set."
          action={
            <div className="space-y-2">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                {testing ? "Testing…" : "Test Connection"}
              </button>
              {testFailed && !testing && (
                <p className="text-xs text-warning leading-relaxed">
                  We didn't hear from your site yet. Double-check that the plugin is activated and your license key is saved in WordPress, then try again.
                </p>
              )}
            </div>
          }
        />
      </div>

      {/* Support */}
      <p className="text-center text-xs text-muted-foreground">
        Need help?{" "}
        <button
          onClick={() => navigate("/settings?tab=feedback")}
          className="text-primary hover:underline font-medium"
        >
          Contact support
        </button>
        .
      </p>

      {/* Success modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <DialogTitle className="text-center text-xl flex items-center justify-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Connection established
            </DialogTitle>
            <DialogDescription className="text-center text-sm leading-relaxed pt-2">
              Your site just connected — forms, traffic, SEO and monitoring sync in the background and can take 5–15 minutes to fully populate. If something looks empty, give it a few minutes and refresh. You can safely keep working while we catch up.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center pt-2">
            <Button onClick={() => setShowSuccessModal(false)} className="w-full sm:w-auto">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
