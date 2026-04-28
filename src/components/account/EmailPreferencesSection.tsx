import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Mail, Lock, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function EmailPreferencesSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["email_prefs_profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("marketing_consent_status, marketing_consent_timestamp, unsubscribed_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const optedIn = profile?.marketing_consent_status === "opted_in";
  const [marketingOn, setMarketingOn] = useState(optedIn);
  useEffect(() => setMarketingOn(optedIn), [optedIn]);

  const updateMarketing = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.functions.invoke("record-marketing-consent", {
        body: {
          optIn: next,
          source: "email_preferences",
          consentUrl: window.location.href,
        },
      });
      if (error) throw error;
    },
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ["email_prefs_profile", user?.id] });
      toast({
        title: next ? "Subscribed to ACTV TRKR updates" : "Unsubscribed from marketing emails",
      });
    },
    onError: (e: any) => {
      setMarketingOn(optedIn); // revert
      toast({ title: "Couldn't update preferences", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" /> Email preferences
        </CardTitle>
        <CardDescription>
          Choose which ACTV TRKR emails you want to receive. Operational emails are required to keep
          your account secure and in good standing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Operational */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Product &amp; account emails</h3>
                <Badge variant="secondary" className="text-[10px]">Required</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Billing receipts, security alerts, password &amp; sign-in notices, and critical
                service notices. These are operational and can&apos;t be fully disabled.
              </p>
            </div>
          </div>
        </div>

        {/* Marketing */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Marketing emails</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Product updates, launch announcements, website performance tips, and occasional
                offers. Unsubscribe at any time.
              </p>
            </div>
            <Switch
              checked={marketingOn}
              disabled={updateMarketing.isPending}
              onCheckedChange={(v) => {
                setMarketingOn(v);
                updateMarketing.mutate(v);
              }}
              aria-label="Marketing emails"
            />
          </div>
          {profile?.marketing_consent_status === "unsubscribed" && profile?.unsubscribed_at && (
            <p className="text-[11px] text-muted-foreground">
              Unsubscribed on {new Date(profile.unsubscribed_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          ACTV TRKR never uses your customers&apos; website leads for our own marketing.
        </p>
      </CardContent>
    </Card>
  );
}
