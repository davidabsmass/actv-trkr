import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, Eye, EyeOff, Ticket, ShieldCheck } from "lucide-react";
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
  const [otpMode, setOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const navigate = useNavigate();

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

      // If no session after OTP, sign in with credentials
      if (!data.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: pendingEmail,
          password: pendingPassword,
        });
        if (signInErr) throw signInErr;
      }

      // Redeem invite code if present
      const code = inviteCode || localStorage.getItem("pending_invite_code");
      if (code) {
        localStorage.removeItem("pending_invite_code");
        try {
          await supabase.functions.invoke("redeem-invite", { body: { code } });
        } catch (e) {
          console.error("Invite redeem failed:", e);
        }
      }

      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
      if (error) throw error;
      setMessage("A new verification code has been sent to your email.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

        // If user was auto-confirmed (e.g. admin-created), redeem invite and go
        if (inviteCode && signUpData.session) {
          try {
            await supabase.functions.invoke("redeem-invite", {
              body: { code: inviteCode },
            });
          } catch (e) {
            console.error("Invite redeem failed:", e);
          }
          navigate("/");
          return;
        }

        // Store invite code for after verification
        if (inviteCode) {
          localStorage.setItem("pending_invite_code", inviteCode.trim().toUpperCase());
        }

        // Switch to OTP verification mode
        setPendingEmail(email);
        setPendingPassword(password);
        setOtpMode(true);
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
      <div className="w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-center mb-8">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-8 w-auto" />
        </div>

        <div className="relative">
          {/* Sliding container */}
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: otpMode ? "translateX(-100%)" : "translateX(0)" }}
          >
            {/* Panel 1: Login / Signup */}
            <div className="w-full flex-shrink-0">
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

                  {error && !otpMode && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
                  )}
                  {message && !otpMode && (
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
                  {forgotMode && (
                    <button
                      onClick={() => { setForgotMode(false); setError(null); setMessage(null); }}
                      className="text-primary hover:underline font-medium"
                    >
                      Back to sign in
                    </button>
                  )}
                </p>
              </div>
            </div>

            {/* Panel 2: OTP Verification */}
            <div className="w-full flex-shrink-0">
              <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Verify your email</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              We sent a 6-digit code to <span className="font-medium text-foreground">{pendingEmail}</span>. Enter it below to confirm your account.
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
                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 bg-white border border-border rounded-lg text-foreground placeholder:text-muted-foreground placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-primary/50"
              />

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
              )}
              {message && (
                <p className="text-xs text-success bg-success/10 rounded-lg px-3 py-2">{message}</p>
              )}

              <button
                type="submit"
                disabled={loading || otpCode.length < 6}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify & Continue"}
              </button>
            </form>

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={handleResendCode}
                disabled={loading}
                className="text-xs text-primary hover:underline font-medium disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                onClick={() => { setOtpMode(false); setError(null); setMessage(null); setOtpCode(""); }}
                className="text-xs text-muted-foreground hover:underline"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
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
              {forgotMode && (
                <button
                  onClick={() => { setForgotMode(false); setError(null); setMessage(null); }}
                  className="text-primary hover:underline font-medium"
                >
                  Back to sign in
                </button>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
