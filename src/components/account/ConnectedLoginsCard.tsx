import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link2, Loader2 } from "lucide-react";

type Identity = {
  id: string;
  provider: string;
  identity_data?: Record<string, any>;
  created_at?: string;
};

const PROVIDER_LABEL: Record<string, string> = {
  email: "Email & password",
  google: "Google",
};

export default function ConnectedLoginsCard() {
  const { toast } = useToast();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      setIdentities((data?.identities ?? []) as Identity[]);
    } catch (e: any) {
      // Silent — likely no session yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const linkGoogle = async () => {
    setBusy("link-google");
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/account` },
      });
      if (error) throw error;
    } catch (e: any) {
      toast({ title: "Couldn't link Google", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (identity: Identity) => {
    if (!confirm(`Unlink ${PROVIDER_LABEL[identity.provider] || identity.provider} from your account?`)) return;
    setBusy(identity.id);
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity as any);
      if (error) throw error;
      toast({ title: "Unlinked" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Couldn't unlink", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const hasGoogle = identities.some((i) => i.provider === "google");
  const canUnlink = identities.length > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" /> Connected logins
        </CardTitle>
        <CardDescription>
          Sign in faster by linking additional providers to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {identities.map((identity) => (
                <div
                  key={identity.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {PROVIDER_LABEL[identity.provider] || identity.provider}
                    </div>
                    {identity.identity_data?.email && (
                      <div className="text-xs text-muted-foreground truncate">
                        {identity.identity_data.email}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Linked</Badge>
                    {canUnlink && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unlink(identity)}
                        disabled={busy === identity.id}
                      >
                        {busy === identity.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Unlink"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!hasGoogle && (
              <Button size="sm" variant="outline" onClick={linkGoogle} disabled={busy === "link-google"}>
                {busy === "link-google" ? "Opening…" : "Link Google account"}
              </Button>
            )}
            {!canUnlink && (
              <p className="text-xs text-muted-foreground">
                You need at least one sign-in method. Link another provider before unlinking your current one.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
