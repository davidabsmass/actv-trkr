import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, Eye, EyeOff, Ticket, ShieldCheck } from "lucide-react";
import actvTrkrLogo from "@/assets/actv-trkr-logo-white.svg";
import SparkleCanvas from "@/components/SparkleCanvas";
import spaceBg from "@/assets/space-bgd.jpg";

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

      navigate("/dashboard");
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
        navigate("/dashboard");
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        if (inviteCode && signUpData.session) {
          try {
            await supabase.functions.invoke("redeem-invite", {
              body: { code: inviteCode },
            });
          } catch (e) {
            console.error("Invite redeem failed:", e);
          }
          navigate("/dashboard");
          return;
        }

        if (inviteCode) {
          localStorage.setItem("pending_invite_code", inviteCode.trim().toUpperCase());
        }

        setPendingEmail(email);
        setPendingPassword(password);
        setError(null);
        setMessage(null);
        setOtpMode(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full pl-10 pr-3 py-2.5 text-sm bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50";

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
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Space dust */}
      <SparkleCanvas />

      <div className="w-full max-w-sm overflow-hidden relative z-10">
        <div className="flex items-center justify-center mb-8">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-9 w-auto" />
        </div>

        <div className="relative">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: otpMode ? "translateX(calc(-100% - 1.5rem))" : "translateX(0)" }}
          >
            {/* Panel 1: Login / Signup */}
            <div className="w-full flex-shrink-0">
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
                <h2 className="text-lg font-semibold text-white mb-1">
                  {forgotMode ? "Reset password" : isLogin ? "Sign in" : "Create account"}
                </h2>
                <p className="text-sm text-white/60 mb-5">
                  {forgotMode
                    ? "Enter your email and we'll send a reset link"
                    : isLogin
                    ? "Enter your credentials to continue"
                    : "Get started with your analytics dashboard"}
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {!isLogin && !forgotMode && (
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
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
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
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
                  )}
                  {!isLogin && !forgotMode && (
                    <div className="relative">
                      <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
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
                    <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>
                  )}
                  {message && !otpMode && (
                    <p className="text-xs text-green-300 bg-green-500/20 rounded-lg px-3 py-2">{message}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? "Loading..." : forgotMode ? "Send reset link" : isLogin ? "Sign in" : "Create account"}
                  </button>
                </form>

                <p className="text-xs text-white/50 mt-4 text-center">
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

            {/* Spacer */}
            <div className="w-6 flex-shrink-0" />

            {/* Panel 2: OTP Verification */}
            <div className="w-full flex-shrink-0">
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-white">Verify your email</h2>
                </div>
                <p className="text-sm text-white/60 mb-5">
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

                  {error && otpMode && (
                    <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>
                  )}
                  {message && otpMode && (
                    <p className="text-xs text-green-300 bg-green-500/20 rounded-lg px-3 py-2">{message}</p>
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
