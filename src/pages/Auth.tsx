import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, Eye, EyeOff, Ticket } from "lucide-react";
import actvTrkrLogo from "@/assets/actv-trkr-logo-dark.svg";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get("invite") || "";
  const [isLogin, setIsLogin] = useState(!initialCode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (forgotMode) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage("Check your email for a password reset link.");
        setLoading(false);
        return;
      }
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Check for pending invite code from a previous signup
        const pendingCode = localStorage.getItem("pending_invite_code");
        if (pendingCode) {
          localStorage.removeItem("pending_invite_code");
          try {
            await supabase.functions.invoke("redeem-invite", {
              body: { code: pendingCode },
            });
          } catch (e) {
            console.error("Pending invite redeem failed:", e);
          }
        }
        navigate("/");
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        // If invite code provided and user was auto-confirmed, redeem it now
        if (inviteCode && signUpData.session) {
          try {
            const { data: redeemData, error: redeemErr } = await supabase.functions.invoke("redeem-invite", {
              body: { code: inviteCode },
            });
            if (redeemErr) console.error("Invite redeem error:", redeemErr);
            if (redeemData?.error) console.error("Invite redeem error:", redeemData.error);
          } catch (e) {
            console.error("Invite redeem failed:", e);
          }
          navigate("/");
          return;
        }

        setMessage(
          inviteCode
            ? "Check your email to confirm your account. Once confirmed, sign in and your invite code will be applied."
            : "Check your email to confirm your account."
        );
        // Store invite code in localStorage so it can be redeemed after email confirmation
        if (inviteCode) {
          localStorage.setItem("pending_invite_code", inviteCode.trim().toUpperCase());
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-8 w-auto" />
        </div>

        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            {forgotMode ? "Reset password" : isLogin ? "Sign in" : "Create account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            {forgotMode
              ? "Enter your email and we'll send a reset link"
              : isLogin
              ? "Enter your credentials to continue"
              : "Get started with your analytics dashboard"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && !forgotMode && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            {!forgotMode && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}
            {!isLogin && !forgotMode && (
              <div className="relative">
                <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Invite code (optional)"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className={inputClass}
                />
              </div>
            )}

            {isLogin && !forgotMode && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setError(null); setMessage(null); }}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Lost your password?
                </button>
              </div>
            )}

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
            {message && (
              <p className="text-xs text-success bg-success/10 rounded-lg px-3 py-2">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : forgotMode ? "Send reset link" : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            {forgotMode ? (
              <button
                onClick={() => { setForgotMode(false); setError(null); setMessage(null); }}
                className="text-primary hover:underline font-medium"
              >
                Back to sign in
              </button>
            ) : (
              <>
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => { setIsLogin(!isLogin); setError(null); setMessage(null); }}
                  className="text-primary hover:underline font-medium"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
