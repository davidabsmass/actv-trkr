import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Eye, EyeOff } from "lucide-react";
import actvTrkrLogo from "@/assets/actv-trkr-logo-new.png";
import SparkleCanvas from "@/components/SparkleCanvas";
import spaceBg from "@/assets/space-bgd-new.jpg";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session) setReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated successfully! Redirecting…");
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full pl-10 pr-10 py-2.5 text-sm bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50";

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
          <h2 className="text-lg font-semibold text-white mb-1">Set new password</h2>
          <p className="text-sm text-white/60 mb-5">Enter your new password below</p>

          {!ready ? (
            <p className="text-sm text-white/60 text-center py-4">Verifying reset link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputClass}
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
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
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
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
