import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Zap, Check, Copy, Download, Globe, User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { downloadPlugin } from "@/lib/plugin-download";
import { toast } from "@/hooks/use-toast";

const Signup = () => {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  // Info fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Result
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (authErr) throw authErr;
      const user = authData.user;
      if (!user) throw new Error("Signup failed — no user returned");

      // 2. Sign in immediately so RLS works
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      // 3. Create org
      const orgId = crypto.randomUUID();
      const { error: orgErr } = await supabase.from("orgs").insert({ id: orgId, name: orgName });
      if (orgErr) throw orgErr;

      // 4. Add user as admin
      const { error: ouErr } = await supabase
        .from("org_users")
        .insert({ org_id: orgId, user_id: user.id, role: "admin" });
      if (ouErr) throw ouErr;

      // 5. Register site
      if (siteUrl) {
        let domain: string;
        try {
          domain = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname;
        } catch {
          domain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
        }
        await supabase.from("sites").insert({ org_id: orgId, domain });
      }

      // 6. Generate API key
      const rawKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      await supabase
        .from("api_keys")
        .insert({ org_id: orgId, key_hash: keyHash, label: "Default" });

      setApiKey(rawKey);
      setDone(true);
      toast({ title: "Account created!", description: "You're all set." });
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: err?.message || "Something went wrong" });
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 glow-primary">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">ACTV TRKR</span>
        </div>

        {/* Sign Up Form */}
        {!done && (
          <div className="glass-card p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-foreground mb-1">Create your account</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Fill in your details to get started with analytics tracking.
            </p>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Organization name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Website URL (e.g. www.example.com)"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !fullName || !email || !password || !orgName}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : (
                  "Create Account"
                )}
              </button>
            </form>
            <p className="text-center text-xs text-muted-foreground mt-4">
              Already have an account?{" "}
              <button onClick={() => navigate("/auth")} className="text-primary hover:underline font-medium">
                Sign in
              </button>
            </p>
          </div>
        )}

        {/* Complete */}
        {done && apiKey && (
          <div className="glass-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">You're all set!</h2>
            </div>

            {/* Step 1: Download Plugin */}
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span>
                <h3 className="text-sm font-medium text-foreground">Download the Plugin</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3 ml-7">
                Your API key is already baked in — no configuration needed.
              </p>
              <button
                onClick={() => downloadPlugin(apiKey)}
                className="w-full py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Plugin (.zip)
              </button>
            </div>

            {/* Step 2: Upload to WordPress */}
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">2</span>
                <h3 className="text-sm font-medium text-foreground">Upload &amp; Activate in WordPress</h3>
              </div>
              <ol className="text-xs text-muted-foreground ml-7 space-y-1.5 list-decimal list-inside">
                <li>Log in to your WordPress admin panel</li>
                <li>Go to <span className="font-medium text-foreground">Plugins → Add New → Upload Plugin</span></li>
                <li>Choose the <span className="font-medium text-foreground">actv-trkr.zip</span> file you just downloaded</li>
                <li>Click <span className="font-medium text-foreground">Install Now</span>, then <span className="font-medium text-foreground">Activate</span></li>
              </ol>
            </div>

            {/* Step 3: Automatic sync */}
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">3</span>
                <h3 className="text-sm font-medium text-foreground">You're Connected</h3>
              </div>
              <p className="text-xs text-muted-foreground ml-7">
                Once activated, the plugin automatically registers your site, discovers your forms, and starts tracking pageviews and leads. Data typically appears on your dashboard within a few minutes.
              </p>
            </div>

            {/* Dashboard URL */}
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">Your Dashboard</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-2 ml-6">
                Bookmark this — it's where you'll see your results.
              </p>
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <code className="text-xs font-mono text-foreground flex-1 break-all">
                  {`https://actvtrkr.com/auth`}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://actvtrkr.com/auth`);
                    toast({ title: "Copied!", description: "Dashboard URL copied to clipboard." });
                  }}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors"
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* API Key (collapsible detail) */}
            <details className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <summary className="text-xs font-medium text-muted-foreground cursor-pointer">Show API Key</summary>
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2 mt-2">
                <code className="text-xs font-mono text-foreground flex-1 break-all">{apiKey}</code>
                <button onClick={copyApiKey} className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>
            </details>

            <button
              onClick={() => navigate("/")}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Signup;
