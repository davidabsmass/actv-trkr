import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, Eye, EyeOff, Ticket, ShieldCheck, KeyRound } from "lucide-react";
import actvTrkrLogo from "@/assets/actv-trkr-logo-new.png";
import SparkleCanvas from "@/components/SparkleCanvas";
import spaceBg from "@/assets/space-bgd-new.jpg";

type ActivePanel = "main" | "otp" | "forgot" | "mfa";

const PENDING_OTP_KEY = "actvtrkr_pending_otp";

type PendingOtpState = {
  email: string;
  password: string;
  inviteCode?: string;
};

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
  const [activePanel, setActivePanel] = useState<ActivePanel>("main");
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaEmail, setMfaEmail] = useState("");
  const [mfaResendCooldown, setMfaResendCooldown] = useState(0);
  const navigate = useNavigate();

  // Restore pending OTP state on mount so refresh / tab switch doesn't lose it.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_OTP_KEY);
      if (!raw) return;
      const saved: PendingOtpState = JSON.parse(raw);
      if (saved?.email && saved?.password) {
        setPendingEmail(saved.email);
        setPendingPassword(saved.password);
        if (saved.inviteCode) setInviteCode(saved.inviteCode);
        setActivePanel("otp");
        setIsLogin(false);
      }
    } catch {
      // ignore
    }
  }, []);

  // Tick resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (mfaResendCooldown <= 0) return;
    const t = setTimeout(() => setMfaResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [mfaResendCooldown]);

  const clearMessages = () => { setError(null); setMessage(null); };

  const goToPanel = (panel: ActivePanel) => {
    clearMessages();
    setActivePanel(panel);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: otpCode.trim(),
        type: "signup",
      });
      if (verifyErr) throw verifyErr;

      if (!data.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: pendingEmail,
          password: pendingPassword,
        });
        if (signInErr) throw signInErr;
      }

      const code = inviteCode || localStorage.getItem("pending_invite_code");
      if (code) {
        localStorage.removeItem("pending_invite_code");
        try {
          await supabase.functions.invoke("redeem-invite", { body: { code } });
        } catch (e) {
          console.error("Invite redeem failed:", e);
        }
      }

      sessionStorage.removeItem(PENDING_OTP_KEY);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    clearMessages();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
      if (error) throw error;
      setMessage("A new verification code has been sent to your email.");
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      if (!mfaChallengeToken) throw new Error("Session expired. Sign in again.");
      const { data, error: verifyErr } = await supabase.functions.invoke("mfa-verify-code", {
        body: { challengeToken: mfaChallengeToken, code: mfaCode.trim() },
      });
      if (verifyErr) {
        const ctx: any = (verifyErr as any).context;
        let msg = "Invalid code. Try again.";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error === "expired") msg = "Code expired. Request a new one.";
          else if (body?.error === "too_many_attempts") msg = "Too many wrong codes. Sign in again.";
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (!data?.access_token || !data?.refresh_token) throw new Error("Could not complete sign-in.");
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) throw setErr;

      const pendingCode = localStorage.getItem("pending_invite_code");
      if (pendingCode) {
        localStorage.removeItem("pending_invite_code");
        try { await supabase.functions.invoke("redeem-invite", { body: { code: pendingCode } }); }
        catch (e) { console.error("Pending invite redeem failed:", e); }
      }
      setMfaChallengeToken(null);
      setMfaCode("");
      setPendingPassword("");
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendMfa = async () => {
    if (mfaResendCooldown > 0 || !pendingEmail || !pendingPassword) return;
    clearMessages();
    setLoading(true);
    try {
      const { data, error: issueErr } = await supabase.functions.invoke("mfa-issue-code", {
        body: { email: pendingEmail, password: pendingPassword },
      });
      if (issueErr || !data?.challengeToken) throw new Error("Couldn't resend the code.");
      setMfaChallengeToken(data.challengeToken);
      setMfaCode("");
      setMessage("A new code has been sent to your email.");
      setMfaResendCooldown(30);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const normalizedForgotEmail = forgotEmail.trim().toLowerCase();
      // Use server-side wrapper that enforces rate limit + sends security alert.
      const { error } = await supabase.functions.invoke("request-password-reset", {
        body: {
          email: normalizedForgotEmail,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      if (error) throw error;
      setMessage("Check your email for a password reset link.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (isLogin) {
        // Step 1: verify password + issue email 2FA code (server-side).
        const { data: issued, error: issueErr } = await supabase.functions.invoke("mfa-issue-code", {
          body: { email: normalizedEmail, password },
        });
        if (issueErr) {
          const ctx: any = (issueErr as any).context;
          let msg = "Invalid email or password.";
          try {
            const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
            if (body?.error === "rate_limited") msg = "Too many sign-in attempts. Wait a few minutes and try again.";
            else if (body?.error === "email_send_failed") msg = "Couldn't send verification code. Try again in a moment.";
          } catch { /* ignore */ }
          throw new Error(msg);
        }
        if (!issued?.challengeToken) throw new Error("Could not start verification.");
        setMfaChallengeToken(issued.challengeToken);
        setMfaEmail(issued.email || normalizedEmail);
        setPendingPassword(password);
        setPendingEmail(normalizedEmail);
        setMfaCode("");
        setMfaResendCooldown(30);
        goToPanel("mfa");
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        if (inviteCode && signUpData.session) {
          try {
            await supabase.functions.invoke("redeem-invite", { body: { code: inviteCode } });
          } catch (e) {
            console.error("Invite redeem failed:", e);
          }
          navigate("/dashboard");
          return;
        }

        if (inviteCode) {
          localStorage.setItem("pending_invite_code", inviteCode.trim().toUpperCase());
        }

        setPendingEmail(normalizedEmail);
        setPendingPassword(password);
        try {
          sessionStorage.setItem(
            PENDING_OTP_KEY,
            JSON.stringify({ email: normalizedEmail, password, inviteCode: inviteCode || undefined } satisfies PendingOtpState),
          );
        } catch { /* ignore quota */ }
        goToPanel("otp");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full pl-10 pr-3 py-2.5 text-sm bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50";

  const translateX =
    activePanel === "main"
      ? "0"
      : activePanel === "otp"
      ? "calc(-100% - 1.5rem)"
      : activePanel === "mfa"
      ? "calc(-200% - 3rem)"
      : "calc(-200% - 3rem)";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        backgroundImage: `url(${spaceBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <SparkleCanvas />

      <div className="w-full max-w-sm overflow-hidden relative z-10">
        <div className="flex items-center justify-center mb-8">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-11 w-auto" />
        </div>

        <div className="relative">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(${translateX})` }}
          >
            {/* Panel 1: Login / Signup */}
            <div className="w-full flex-shrink-0">
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
                <h2 className="text-lg font-semibold text-white mb-1">
                  {isLogin ? "Sign in" : "Create account"}
                </h2>
                <p className="text-sm mb-5 text-primary-foreground">
                  {isLogin ? "Enter your credentials to continue" : "Get started with your analytics dashboard"}
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {!isLogin && (
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                      <input type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
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
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(210,100%,15%)] hover:text-[hsl(210,100%,8%)] transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="lucide lucide-eye h-4 w-4 text-secondary bg-muted" />}
                    </button>
                  </div>
                  {!isLogin && (
                    <div className="relative">
                      <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                      <input type="text" placeholder="Invite code (optional)" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} className={inputClass} />
                    </div>
                  )}

                  {isLogin && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => { setForgotEmail(email); goToPanel("forgot"); }}
                        className="text-xs text-white hover:underline font-medium"
                      >
                        Lost your password?
                      </button>
                    </div>
                  )}

                  {error && activePanel === "main" && (
                    <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>
                  )}
                  {message && activePanel === "main" && (
                    <p className="text-xs text-green-300 bg-green-500/20 rounded-lg px-3 py-2">{message}</p>
                  )}

                  <button type="submit" disabled={loading} className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {loading ? "Loading..." : isLogin ? "Sign in" : "Create account"}
                  </button>
                </form>

                
              </div>
            </div>

            {/* Spacer */}
            <div className="w-6 flex-shrink-0" />

            {/* Panel 2: OTP Verification */}
            <div className="w-full flex-shrink-0">
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-5 w-5 text-primary-foreground" />
                  <h2 className="text-lg font-semibold text-white">Verify your email</h2>
                </div>
                <p className="text-sm mb-5 text-primary-foreground">
                  We sent a 6-digit code to <span className="font-medium text-white">{pendingEmail}</span>. Enter it below to confirm your account.
                </p>

                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/40 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  {error && activePanel === "otp" && (
                    <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>
                  )}
                  {message && activePanel === "otp" && (
                    <p className="text-xs text-green-300 bg-green-500/20 rounded-lg px-3 py-2">{message}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                  >
                    {loading ? (
                      <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      "Confirm Code"
                    )}
                  </button>
                </form>

                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={handleResendCode}
                    disabled={loading || resendCooldown > 0}
                    className="text-xs text-white hover:underline font-medium disabled:cursor-not-allowed disabled:no-underline"
                  >
                    {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                  </button>
                  <button
                    onClick={() => {
                      setOtpCode("");
                      setIsLogin(true);
                      goToPanel("main");
                    }}
                    className="text-xs text-white/50 hover:underline"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>

            {/* Spacer */}
            <div className="w-6 flex-shrink-0" />

            {/* Panel 4: MFA Email Code */}
            <div className="w-full flex-shrink-0">
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-5 w-5 text-white" />
                  <h2 className="text-lg font-semibold text-white">Two-factor verification</h2>
                </div>
                <p className="text-sm mb-5 text-primary-foreground">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-white">{mfaEmail || pendingEmail}</span>. Enter it below to finish signing in.
                </p>

                <form onSubmit={handleVerifyMfa} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter 6-digit code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/40 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  {error && activePanel === "mfa" && (
                    <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>
                  )}
                  {message && activePanel === "mfa" && (
                    <p className="text-xs text-green-300 bg-green-500/20 rounded-lg px-3 py-2">{message}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || mfaCode.length < 6}
                    className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? "Verifying..." : "Verify & Sign in"}
                  </button>
                </form>

                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={handleResendMfa}
                    disabled={loading || mfaResendCooldown > 0}
                    className="text-xs text-white hover:underline font-medium disabled:cursor-not-allowed disabled:no-underline"
                  >
                    {mfaResendCooldown > 0 ? `Resend code (${mfaResendCooldown}s)` : "Resend code"}
                  </button>
                  <button
                    onClick={() => {
                      setMfaChallengeToken(null);
                      setMfaCode("");
                      setPendingPassword("");
                      goToPanel("main");
                    }}
                    className="text-xs text-white/50 hover:underline"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export default Auth;

