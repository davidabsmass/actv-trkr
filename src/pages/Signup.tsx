import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Zap, ArrowRight, ArrowLeft, Check, Copy, Download, Globe, CreditCard, User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { downloadPlugin } from "@/lib/plugin-download";
import { toast } from "@/hooks/use-toast";

type Step = "info" | "payment" | "complete";

const Signup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("info");

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

  const handleInfoNext = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("payment");
  };

  // This is the post-payment creation logic.
  // Right now it fires from the placeholder "Complete Purchase" button.
  // When Stripe is wired up, this will be called from the Stripe webhook / success callback instead.
  const handleCreateAccount = async () => {
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
        .insert({ org_id: orgId, key_hash: keyHash, key_plain: rawKey, label: "Default" });

      setApiKey(rawKey);
      setStep("complete");
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

  const stepIndex = step === "info" ? 0 : step === "payment" ? 1 : 2;

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

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {["Your Info", "Payment", "Ready"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                  i <= stepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
              {i < 2 && <div className={`w-8 h-px ${i < stepIndex ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step: Info */}
        {step === "info" && (
          <div className="glass-card p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-foreground mb-1">Create your account</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Fill in your details to get started with analytics tracking.
            </p>
            <form onSubmit={handleInfoNext} className="space-y-3">
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
                disabled={!fullName || !email || !password || !orgName}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Continue to Payment
                <ArrowRight className="h-4 w-4" />
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

        {/* Step: Payment (placeholder) */}
        {step === "payment" && (
          <div className="glass-card p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-foreground mb-1">Payment</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Complete your purchase to activate your account.
            </p>

            <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">ACTV TRKR Pro</span>
                <span className="text-sm font-semibold text-foreground">$XX/mo</span>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Unlimited pageview tracking</li>
                <li>• Form capture & lead attribution</li>
                <li>• Weekly AI summaries</li>
                <li>• Priority support</li>
              </ul>
            </div>

            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 mb-4 flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Stripe checkout will be embedded here. For now, click below to simulate a completed purchase.
              </p>
            </div>

            <button
              onClick={handleCreateAccount}
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Complete Purchase
                </>
              )}
            </button>

            <button
              onClick={() => setStep("info")}
              className="w-full mt-2 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to info
            </button>
          </div>
        )}

        {/* Step: Complete */}
        {step === "complete" && apiKey && (
          <div className="glass-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">You're all set!</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Your account is active. Copy the API key below — it won't be shown again.
            </p>
            <div className="bg-secondary rounded-lg p-3 flex items-center gap-2 mb-4">
              <code className="text-xs font-mono text-foreground flex-1 break-all">{apiKey}</code>
              <button onClick={copyApiKey} className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <h3 className="text-sm font-medium text-foreground mb-1">Client Dashboard URL</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Share this link with your client so they can log in and view their results.
              </p>
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <code className="text-xs font-mono text-foreground flex-1 break-all">
                  {window.location.origin}/auth
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/auth`);
                    toast({ title: "Copied!", description: "Dashboard URL copied to clipboard." });
                  }}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors"
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
              <h3 className="text-sm font-medium text-foreground mb-1">WordPress Plugin</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Download the plugin with your API key baked in. Just upload to WordPress and activate.
              </p>
              <button
                onClick={() => downloadPlugin(apiKey)}
                className="w-full py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Plugin (.zip)
              </button>
            </div>
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
