import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Settings, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectingScreenProps {
  /** Org id we're waiting on, used to invalidate the sites query while polling. */
  orgId: string | null;
}

/**
 * Friendly waiting screen shown when a freshly onboarded org has no sites yet.
 * Polls the sites query every 5s; when the first heartbeat lands, the parent
 * component re-renders and the user transitions to the dashboard automatically.
 */
export function ConnectingScreen({ orgId }: ConnectingScreenProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);

  // Poll for the first signal every 5 seconds.
  useEffect(() => {
    if (!orgId) return;
    const tick = setInterval(() => {
      setElapsed((s) => s + 5);
      queryClient.invalidateQueries({ queryKey: ["sites", orgId] });
    }, 5000);
    return () => clearInterval(tick);
  }, [orgId, queryClient]);

  const minutes = Math.floor(elapsed / 60);
  const showLongWaitHint = elapsed >= 120; // after 2 minutes, suggest verifying setup

  return (
    <div className="max-w-xl mx-auto py-12">
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-5 animate-slide-up">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Connecting your website…
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We're waiting for the first signal from your WordPress plugin.
            This usually takes <strong className="text-foreground">1–3 minutes</strong> after
            you save your license key. Your <strong className="text-foreground">7-day free trial starts the moment your site connects</strong>,
            and your dashboard will open automatically.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Checking every 5 seconds · {minutes > 0 ? `${minutes}m ` : ""}{elapsed % 60}s elapsed
          </span>
        </div>

        {showLongWaitHint ? (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-foreground">Still waiting after a couple of minutes?</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>Confirm the plugin is <strong>activated</strong> in WordPress.</li>
              <li>Confirm your <strong>license key</strong> is pasted into Settings → ACTV TRKR and saved.</li>
              <li>Some hosts block outbound calls — see the setup checklist for details.</li>
            </ul>
            <Button asChild variant="outline" size="sm" className="mt-2 gap-1.5">
              <Link to="/settings?tab=setup">
                <Settings className="h-3.5 w-3.5" />
                Open Setup Checklist
              </Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/40 p-4 text-left space-y-1.5">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground">You can close this tab safely.</p>
                <p className="text-xs text-muted-foreground">
                  We'll keep listening in the background. The next time you log in, your data will be here.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/settings?tab=setup")}
            className="text-xs"
          >
            Review Setup Steps
          </Button>
        </div>
      </div>
    </div>
  );
}
