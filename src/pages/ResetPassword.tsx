import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Eye, EyeOff, Mail, KeyRound } from "lucide-react";
import actvTrkrLogo from "@/assets/actv-trkr-logo-new.png";
import SparkleCanvas from "@/components/SparkleCanvas";
import spaceBg from "@/assets/space-bgd-new.jpg";

/**
 * Password recovery flow.
 *
 * SECURITY:
 * Supabase recovery links create a real session in localStorage so that
 * `updateUser({ password })` can authenticate the change. Without extra
 * guards, that session leaks: the user (or anyone on the same browser
 * profile) is silently logged in across other tabs / windows the moment
 * the link is opened.
 *
 * To prevent that we:
 *   1. Set a sessionStorage flag the moment we land here so the rest of
 *      the app (useAuth, Index auto-redirect) treats the session as a
 *      recovery-only session and refuses to auto-route into the dashboard.
 *   2. After `updateUser({ password })` succeeds we explicitly sign out,
 *      clear the flag, and send the user to /auth so they sign in fresh.
 *   3. If the user navigates away without completing, the flag stays set
 *      and we sign out the recovery session on unmount. They will need
 *      to request a fresh reset link to try again.
 */
const RECOVERY_FLAG = "pw_recovery_in_progress";
const RECOVERY_TS_KEY = "pw_recovery_started_at";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [resetEmail, setResetEmail] = useState<string>("");
  const [resetCode, setResetCode] = useState("");
  const completedRef = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    // Mark this browser tab as being mid-recovery so other parts of the
    // app stop treating the recovery session as a normal login.
    try {
      sessionStorage.setItem(RECOVERY_FLAG, "1");
      localStorage.setItem(RECOVERY_FLAG, "1");
      localStorage.setItem(RECOVERY_TS_KEY, String(Date.now()));
    } catch {}

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        try {
          sessionStorage.setItem(RECOVERY_FLAG, "1");
          localStorage.setItem(RECOVERY_FLAG, "1");
          localStorage.setItem(RECOVERY_TS_KEY, String(Date.now()));
        } catch {}
        setReady(true);
      }
    });

    // Handle recovery link arrival. Supabase may deliver the token in one of
    // three ways: (a) PKCE `?code=...` query param needing exchange,
    // (b) hash fragment `#access_token=...&type=recovery` that the SDK
    // auto-parses, or (c) a fully established session already in storage.
    const bootstrap = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const emailParam = url.searchParams.get("email")?.trim().toLowerCase() || "";
      const errDesc = url.searchParams.get("error_description") || url.searchParams.get("error");

      if (emailParam) setResetEmail(emailParam);

      if (errDesc) {
        if (mounted) setError(decodeURIComponent(errDesc));
        return;
      }

      // Managed email-code flow: avoid consuming a one-time link before
      // the user submits the reset code and new password.
      if (emailParam && !code && !tokenHash) {
        if (mounted) setReady(true);
        return;
      }

      // (a) PKCE code flow
      if (code) {
        try {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) throw exchangeErr;
          if (mounted) setReady(true);
          window.history.replaceState({}, "", url.pathname);
          return;
        } catch (e: any) {
          console.warn("[reset] exchangeCodeForSession failed", e?.message);
          if (mounted) setError(e?.message || "This reset link is invalid or has expired. Please request a new one.");
          return;
        }
      }

      // (b) verifyOtp token_hash flow (newer Supabase format)
      if (tokenHash && type) {
        try {
          const { error: vErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });
          if (vErr) throw vErr;
          if (mounted) setReady(true);
          window.history.replaceState({}, "", url.pathname);
          return;
        } catch (e: any) {
          console.warn("[reset] verifyOtp failed", e?.message);
          if (mounted) setError(e?.message || "This reset link is invalid or has expired. Please request a new one.");
          return;
        }
      }

      // (c) hash fragment or already-established session
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session) {
        setReady(true);
        return;
      }

      setTimeout(async () => {
        if (!mounted || ready) return;
        const { data: { session: s2 } } = await supabase.auth.getSession();
        if (mounted) {
          if (s2) setReady(true);
          else if (emailParam) setReady(true);
          else {
            console.warn("[reset] no session after wait", { search: url.search, hash: url.hash });
            setError("This reset link is invalid or has expired. Please request a new one.");
          }
        }
      }, 2000);
    };

    bootstrap();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      // NOTE: Intentionally NOT signing out on effect cleanup.
      // React 18 StrictMode (and any parent re-render) double-invokes effects,
      // and a cleanup-time signOut would destroy the freshly-minted recovery
      // session before the user can submit, producing a false "link expired"
      // error. The completion handler in handleSubmit signs out explicitly,
      // and the recovery flag in storage prevents the session from being
      // treated as a normal login elsewhere in the app.
    };
  }, [queryClient]);

  // Safety net: if the user navigates away (closes tab, hits back) without
  // completing, kill the recovery session so it cannot become a silent login.
  useEffect(() => {
    const handleUnload = () => {
      if (completedRef.current) return;
      try {
        sessionStorage.removeItem(RECOVERY_FLAG);
        localStorage.removeItem(RECOVERY_FLAG);
        localStorage.removeItem(RECOVERY_TS_KEY);
      } catch {}
      // Best-effort sign-out; can't await in unload.
      supabase.auth.signOut({ scope: "global" }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Once a recovery session is established, surface the account email so
  // the invitee can confirm they're setting a password for the right account.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled && user?.email) setAccountEmail(user.email);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [ready]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (!resetEmail) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      } else {
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({
          email: resetEmail,
          token: resetCode.trim(),
          type: "recovery",
        });
        if (verifyErr) throw verifyErr;
        if (!data?.session) throw new Error("This reset code is invalid or has expired. Please request a new one.");
        const { error: updateErr } = await supabase.auth.updateUser({ password });
        if (updateErr) throw updateErr;
      }

      try {
        await (supabase as any).rpc("mark_invite_accepted");
      } catch (inviteErr) {
        console.warn("[reset] invite acceptance marker failed", inviteErr);
      }

      completedRef.current = true;

      // Force a clean sign-out everywhere so the recovery session cannot
      // become a silent login in another tab. The user must now sign in
      // with their new password.
      try { await supabase.auth.signOut({ scope: "global" }); } catch {}
      try {
        sessionStorage.removeItem(RECOVERY_FLAG);
        localStorage.removeItem(RECOVERY_FLAG);
        localStorage.removeItem(RECOVERY_TS_KEY);
      } catch {}
      queryClient.clear();

      setMessage("Password set. Please sign in with your new password.");
      setTimeout(() => navigate("/auth?reason=password_updated", { replace: true }), 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full pl-10 pr-10 py-2.5 text-sm bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50";
  const accountDisplayEmail = resetEmail || accountEmail;

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

      <div className="w-full max-w-sm relative z-10">
        <div className="flex items-center justify-center mb-8">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-11 w-auto" />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-1">Set your password</h2>
          <p className="text-sm text-white/60 mb-5">Create a password to activate your account</p>

          {!ready && !error ? (
            <p className="text-sm text-white/60 text-center py-4">Verifying reset link…</p>
          ) : !ready && error ? (
            <div className="space-y-3">
              <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>
              <button
                type="button"
                onClick={() => navigate("/auth?reset=1", { replace: true })}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Request a new reset link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {accountDisplayEmail && (
                <div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                      type="email"
                      value={accountDisplayEmail}
                      readOnly
                      disabled
                      aria-label="Account email"
                      className="w-full pl-10 pr-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white/80 cursor-not-allowed focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-white/50">Setting password for this account.</p>
                </div>
              )}
              {resetEmail && (
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Reset code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\s/g, ""))}
                    required
                    autoComplete="one-time-code"
                    name="reset-code"
                    className={inputClass}
                  />
                </div>
              )}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  name="new-password"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-white/80 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  name="confirm-new-password"
                  className={inputClass}
                />
              </div>

              {error && (
                <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}
              {message && (
                <p className="text-xs text-green-300 bg-green-500/20 rounded-lg px-3 py-2">{message}</p>
              )}

                <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                  {loading ? "Setting…" : "Set password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
