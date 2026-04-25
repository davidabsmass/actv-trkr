import { Mail, ArrowRight } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import actvTrkrLogo from "@/assets/actv-trkr-logo-new.png";
import SparkleCanvas from "@/components/SparkleCanvas";
import spaceBg from "@/assets/space-bgd-new.jpg";

export default function CheckoutSuccess() {
  const { session, loading } = useAuth();

  // If user is already logged in, send them to the dashboard
  if (!loading && session) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check for session_id query param from Stripe — validates this is a real checkout completion
  const params = new URLSearchParams(window.location.search);
  const hasSessionId = params.has("session_id");

  // If no session_id and not authenticated, this is a stale bookmark — redirect to home
  if (!loading && !session && !hasSessionId) {
    return <Navigate to="/" replace />;
  }

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

      <div className="w-full max-w-lg relative z-10">
        <div className="flex items-center justify-center mb-8">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-11 w-auto" />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Mail className="h-8 w-8 text-primary" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">You're in!</h1>
            <p className="text-white/90 mt-2 text-sm leading-relaxed">
              Your account has been created. We just sent you an email with a link to set your password and activate your account.
            </p>
          </div>

          <div className="rounded-lg bg-white/5 border border-white/10 p-4 text-left space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-white" />
              What happens next
            </h3>
            <ol className="text-sm text-white/90 space-y-2 list-decimal list-inside">
              <li>Check your email for a message from ACTV TRKR</li>
              <li>Click the link to set your password</li>
              <li>You'll be taken straight to setup instructions</li>
            </ol>
          </div>

          <p className="text-xs text-white/70">
            Don't see the email? Check your spam folder. It may take a minute to arrive.
          </p>

          <a
            href="https://actvtrkr.com"
            className="inline-block text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Back to home
          </a>
        </div>
      </div>
    </div>
  );
}
