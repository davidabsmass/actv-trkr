import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Loader2, Smartphone } from "lucide-react";

type Factor = {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
};

type EnrollData = {
  factorId: string;
  qr: string;
  secret: string;
};

export default function TwoFactorSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const verifiedTotp = factors.find((f) => f.factor_type === "totp" && f.status === "verified");
  const enrolled = !!verifiedTotp;

  const isSessionMissing = (e: any) => {
    const msg = String(e?.message || e || "");
    const name = String(e?.name || "");
    return name === "AuthSessionMissingError" || /auth session missing/i.test(msg);
  };

  const refresh = async (opts?: { silent?: boolean }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const all = [...(data?.totp || []), ...(data?.all || [])];
      // listFactors returns { all, totp, phone } depending on SDK version
      const list = data?.all ?? all;
      setFactors((list as any[]).map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name,
        factor_type: f.factor_type,
        status: f.status,
      })));
      setLoading(false);
    } catch (e: any) {
      if (isSessionMissing(e)) {
        // Session not hydrated yet — stay in loading state and let the
        // auth listener / retry pick it up. Never toast for this.
        if (!opts?.silent) {
          setTimeout(() => { void refresh({ silent: true }); }, 600);
        }
        return;
      }
      toast({ title: "Could not load 2FA status", description: e.message, variant: "destructive" });
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    // Set up listener BEFORE checking the current session, so we don't miss
    // the INITIAL_SESSION / TOKEN_REFRESHED event during hydration.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) void refresh();
    });

    // Then check the current session.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        void refresh();
      }
      // If no session yet, the listener above will fire when it arrives.
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      // Clean up any unverified factors first
      const unverified = factors.filter((f) => f.factor_type === "totp" && f.status !== "verified");
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator (${new Date().toLocaleDateString()})`,
      });
      if (error) throw error;
      setEnroll({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (e: any) {
      toast({ title: "Could not start 2FA setup", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enroll || code.length < 6) return;
    setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code,
      });
      if (vErr) throw vErr;
      toast({ title: "Two-factor authentication enabled", description: "You'll be asked for a code on your next sign-in." });
      setEnroll(null);
      setCode("");
      await refresh();
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (!enroll) return;
    setBusy(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
      setEnroll(null);
      setCode("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!verifiedTotp) return;
    if (!confirm("Turn off two-factor authentication? Your account will only be protected by your password.")) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotp.id });
      if (error) throw error;
      toast({ title: "Two-factor authentication disabled" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not disable 2FA", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {enrolled ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground" />}
          Two-Factor Authentication
          {enrolled && <Badge variant="secondary" className="ml-1 text-xs">Enabled</Badge>}
        </CardTitle>
        <CardDescription>
          Add an extra layer of security using an authenticator app (Google Authenticator, 1Password, Authy, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : enroll ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium mb-2">1. Scan this QR code with your authenticator app</p>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div
                  className="bg-white p-2 rounded-md shrink-0"
                  dangerouslySetInnerHTML={{ __html: enroll.qr }}
                />
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Or enter this code manually:</p>
                  <code className="text-xs bg-background border border-border rounded px-2 py-1 inline-block font-mono break-all">
                    {enroll.secret}
                  </code>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">2. Enter the 6-digit code from your app</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="font-mono tracking-widest max-w-[180px]"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={verifyEnroll} disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Verify & Enable"}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEnroll} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : enrolled ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
              <Smartphone className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">2FA is active on your account</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  You'll be asked for a code from your authenticator app each time you sign in.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={disable} disabled={busy}>
              {busy ? "Disabling…" : "Disable 2FA"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Two-factor authentication is currently <strong className="text-foreground">off</strong>. We strongly recommend enabling it, especially for org admins.
            </p>
            <Button size="sm" onClick={startEnroll} disabled={busy}>
              {busy ? "Setting up…" : "Enable 2FA"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
