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
  Upload,
  Link2,
  Copy,
  Loader2,
  CheckCircle2,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { downloadPlugin, getLatestPluginVersion } from "@/lib/plugin-download";

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
        .select("id, label, created_at, key_hash")
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

      await queryClient.invalidateQueries({ queryKey: ["active_api_key_setup", orgId] });
      toast.success("License key generated");
    } catch (e: any) {
      toast.error(e.message || "Could not generate key");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPlugin();
      toast.success("Plugin downloaded");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyKey = async () => {
    if (!apiKeyData?.key_hash) return;
    try {
      await navigator.clipboard.writeText(apiKeyData.key_hash);
      setCopied(true);
      toast.success("License key copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Please select and copy manually.");
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
          Connect your WordPress site in 3 simple steps. Everything you need is on this page.
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
          icon={KeyRound}
          title="Get Your License Key"
          description="This key links your WordPress site to your account. We generate it for you here — you do NOT create it inside WordPress."
          action={
            <div className="space-y-3">
              {keyLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : apiKeyData ? (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      readOnly
                      value={apiKeyData.key_hash}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 font-mono text-xs px-3 py-2.5 rounded-lg border border-border bg-secondary text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={handleCopyKey}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      {copied ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "Copied" : "Copy Key"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-success font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </span>
                    <span>
                      Plan: <span className="font-medium text-foreground capitalize">{activeTier}</span>
                    </span>
                    <button
                      onClick={generateKey}
                      disabled={generating}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                    >
                      {generating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Regenerate
                    </button>
                  </div>
                </>
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
          number={2}
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
          number={3}
          icon={Link2}
          title="Paste the Key in WordPress"
          description="In WordPress, go to Settings → ACTV TRKR. Paste the license key from Step 1 into the License Key field, then click Save Changes. Your site will connect within seconds."
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
    </div>
  );
}
