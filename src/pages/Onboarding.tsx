import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Zap, Plus, Copy, Check, Download, Globe, Shield } from "lucide-react";
import { useOrgs } from "@/hooks/use-dashboard-data";
import { useAuth } from "@/hooks/use-auth";
import { downloadPlugin, getLatestPluginVersion } from "@/lib/plugin-download";
import { toast } from "@/hooks/use-toast";

const COMPLIANCE_MODES = [
  {
    value: "eu_us",
    label: "EU/UK Strict + US Opt-Out",
    tag: "Recommended",
    description: "EU/UK visitors see a consent banner. US visitors browse freely with an opt-out link.",
  },
  {
    value: "global_strict",
    label: "Global Strict",
    tag: null,
    description: "Every visitor sees a consent banner before any analytics run.",
  },
] as const;

const Onboarding = () => {
  const navigate = useNavigate();
  const { data: latestVersion } = useQuery({
    queryKey: ["latest_plugin_version", "plugin_info"],
    queryFn: getLatestPluginVersion,
    staleTime: 1000 * 60,
  });
  const { loading: authLoading, user } = useAuth();
  const { data: orgs, status, refetch } = useOrgs();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdOrg, setCreatedOrg] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [savingSite, setSavingSite] = useState(false);
  const [siteSaved, setSiteSaved] = useState(false);
  const [complianceMode, setComplianceMode] = useState("eu_us");

  const handleAddSite = async () => {
    if (!siteUrl || !createdOrg) return;
    setSavingSite(true);
    try {
      let domain: string;
      try {
        domain = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname;
      } catch {
        domain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
      }
      const { error } = await supabase
        .from("sites")
        .upsert({ org_id: createdOrg.id, domain }, { onConflict: "org_id,domain" });
      if (error) throw error;
      setSiteSaved(true);
      toast({ title: "Site registered", description: `${domain} has been added.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error adding site", description: err?.message || "Something went wrong" });
    } finally {
      setSavingSite(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const orgId = crypto.randomUUID();

      // Atomically create org + admin membership via security-definer RPC
      const { error: orgErr } = await supabase.rpc("create_org_with_admin", {
        p_org_id: orgId,
        p_name: name,
      });
      if (orgErr) throw orgErr;

      // Generate API key and store hash
      const rawKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0")).join("");

      const { error: akErr } = await supabase
        .from("api_keys")
        .insert({ org_id: orgId, key_hash: keyHash, label: "Default" });
      if (akErr) throw akErr;

      // Mark onboarding complete so the Dashboard modal doesn't re-ask
      await supabase
        .from("site_settings")
        .upsert({ org_id: orgId, onboarding_completed: true }, { onConflict: "org_id" });

      setCreatedOrg({ id: orgId, name });
      setApiKey(rawKey);
      refetch();
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Error creating organization", description: err?.message || "Something went wrong" });
    } finally {
      setLoading(false);
    }
  };

  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isReady = !authLoading && !!user && status === "success";
  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (orgs && orgs.length > 0 && !createdOrg) {
    return <Navigate to="/dashboard" replace />;
  }

  if (createdOrg && apiKey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="glass-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Organization Created!</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Copy the API key below — you'll need it for the WordPress plugin. This is shown only once.
            </p>
            <div className="bg-secondary rounded-lg p-3 flex items-center gap-2 mb-4">
              <code className="text-xs font-mono text-white flex-1 break-all">{apiKey}</code>
              <button onClick={copyApiKey} className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <h3 className="text-sm font-medium text-foreground mb-1">WordPress Plugin</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Download the plugin and upload it to WordPress — your API key is baked in. Just activate and tracking starts automatically.
              </p>
              <button
                onClick={() => downloadPlugin(apiKey!)}
                className="w-full py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                {`Download Plugin${latestVersion ? ` v${latestVersion}` : ""} (.zip)`}
              </button>
            </div>
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">Add Your Website</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Enter your website URL to pre-register it. This helps verify the connection.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. www.example.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  disabled={siteSaved}
                  className="flex-1 px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                />
                <button
                  onClick={handleAddSite}
                  disabled={!siteUrl || savingSite || siteSaved}
                  className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {siteSaved ? <><Check className="h-3.5 w-3.5" /> Added</> : savingSite ? "Saving…" : "Add"}
                </button>
              </div>
            </div>
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">Privacy & Compliance Mode</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Choose how the consent banner behaves for visitors from different regions. You can change this later in the WordPress plugin settings.
              </p>
              <div className="space-y-2">
                {COMPLIANCE_MODES.map((mode) => (
                  <label
                    key={mode.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      complianceMode === mode.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="compliance_mode"
                      value={mode.value}
                      checked={complianceMode === mode.value}
                      onChange={() => setComplianceMode(mode.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{mode.label}</span>
                        {mode.tag && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {mode.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                This sets the default in the plugin. Go to <strong>WP Admin → Settings → ACTV TRKR → Consent Banner → Compliance Mode</strong> to adjust after install.
              </p>
            </div>
            <button onClick={() => navigate("/checkout")} className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
              Continue to Checkout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 glow-primary">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">ACTV TRKR</span>
        </div>
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Set up your organization</h2>
          <p className="text-sm text-muted-foreground mb-5">Create an org to start tracking analytics.</p>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text" placeholder="Organization name (e.g., Example Ortho)" value={name}
              onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm bg-white border border-border rounded-lg text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button type="submit" disabled={loading || !name}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" />
              {loading ? "Creating..." : "Create Organization"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
