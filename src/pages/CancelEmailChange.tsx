import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, AlertTriangle, Mail } from "lucide-react";

type Phase = "idle" | "working" | "ok" | "resolved" | "invalid" | "error";

const CancelEmailChange = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const pid = params.get("pid") ?? "";

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    document.title = "Cancel email change — ACTV TRKR";
  }, []);

  const handleCancel = async () => {
    if (!token || !pid) {
      setPhase("invalid");
      return;
    }
    setPhase("working");
    try {
      const { data, error } = await supabase.functions.invoke("confirm-email-change", {
        body: { action: "cancel", token, pid },
      });
      if (error) {
        const msg = (error as any)?.context?.errorMessage ?? error.message ?? "";
        if (msg.includes("already_resolved")) setPhase("resolved");
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
          <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
            <Mail className="h-5 w-5 text-warning" />
          </div>
          <CardTitle className="text-center">Cancel email change</CardTitle>
          <CardDescription className="text-center">
            Click the button below to cancel the pending email change on your ACTV TRKR account.
            All sessions will be signed out as a precaution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === "idle" && (
            <Button className="w-full" onClick={handleCancel} disabled={!token || !pid}>
              Cancel the email change
            </Button>
          )}
          {phase === "working" && (
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling…
            </div>
          )}
          {phase === "ok" && (
            <div className="text-center space-y-3">
              <ShieldCheck className="mx-auto h-8 w-8 text-success" />
              <p className="text-sm">The email change was cancelled. Your account email is unchanged.</p>
              <p className="text-sm text-muted-foreground">
                We've also signed you out everywhere as a precaution.
              </p>
              <Link to="/auth"><Button className="w-full">Go to sign-in</Button></Link>
            </div>
          )}
          {phase === "resolved" && (
            <div className="text-center text-sm text-muted-foreground">
              <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-success" />
              This change has already been cancelled or applied.
            </div>
          )}
          {phase === "invalid" && (
            <div className="text-center text-sm text-destructive">
              <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
              This cancel link is invalid or missing required information.
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

export default CancelEmailChange;
