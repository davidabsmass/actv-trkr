import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

type Phase = "idle" | "working" | "ok" | "expired" | "used" | "invalid" | "error";

const AccountLock = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const alertId = params.get("aid") ?? "";

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    document.title = "Lock my account — ACTV TRKR";
  }, []);

  const handleLock = async () => {
    if (!token || !alertId) {
      setPhase("invalid");
      return;
    }
    setPhase("working");
    try {
      const { data, error } = await supabase.functions.invoke("kill-my-sessions", {
        body: { token, alertId },
      });
      if (error) {
        const msg = (error as any)?.context?.errorMessage ?? error.message ?? "";
        if (msg.includes("already_used")) setPhase("used");
        else if (msg.includes("expired")) setPhase("expired");
        else if (msg.includes("invalid_token") || msg.includes("not_found")) setPhase("invalid");
        else { setPhase("error"); setErrorMsg(msg || "Unknown error"); }
        return;
      }
      if ((data as any)?.ok) setPhase("ok");
      else setPhase("error");
    } catch (e: any) {
      setPhase("error");
      setErrorMsg(e?.message ?? "Network error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <CardTitle className="text-center">Lock my ACTV TRKR account</CardTitle>
          <CardDescription className="text-center">
            This will sign you out of every device and require you to sign in again.
            Use this if you didn't recognize the activity in your security alert email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === "idle" && (
            <Button className="w-full" variant="destructive" onClick={handleLock} disabled={!token || !alertId}>
              Lock my account now
            </Button>
          )}
          {phase === "working" && (
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Locking your account…
            </div>
          )}
          {phase === "ok" && (
            <div className="text-center space-y-3">
              <ShieldCheck className="mx-auto h-8 w-8 text-success" />
              <p className="text-sm">Your account is locked. All sessions have been signed out.</p>
              <p className="text-sm text-muted-foreground">
                Now reset your password and sign in again.
              </p>
              <Link to="/auth"><Button className="w-full">Go to sign-in</Button></Link>
            </div>
          )}
          {phase === "expired" && (
            <div className="text-center text-sm text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-warning" />
              This lock link has expired. If you still don't recognize the activity,
              <Link to="/auth?reset=1" className="underline ml-1">reset your password</Link>.
            </div>
          )}
          {phase === "used" && (
            <div className="text-center text-sm text-muted-foreground">
              <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-success" />
              This lock link has already been used. Your account is locked.
            </div>
          )}
          {phase === "invalid" && (
            <div className="text-center text-sm text-destructive">
              This lock link is invalid or missing required information.
            </div>
          )}
          {phase === "error" && (
            <div className="text-center text-sm text-destructive">
              Something went wrong. {errorMsg}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountLock;
