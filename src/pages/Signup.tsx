import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Check, Copy, Download, Globe, User, Mail, Lock, Eye, EyeOff, Zap } from "lucide-react";
import { downloadPlugin } from "@/lib/plugin-download";
import { toast } from "@/hooks/use-toast";
import actvTrkrLogo from "@/assets/actv-trkr-logo-white.svg";
import SparkleCanvas from "@/components/SparkleCanvas";
import spaceBg from "@/assets/space-bgd-new.jpg";

const inputClass =
  "w-full pl-10 pr-3 py-2.5 text-sm bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50";

const Signup = () => {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (authErr) throw authErr;
      const user = authData.user;
      if (!user) throw new Error("Signup failed — no user returned");

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      const orgId = crypto.randomUUID();
      const { error: orgErr } = await supabase.rpc("create_org_with_admin", {
        p_org_id: orgId,
        p_name: orgName,
      });
      if (orgErr) throw orgErr;

      if (siteUrl) {
        let domain: string;
        try {
          domain = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname;
        } catch {
          domain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
        }
        await supabase.from("sites").insert({ org_id: orgId, domain });
      }

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
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{
        backgroundImage: `url(${spaceBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <SparkleCanvas />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-11 w-auto" />
        </div>

        {/* Sign Up Form */}
        {!done && (
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl animate-slide-up">
            <h2 className="text-lg font-semibold text-white mb-1">Create your account</h2>
            <p className="text-sm text-white/60 mb-5">
              Fill in your details to get started with analytics tracking.
            </p>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Organization name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Website URL (e.g. www.example.com)"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className={inputClass}
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
            <p className="text-center text-xs text-white/50 mt-4">
              Already have an account?{" "}
              <button onClick={() => navigate("/auth")} className="text-primary hover:underline font-medium">
                Sign in
              </button>
            </p>
          </div>
        )}

        {/* Complete */}
        {done && apiKey && (
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-white">You're all set!</h2>
            </div>

            {/* Step 1: Download Plugin */}
            <div className="border border-white/10 rounded-lg p-4 mb-4 bg-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                <h3 className="text-sm font-medium text-white">Download the Plugin</h3>
              </div>
              <p className="text-xs text-white/60 mb-3 ml-7">
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
            <div className="border border-white/10 rounded-lg p-4 mb-4 bg-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                <h3 className="text-sm font-medium text-white">Upload &amp; Activate in WordPress</h3>
              </div>
              <ol className="text-xs text-white/60 ml-7 space-y-1.5 list-decimal list-inside">
                <li>Log in to your WordPress admin panel</li>
                <li>Go to <span className="font-medium text-white">Plugins → Add New → Upload Plugin</span></li>
                <li>Choose the <span className="font-medium text-white">actv-trkr.zip</span> file you just downloaded</li>
                <li>Click <span className="font-medium text-white">Install Now</span>, then <span className="font-medium text-white">Activate</span></li>
              </ol>
            </div>

            {/* Step 3: Automatic sync */}
            <div className="border border-white/10 rounded-lg p-4 mb-4 bg-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                <h3 className="text-sm font-medium text-white">You're Connected</h3>
              </div>
              <p className="text-xs text-white/60 ml-7">
                Once activated, the plugin automatically registers your site, discovers your forms, and starts tracking pageviews and leads. Data typically appears on your dashboard within a few minutes.
              </p>
            </div>

            {/* Dashboard URL */}
            <div className="border border-white/10 rounded-lg p-4 mb-4 bg-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-white">Your Dashboard</h3>
              </div>
              <p className="text-xs text-white/60 mb-2 ml-6">
                Bookmark this — it's where you'll see your results.
              </p>
              <div className="bg-white/10 rounded-lg p-3 flex items-center gap-2">
                <code className="text-xs font-mono text-white flex-1 break-all">
                  {`https://actvtrkr.com/auth`}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://actvtrkr.com/auth`);
                    toast({ title: "Copied!", description: "Dashboard URL copied to clipboard." });
                  }}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors"
                >
                  <Copy className="h-4 w-4 text-white/60" />
                </button>
              </div>
            </div>

            {/* API Key (collapsible detail) */}
            <details className="border border-white/10 rounded-lg p-4 mb-4 bg-white/5">
              <summary className="text-xs font-medium text-white/60 cursor-pointer">Show API Key</summary>
              <div className="bg-white/10 rounded-lg p-3 flex items-center gap-2 mt-2">
                <code className="text-xs font-mono text-white flex-1 break-all">{apiKey}</code>
                <button onClick={copyApiKey} className="flex-shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-white/60" />}
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
