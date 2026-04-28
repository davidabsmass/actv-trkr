import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Loader2, Smartphone, Mail } from "lucide-react";

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [emailEnabled, setEmailEnabled] = useState(false);

  const verifiedTotp = factors.find((f) => f.factor_type === "totp" && f.status === "verified");
  const totpEnrolled = !!verifiedTotp;
  const anyEnabled = totpEnrolled || emailEnabled;
  const locked = busy || !!enroll;

  const isSessionMissing = (e: any) => {
    const msg = String(e?.message || e || "");
    const name = String(e?.name || "");
    return name === "AuthSessionMissingError" || /auth session missing/i.test(msg);
  };

  const persistEmail = async (uid: string, next: boolean) => {
    const { error } = await supabase
      .from("user_two_factor")
      .upsert({
        user_id: uid,
        email_enabled: next,
        enabled_at: next ? new Date().toISOString() : null,
      }, { onConflict: "user_id" });
    if (error) throw error;
  };

  const refresh = async (opts?: { silent?: boolean }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const all = [...(data?.totp || []), ...(data?.all || [])];
      const list = data?.all ?? all;
      const mapped = (list as any[]).map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name,
        factor_type: f.factor_type,
        status: f.status,
      }));
      setFactors(mapped);

      const totpOn = mapped.some((f) => f.factor_type === "totp" && f.status === "verified");

      let emailOn = false;
      if (user?.id) {
        const { data: row } = await supabase
          .from("user_two_factor")
          .select("email_enabled")
          .eq("user_id", user.id)
          .maybeSingle();
        emailOn = row ? !!row.email_enabled : true;

        // Reconcile legacy "both on" — TOTP wins, silently disable email.
        if (totpOn && emailOn) {
          try {
            await persistEmail(user.id, false);
            emailOn = false;
            toast({
              title: "Email 2FA was turned off",
              description: "Your authenticator app is the active method. Only one can be enabled at a time.",
            });
          } catch {
            // Non-fatal — UI will still display email as on; user can toggle off manually.
          }
        }
      }
      setEmailEnabled(emailOn);
      setLoading(false);
    } catch (e: any) {
      if (isSessionMissing(e)) {
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) void refresh();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void refresh();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ---- Email toggle ----
  const handleEmailToggle = async (next: boolean) => {
    if (!user?.id) return;
    if (next && totpEnrolled) {
      if (!confirm("Switch from authenticator app to email codes? Your authenticator app will be removed.")) return;
    }
    setBusy(true);
    try {
      if (next && verifiedTotp) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotp.id });
        if (error) throw error;
      }
      await persistEmail(user.id, next);
      setEmailEnabled(next);
      toast({
        title: next ? "Email 2FA enabled" : "Email 2FA disabled",
        description: next
          ? "We'll email you a 6-digit code each time you sign in."
          : "You'll no longer be asked for an emailed code at sign-in.",
      });
      if (next && verifiedTotp) await refresh();
    } catch (e: any) {
      toast({ title: "Couldn't update setting", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ---- TOTP toggle ----
  const startEnroll = async () => {
    setBusy(true);
    try {
      // Disable email first if it's on — mutual exclusion.
      if (emailEnabled && user?.id) {
        await persistEmail(user.id, false);
        setEmailEnabled(false);
      }
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
      toast({ title: "Authenticator app enabled", description: "You'll be asked for a code on your next sign-in." });
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

  const disableTotp = async () => {
    if (!verifiedTotp) return;
    if (!confirm("Turn off authenticator-app 2FA?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotp.id });
      if (error) throw error;
      toast({ title: "Authenticator app disabled" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not disable", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleTotpToggle = async (next: boolean) => {
    if (next) {
      await startEnroll();
    } else if (enroll) {
      await cancelEnroll();
    } else if (totpEnrolled) {
      await disableTotp();
    }
  };

  const totpSwitchOn = totpEnrolled || !!enroll;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {anyEnabled ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground" />}
          Two-Factor Authentication
          {anyEnabled && <Badge variant="secondary" className="ml-1 text-xs">Enabled</Badge>}
        </CardTitle>
        <CardDescription>
          Add a second sign-in step. Pick <strong>one</strong> method — emailed code or authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Email OTP option */}
            <div className="rounded-lg border bg-card/50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      Email code
                      {emailEnabled && <Badge variant="secondary" className="text-xs">On</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {totpSwitchOn
                        ? "Disabled while authenticator app is active."
                        : `Get a 6-digit code emailed to ${user?.email || "your email"} at sign-in.`}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={emailEnabled}
                  onCheckedChange={handleEmailToggle}
                  disabled={locked || totpSwitchOn}
                  aria-label="Toggle email 2FA"
                />
              </div>
            </div>

            {/* Authenticator app option */}
            <div className="rounded-lg border bg-card/50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      Authenticator app
                      {totpEnrolled && <Badge variant="secondary" className="text-xs">On</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {emailEnabled && !totpSwitchOn
                        ? "Disabled while email 2FA is active."
                        : "Use Google Authenticator, 1Password, Authy, etc. Most secure option."}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={totpSwitchOn}
                  onCheckedChange={handleTotpToggle}
                  disabled={busy || (emailEnabled && !totpSwitchOn)}
                  aria-label="Toggle authenticator app 2FA"
                />
              </div>

              {enroll && (
                <div className="space-y-3 pl-7">
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium mb-2">1. Scan this QR code with your authenticator app</p>
                    <div className="flex flex-col sm:flex-row items-start gap-3">
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
              )}
            </div>

            {!anyEnabled && (
              <p className="text-xs text-muted-foreground">
                Two-factor authentication is currently <strong className="text-foreground">off</strong>. We strongly recommend enabling one method, especially for org admins.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
