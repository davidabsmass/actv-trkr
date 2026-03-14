import { useState, useEffect } from "react";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import { useAuth } from "@/hooks/use-auth";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadPlugin } from "@/lib/plugin-download";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Download, Upload, Link2, Check, Copy, Eye, EyeOff, RefreshCw,
  AlertTriangle, CheckCircle, XCircle, Clock, Globe, Shield,
  ChevronDown, ChevronUp, Loader2, Unplug, RotateCcw, Mail,
  HelpCircle, Wifi, WifiOff, Activity,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

type ConnectionStatus = "not_connected" | "connecting" | "connected" | "error";

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const config = {
    not_connected: { label: "Not Connected", icon: WifiOff, cls: "bg-muted text-muted-foreground border-border" },
    connecting: { label: "Connecting", icon: Loader2, cls: "bg-warning/10 text-warning border-warning/20" },
    connected: { label: "Connected", icon: CheckCircle, cls: "bg-success/10 text-success border-success/20" },
    error: { label: "Connection Error", icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border ${c.cls}`}>
      <c.icon className={`h-3.5 w-3.5 ${status === "connecting" ? "animate-spin" : ""}`} />
      {c.label}
    </span>
  );
}

export default function WebsiteSetup() {
  const { orgId, orgName } = useOrg();
  const { user } = useAuth();
  const { activeTier } = usePlanTier();
  const { data: sites, isLoading: sitesLoading } = useSites(orgId);
  const queryClient = useQueryClient();

  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);

  // Track setup progress in localStorage
  const [progress, setProgress] = useState({ downloaded: false, keyCopied: false });
  useEffect(() => {
    const saved = localStorage.getItem("at_setup_progress");
    if (saved) setProgress(JSON.parse(saved));
  }, []);
  const saveProgress = (update: Partial<typeof progress>) => {
    const next = { ...progress, ...update };
    setProgress(next);
    localStorage.setItem("at_setup_progress", JSON.stringify(next));
  };

  // API key query
  const { data: apiKeyData } = useQuery({
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

  // Derive connection status
  const connectedSites = sites?.filter(s => s.last_heartbeat_at) ?? [];
  const allSites = sites ?? [];
  const connectionStatus: ConnectionStatus = allSites.length === 0
    ? "not_connected"
    : connectedSites.length > 0
      ? "connected"
      : allSites.some(s => !s.last_heartbeat_at)
        ? "connecting"
        : "error";

  const websiteConnected = connectionStatus === "connected";
  const trackingVerified = connectedSites.some(s => {
    if (!s.last_heartbeat_at) return false;
    const diff = Date.now() - new Date(s.last_heartbeat_at).getTime();
    return diff < 30 * 60 * 1000; // within 30 min
  });

  // Setup step completion
  const steps = [
    { label: "Download Plugin", done: progress.downloaded },
    { label: "Connect Website", done: websiteConnected },
    { label: "Confirm Tracking", done: trackingVerified },
  ];
  const completedSteps = steps.filter(s => s.done).length;
  const progressPct = Math.round((completedSteps / steps.length) * 100);

  // Allowed websites (1 per core, could expand later)
  const allowedWebsites = activeTier === "growth" ? 10 : activeTier === "performance" ? 5 : 1;
  const limitReached = allSites.length >= allowedWebsites;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // If there's an API key, download with it baked in
      // We don't have the raw key here, so download without
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
      saveProgress({ downloaded: true });
      toast.success("Plugin downloaded!");
    } catch (e: any) {
      toast.error(e.message || "Failed to download plugin");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyKey = () => {
    if (!apiKeyData?.key_hash) return;
    // We can't show the raw key — inform user to go to Settings > API Keys
    toast.info("For security, copy your API key from Settings → API Keys. The key is only shown once when generated.");
    saveProgress({ keyCopied: true });
  };

  const handleRecheck = async () => {
    setRecheckLoading(true);
    await queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
    setTimeout(() => setRecheckLoading(false), 1500);
  };

  const handleDisconnect = async (siteId: string, domain: string) => {
    if (!confirm(`Disconnect ${domain}? Historical data will be preserved.`)) return;
    const { error } = await supabase.from("sites").delete().eq("id", siteId);
    if (error) { toast.error("Failed to disconnect"); return; }
    toast.success(`${domain} disconnected`);
    queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 1. HERO */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Set Up Your Website</h1>
            <p className="text-sm text-muted-foreground">
              Download the plugin, connect your site, and start sending data to your ACTV TRKR dashboard.
            </p>
          </div>
          <StatusBadge status={connectionStatus} />
        </div>

        {/* Progress bar */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Setup Progress</span>
            <span className="text-xs font-semibold text-foreground">{completedSteps}/{steps.length} complete</span>
          </div>
          <Progress value={progressPct} className="h-2 mb-4" />
          <div className="grid grid-cols-3 gap-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {step.done ? (
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                )}
                <span className={`text-xs ${step.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. QUICK START CARDS */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-lg border border-border bg-card p-5 flex flex-col">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Download the Plugin</h3>
          <p className="text-xs text-muted-foreground mb-4 flex-1">
            Download the ACTV TRKR WordPress plugin and add it to your website.
          </p>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? "Downloading…" : "Download Plugin"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 flex flex-col">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Install and Activate</h3>
          <p className="text-xs text-muted-foreground mb-4 flex-1">
            Upload the plugin in WordPress, activate it, and open the ACTV TRKR settings.
          </p>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
          >
            {showInstructions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showInstructions ? "Hide Instructions" : "View Instructions"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 flex flex-col">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Connect Your Site</h3>
          <p className="text-xs text-muted-foreground mb-4 flex-1">
            Copy your license key, paste it into the plugin, and verify your website connection.
          </p>
          <button
            onClick={handleCopyKey}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy License Key
          </button>
        </div>
      </div>

      {/* 3. SETUP INSTRUCTIONS */}
      {showInstructions && (
        <div className="rounded-lg border border-border bg-card p-6 mb-8">
          <h2 className="text-base font-semibold text-foreground mb-4">How Setup Works</h2>
          <ol className="space-y-3 mb-5">
            {[
              "Download the ACTV TRKR plugin from this page.",
              "In WordPress, go to Plugins → Add Plugin → Upload Plugin.",
              "Upload the plugin zip file and activate it.",
              "Open ACTV TRKR settings inside WordPress (Settings → ACTV TRKR).",
              "Copy your unique license key from this dashboard (Settings → API Keys).",
              "Paste the key into the plugin and click Save Changes.",
              "Wait for connection confirmation — the plugin will automatically register your site.",
              "Once connected, your site will begin sending tracking and lead data to ACTV TRKR.",
            ].map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground pt-0.5">{text}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-lg bg-muted/50 border border-border p-4 flex gap-3">
            <HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Need help?</strong> Contact support if you run into setup issues. We're happy to walk you through the process.
            </p>
          </div>
        </div>
      )}

      {/* 4. LICENSE / API KEY PANEL */}
      <div className="rounded-lg border border-border bg-card p-6 mb-8">
        <h2 className="text-base font-semibold text-foreground mb-4">Your License Key</h2>
        <div className="grid gap-4 sm:grid-cols-2 mb-5">
          <div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">License Status</span>
            <div className="mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-success/10 text-success border border-success/20">
                <Check className="h-3 w-3" />
                Active
              </span>
            </div>
          </div>
          <div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Plan</span>
            <p className="text-sm font-medium text-foreground mt-1 capitalize">{activeTier}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Websites Allowed</span>
            <p className="text-sm font-medium text-foreground mt-1">{allowedWebsites}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Connected Websites</span>
            <p className="text-sm font-medium text-foreground mt-1">{allSites.length}</p>
          </div>
          {connectedSites[0] && (
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Primary Connected Domain</span>
              <p className="text-sm font-medium text-foreground mt-1">{connectedSites[0].domain}</p>
            </div>
          )}
          {apiKeyData && (
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Key Created</span>
              <p className="text-sm font-medium text-foreground mt-1">
                {format(new Date(apiKeyData.created_at), "MMM d, yyyy")}
              </p>
            </div>
          )}
        </div>

        {/* Key display */}
        {apiKeyData ? (
          <div className="rounded-lg bg-secondary p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-xs font-mono text-secondary-foreground flex-1 break-all">
                {showKey ? apiKeyData.key_hash.slice(0, 32) + "…" : "••••••••••••••••••••••••••••••••"}
              </code>
              <button onClick={() => setShowKey(!showKey)} className="p-1.5 rounded hover:bg-accent/20 transition-colors" title={showKey ? "Hide" : "Show"}>
                {showKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </button>
              <button onClick={handleCopyKey} className="p-1.5 rounded hover:bg-accent/20 transition-colors" title="Copy Key">
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              For security, full API keys are only shown once when generated. Visit <strong>Settings → API Keys</strong> to generate a new key.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-4 flex gap-3">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">No API key generated yet</p>
              <p className="text-xs text-muted-foreground">
                Go to <strong>Settings → API Keys</strong> to generate your license key. You'll need it to connect the plugin.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 5. CONNECTED WEBSITE STATUS PANEL */}
      <div className="rounded-lg border border-border bg-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Website Connection Status</h2>
          <button
            onClick={handleRecheck}
            disabled={recheckLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${recheckLoading ? "animate-spin" : ""}`} />
            Recheck Connection
          </button>
        </div>

        {sitesLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        ) : allSites.length === 0 ? (
          <div className="text-center py-10">
            <WifiOff className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">No website connected yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Download the plugin, install it on your WordPress site, and paste your API key to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {allSites.map(site => {
              const hasHeartbeat = !!site.last_heartbeat_at;
              const isRecent = hasHeartbeat && (Date.now() - new Date(site.last_heartbeat_at!).getTime() < 30 * 60 * 1000);
              const siteStatus: "connected" | "pending" | "disconnected" = isRecent ? "connected" : hasHeartbeat ? "pending" : "disconnected";
              const statusColors = {
                connected: "text-success",
                pending: "text-warning",
                disconnected: "text-destructive",
              };
              const statusLabels = {
                connected: "Connected",
                pending: "Pending",
                disconnected: "Awaiting Connection",
              };

              return (
                <div key={site.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{site.domain}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border ${
                        siteStatus === "connected" ? "bg-success/10 text-success border-success/20" :
                        siteStatus === "pending" ? "bg-warning/10 text-warning border-warning/20" :
                        "bg-destructive/10 text-destructive border-destructive/20"
                      }`}>
                        {statusLabels[siteStatus]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDisconnect(site.id, site.domain)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Unplug className="h-3 w-3" />
                        Disconnect
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Connected</span>
                      <p className="font-medium text-foreground">{format(new Date(site.created_at), "MMM d, yyyy")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Sync</span>
                      <p className="font-medium text-foreground">
                        {site.last_heartbeat_at ? format(new Date(site.last_heartbeat_at), "MMM d, h:mm a") : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Plugin Version</span>
                      <p className="font-medium text-foreground">{site.plugin_version ? `v${site.plugin_version}` : "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tracking</span>
                      <p className={`font-medium ${isRecent ? "text-success" : "text-muted-foreground"}`}>
                        {isRecent ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. DOMAIN MANAGEMENT */}
      <div className="rounded-lg border border-border bg-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Connected Websites</h2>
          <span className="text-xs text-muted-foreground">
            {allSites.length} / {allowedWebsites} website{allowedWebsites > 1 ? "s" : ""}
          </span>
        </div>

        {limitReached && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 flex gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              You've reached your website limit ({allowedWebsites}). Upgrade your plan to connect additional websites.
            </p>
          </div>
        )}

        {allSites.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No websites connected. Complete the setup steps above to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Domain</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Connected</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Last Activity</th>
                  <th className="text-right py-2 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {allSites.map(site => {
                  const isActive = site.last_heartbeat_at && (Date.now() - new Date(site.last_heartbeat_at).getTime() < 30 * 60 * 1000);
                  return (
                    <tr key={site.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 font-medium text-foreground">{site.domain}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 ${isActive ? "text-success" : "text-muted-foreground"}`}>
                          <Activity className="h-3 w-3" />
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{format(new Date(site.created_at), "MMM d, yyyy")}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {site.last_heartbeat_at ? format(new Date(site.last_heartbeat_at), "MMM d, h:mm a") : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => handleDisconnect(site.id, site.domain)}
                          className="text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. SECURITY INFO */}
      <div className="rounded-lg border border-border bg-card p-5 mb-8">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">How Your Account Is Protected</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your plugin download can only be used when connected to an active ACTV TRKR account with a valid license key.
              This helps protect account access and ensures each subscription is tied to approved websites only.
              The plugin itself does not contain sensitive credentials — access is controlled through your unique API key and account status.
            </p>
          </div>
        </div>
      </div>

      {/* 8. WELCOME EMAIL REFERENCE */}
      <div className="rounded-lg border border-border bg-card p-5 mb-8">
        <div className="flex gap-3">
          <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Getting Started Email</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              After purchase, customers receive a welcome email with their login link and setup instructions.
              This Website Setup page is your permanent source of truth for downloads, install steps, and connection details — it's always accessible from your dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
