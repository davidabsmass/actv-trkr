import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";

type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    const validate = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`;
        const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        if (!res.ok) { setStatus("invalid"); return; }
        const data = await res.json();
        if (data.valid === false && data.reason === "already_unsubscribed") setStatus("already");
        else if (data.valid) setStatus("valid");
        else setStatus("invalid");
      } catch { setStatus("invalid"); }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
      if (error) throw error;
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 text-muted-foreground animate-spin mx-auto" />
              <p className="text-muted-foreground">Verifying…</p>
            </>
          )}
          {status === "valid" && (
            <>
              <MailX className="w-10 h-10 text-primary mx-auto" />
              <h1 className="text-xl font-semibold text-foreground">Unsubscribe from emails</h1>
              <p className="text-muted-foreground text-sm">You'll no longer receive app emails from ACTV TRKR. Auth emails (like password resets) are unaffected.</p>
              <Button onClick={handleUnsubscribe} disabled={processing} className="mt-2">
                {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm Unsubscribe
              </Button>
            </>
          )}
          {status === "already" && (
            <>
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
              <h1 className="text-xl font-semibold text-foreground">Already unsubscribed</h1>
              <p className="text-muted-foreground text-sm">You've already unsubscribed from these emails.</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
              <h1 className="text-xl font-semibold text-foreground">Unsubscribed</h1>
              <p className="text-muted-foreground text-sm">You've been unsubscribed. You won't receive any more app emails from ACTV TRKR.</p>
            </>
          )}
          {(status === "invalid" || status === "error") && (
            <>
              <XCircle className="w-10 h-10 text-destructive mx-auto" />
              <h1 className="text-xl font-semibold text-foreground">
                {status === "invalid" ? "Invalid link" : "Something went wrong"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {status === "invalid" ? "This unsubscribe link is invalid or has expired." : "Please try again later."}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}