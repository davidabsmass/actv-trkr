import { useState, useEffect, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Zap, Plus, Copy, Check, Download, Globe, Shield } from "lucide-react";
import { useOrgs } from "@/hooks/use-dashboard-data";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { downloadPlugin, getLatestPluginVersion } from "@/lib/plugin-download";
import { toast } from "@/hooks/use-toast";

/**
 * Derive a sensible default org name from the authenticated user.
 * Prefer full name from auth metadata, else the email local-part, else "My Workspace".
 */
function deriveDefaultOrgName(user: { email?: string | null; user_metadata?: any } | null): string {
  if (!user) return "My Workspace";
  const meta = user.user_metadata || {};
  const fullName = (meta.full_name || meta.name || "").toString().trim();
  if (fullName) return fullName;
  const email = (user.email || "").toString();
  if (email.includes("@")) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "My Workspace";
}

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
  const { subscribed, billingExempt, isLoading: subLoading } = useSubscription(user?.id);

  const [loading, setLoading] = useState(false);
  const [createdOrg, setCreatedOrg] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [savingSite, setSavingSite] = useState(false);
  const [siteSaved, setSiteSaved] = useState(false);
  const [complianceMode, setComplianceMode] = useState("eu_us");
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [marketingSaved, setMarketingSaved] = useState(false);
  const provisioningRef = useRef(false);

  const handleSaveMarketingPref = async () => {
    setSavingMarketing(true);
    try {
      const { error } = await supabase.functions.invoke("record-marketing-consent", {
        body: { optIn: marketingOptIn, source: "onboarding" },
      });
      if (error) throw error;
      setMarketingSaved(true);
      toast({ title: "Saved", description: marketingOptIn ? "You're subscribed to ACTV TRKR updates." : "Preference saved." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Could not save preference" });
    } finally {
      setSavingMarketing(false);
    }
  };

  const alreadyPaid = subscribed || billingExempt;

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

  const handleCreate = async (orgName: string) => {
    setLoading(true);
    setProvisionError(null);
    try {
      const { data: { user: authedUser } } = await supabase.auth.getUser();
      if (!authedUser) throw new Error("Not authenticated");

      const requestedOrgId = crypto.randomUUID();

      // Atomically create org + admin membership via security-definer RPC.
      // The RPC is idempotent: if the user already belongs to an org, it
      // returns that existing org_id instead of creating a duplicate.
      const { data: rpcOrgId, error: orgErr } = await supabase.rpc("create_org_with_admin", {
        p_org_id: requestedOrgId,
        p_name: orgName,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        p_allow_existing: true,
      });
      if (orgErr) throw orgErr;

      const orgId = (rpcOrgId as unknown as string) || requestedOrgId;

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

      // Mark onboarding complete AND persist compliance mode
      await supabase
        .from("site_settings")
        .upsert(
          {
            org_id: orgId,
            onboarding_completed: true,
            primary_focus: "lead_volume",
            primary_goal: "get_more_leads",
          },
          { onConflict: "org_id" }
        );

      // Save compliance mode to consent_config (default region/EU+US)
      await supabase
        .from("consent_config")
        .upsert(
          {
            org_id: orgId,
            consent_mode: complianceMode === "global_strict" ? "strict" : "region",
          },
          { onConflict: "org_id" }
        );

      setCreatedOrg({ id: orgId, name: orgName });
      setApiKey(rawKey);
      refetch();
    } catch (err: any) {
      console.error(err);
      provisioningRef.current = false;
      const message = err?.message || "Something went wrong";
      setProvisionError(message);
      toast({ variant: "destructive", title: "Error setting up workspace", description: message });
    } finally {
      setLoading(false);
    }
  };

  // Auto-provision an org silently as soon as we know the user has none.
  // The org name is derived from the user's profile/email — users do NOT
  // need to fill out a form. This makes the onboarding step invisible.
  useEffect(() => {
    if (authLoading || !user) return;
    if (status !== "success") return;
    if (orgs && orgs.length > 0) return;
    if (createdOrg) return;
    if (provisioningRef.current) return;
    provisioningRef.current = true;
    handleCreate(deriveDefaultOrgName(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, status, orgs, createdOrg]);


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
                  className="flex-1 px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
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
              <h3 className="text-sm font-medium text-foreground mb-1">Stay in the loop (optional)</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Occasional product updates, tips, and new features from ACTV TRKR. We'll never email your website's leads — that data belongs to you.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => { setMarketingOptIn(e.target.checked); setMarketingSaved(false); }}
                  className="mt-0.5 accent-primary"
                />
                <span className="text-xs text-foreground">Email me ACTV TRKR product updates and tips.</span>
              </label>
              <button
                onClick={handleSaveMarketingPref}
                disabled={savingMarketing || marketingSaved}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {marketingSaved ? "Saved ✓" : savingMarketing ? "Saving…" : "Save preference"}
              </button>
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
            {subLoading ? (
              <div className="w-full py-2.5 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : alreadyPaid ? (
              <button
                onClick={() => navigate("/dashboard")}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Go to Dashboard
              </button>
            ) : (
              <button
                onClick={async () => {
                  try {
                    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
                    const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                    const res = await fetch(`${SUPABASE_URL}/functions/v1/actv-checkout`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
                      body: JSON.stringify({ plan: "monthly", email: user?.email }),
                    });
                    const data = await res.json();
                    if (data.url) window.location.href = data.url;
                    else throw new Error(data.error || "Checkout failed");
                  } catch (err: any) {
                    toast({ title: "Checkout error", description: err.message, variant: "destructive" });
                  }
                }}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Continue to Checkout
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Auto-provisioning in progress — never show a form. The user shouldn't
  // need to "set up an organization"; their workspace is created silently.
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center space-y-4">
        <div className="mx-auto flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 glow-primary">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        {loading ? (
          <>
            <div className="mx-auto w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
          </>
        ) : provisionError ? (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">We couldn’t finish setting up your workspace.</p>
              <p className="text-xs text-muted-foreground break-words">{provisionError}</p>
            </div>
            <button
              onClick={() => {
                provisioningRef.current = false;
                handleCreate(deriveDefaultOrgName(user));
              }}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
