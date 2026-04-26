import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Monitor, ShieldOff, ShieldAlert, Smartphone } from "lucide-react";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch { return iso; }
};

// Friendly device label from a User-Agent string. Best-effort, no network.
const labelForUA = (ua: string | null): string => {
  if (!ua) return "Unknown device";
  const lc = ua.toLowerCase();
  let os = "";
  if (lc.includes("windows")) os = "Windows";
  else if (lc.includes("mac os") || lc.includes("macintosh")) os = "macOS";
  else if (lc.includes("iphone")) os = "iPhone";
  else if (lc.includes("ipad")) os = "iPad";
  else if (lc.includes("android")) os = "Android";
  else if (lc.includes("linux")) os = "Linux";
  let browser = "";
  if (lc.includes("edg/")) browser = "Edge";
  else if (lc.includes("chrome/") && !lc.includes("edg/")) browser = "Chrome";
  else if (lc.includes("safari/") && !lc.includes("chrome/")) browser = "Safari";
  else if (lc.includes("firefox/")) browser = "Firefox";
  return [browser, os].filter(Boolean).join(" on ") || "Browser";
};

export default function SecuritySessionsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["auth_recent_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_recent_sessions")
        .select("id, user_agent, signed_in_at, last_seen_at, revoked_at, revoke_reason")
        .order("signed_in_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const devicesQuery = useQuery({
    queryKey: ["auth_trusted_devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_trusted_devices")
        .select("id, label, user_agent, last_used_at, expires_at, revoked_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const revoke = useMutation({
    mutationFn: async (vars: { target: "session" | "device" | "all"; id?: string }) => {
      const { error } = await supabase.functions.invoke("revoke-user-session", {
        body: vars,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast({
        title: vars.target === "all" ? "All sessions signed out" : "Revoked",
        description: vars.target === "all"
          ? "You'll be signed out shortly."
          : "This entry has been revoked.",
      });
      queryClient.invalidateQueries({ queryKey: ["auth_recent_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["auth_trusted_devices"] });
      if (vars.target === "all") {
        // Force a sign-out locally too.
        setTimeout(() => { supabase.auth.signOut(); }, 1500);
      }
    },
    onError: (e: any) => {
      toast({ title: "Couldn't revoke", description: e?.message ?? "", variant: "destructive" });
    },
    onSettled: () => setRevoking(null),
  });

  const sessions = sessionsQuery.data ?? [];
  const devices = devicesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-4 w-4" /> Recent sign-ins
              </CardTitle>
              <CardDescription>
                Recent successful sign-ins to your account. If you don't recognize one,
                revoke it and change your password.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { setRevoking("all"); revoke.mutate({ target: "all" }); }}
              disabled={revoking === "all"}
            >
              {revoking === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4 mr-1" />}
              Sign out everywhere
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sessionsQuery.isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!sessionsQuery.isLoading && sessions.length === 0 && (
            <div className="text-sm text-muted-foreground">No recent sign-ins recorded yet.</div>
          )}
          <div className="space-y-2">
            {sessions.map((s) => {
              const isRevoked = !!s.revoked_at;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {labelForUA(s.user_agent)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Signed in {fmtDate(s.signed_in_at)}
                      {s.last_seen_at && s.last_seen_at !== s.signed_in_at && (
                        <> · last seen {fmtDate(s.last_seen_at)}</>
                      )}
                    </div>
                    {isRevoked && (
                      <div className="text-xs text-destructive mt-0.5">
                        Revoked {fmtDate(s.revoked_at)}
                        {s.revoke_reason ? ` (${s.revoke_reason})` : ""}
                      </div>
                    )}
                  </div>
                  <div>
                    {isRevoked ? (
                      <Badge variant="outline" className="text-xs">Revoked</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRevoking(s.id); revoke.mutate({ target: "session", id: s.id }); }}
                        disabled={revoking === s.id}
                      >
                        {revoking === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" /> Trusted devices
          </CardTitle>
          <CardDescription>
            Devices that can sign in without a 2FA code for 30 days. Revoke any you no longer use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {devicesQuery.isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!devicesQuery.isLoading && devices.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No trusted devices yet. You can mark a device as trusted when entering your 2FA code at sign-in.
            </div>
          )}
          <div className="space-y-2">
            {devices.map((d) => {
              const isRevoked = !!d.revoked_at;
              const isExpired = d.expires_at && new Date(d.expires_at).getTime() < Date.now();
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {labelForUA(d.user_agent) || d.label || "Browser"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Trusted since {fmtDate(d.created_at)} · expires {fmtDate(d.expires_at)}
                      {d.last_used_at && <> · last used {fmtDate(d.last_used_at)}</>}
                    </div>
                  </div>
                  <div>
                    {isRevoked ? (
                      <Badge variant="outline" className="text-xs">Revoked</Badge>
                    ) : isExpired ? (
                      <Badge variant="outline" className="text-xs">Expired</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRevoking(d.id); revoke.mutate({ target: "device", id: d.id }); }}
                        disabled={revoking === d.id}
                      >
                        {revoking === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="pt-6 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
          <div>
            If you ever see a sign-in or trusted device you don't recognize, revoke it
            immediately and change your password. We'll also email you a security alert
            for risky events with a one-click "lock my account" button.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
