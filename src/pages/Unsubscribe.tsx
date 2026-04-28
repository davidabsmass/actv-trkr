import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Check, AlertCircle, Mail } from "lucide-react";

/**
 * Public unsubscribe landing page.
 *
 * Accepts ?email=...&token=... (token reserved for future signed-link flow).
 * For now, calls the public `record-marketing-consent` edge function in
 * "unsubscribe-by-email" mode, which sets the marketing_contacts row for
 * that email to `unsubscribed` and logs an event. Operational/security
 * emails are NEVER affected.
 */
const Unsubscribe = () => {
  const [params] = useSearchParams();
  const initialEmail = params.get("email") || "";
  const token = params.get("token") || "";
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const submit = async (targetEmail: string) => {
    if (!targetEmail) {
      setStatus("error");
      setMessage("Please enter your email address.");
      return;
    }
    setStatus("loading");
    try {
      const { error } = await supabase.functions.invoke("record-marketing-consent", {
        body: { status: "unsubscribed", email: targetEmail, token, source: "unsubscribe_link" },
      });
      if (error) throw error;
      setStatus("done");
      setMessage("You've been unsubscribed from ACTV TRKR marketing emails. You'll still receive operational and security notices for your account.");
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.message || "Could not process your request. Please try again.");
    }
  };

  // Auto-submit if email was passed via URL
  useEffect(() => {
    if (initialEmail && status === "idle") {
      submit(initialEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Unsubscribe</h1>
          </div>

          {status === "done" ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
              <Check className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">{message}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Enter the email address you'd like to unsubscribe from ACTV TRKR product updates and marketing emails.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {status === "error" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground">{message}</p>
                </div>
              )}
              <button
                onClick={() => submit(email)}
                disabled={status === "loading"}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {status === "loading" ? "Processing…" : "Unsubscribe"}
              </button>
              <p className="text-xs text-muted-foreground">
                Operational notices (security alerts, billing, account changes) will continue to be sent — these are required for your account.
              </p>
            </>
          )}

          <div className="pt-2 border-t border-border">
            <Link to="/" className="text-xs text-primary hover:underline">← Back to ACTV TRKR</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Unsubscribe;
