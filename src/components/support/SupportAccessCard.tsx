import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNowStrict } from "date-fns";

type Grant = {
  id: string;
  org_id: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  source: string;
  ticket_id: string | null;
  reason: string | null;
};


const DURATION_OPTIONS = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
];

/**
 * Customer-controlled consent card for letting the ACTV TRKR support team
 * temporarily access this organization's dashboard. Pairs with the
 * `dashboard_access_grants` table + `has_active_dashboard_grant()` helper.
 */
export function SupportAccessCard() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState<number>(24);
  const [now, setNow] = useState(() => Date.now());

  // Tick every 30s so the countdown stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: activeGrant, isLoading } = useQuery({
    queryKey: ["dashboard_access_grant_active", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Grant | null> => {
      const { data, error } = await supabase
        .from("dashboard_access_grants")
        .select("id, org_id, granted_at, expires_at, revoked_at, source, ticket_id, reason")
        .eq("org_id", orgId!)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });


  const grantMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !orgId) throw new Error("Not signed in");
      const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("dashboard_access_grants").insert({
        org_id: orgId,
        granted_by_user_id: user.id,
        expires_at: expiresAt,
        source: "proactive",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard_access_grant_active", orgId] });
      toast({
        title: "Access granted",
        description: `ACTV TRKR support can now access your account for ${
          DURATION_OPTIONS.find((d) => d.hours === duration)?.label ?? `${duration}h`
        }.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not grant access", description: e.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (!activeGrant || !user?.id) return;
      const { error } = await supabase
        .from("dashboard_access_grants")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by_user_id: user.id,
        })
        .eq("id", activeGrant.id);
      if (error) throw error;

      // Fire-and-forget: trigger the summary email immediately so the
      // customer doesn't have to wait for the cron sweep. If this fails,
      // the cron job will pick it up on its next run.
      supabase.functions
        .invoke("dispatch-support-access-summaries", {
          body: { grant_id: activeGrant.id },
        })
        .catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard_access_grant_active", orgId] });
      toast({
        title: "Access revoked",
        description: "Support can no longer access your account. We'll email you a summary shortly.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not revoke", description: e.message, variant: "destructive" });
    },
  });

  const isActive = !!activeGrant;
  const expiresInMs = activeGrant ? new Date(activeGrant.expires_at).getTime() - now : 0;
  const expiresInLabel =
    activeGrant && expiresInMs > 0
      ? formatDistanceToNowStrict(new Date(activeGrant.expires_at), { addSuffix: true })
      : "expired";

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" /> Support access
        </CardTitle>
        <CardDescription>
          Grant the ACTV TRKR support team temporary access to your account so they can help debug
          issues. You can revoke access at any time, and every action is logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : isActive ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Access granted — expires {expiresInLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Until {format(new Date(activeGrant!.expires_at), "MMM d, yyyy 'at' h:mm a")}
                    {activeGrant!.source === "ticket_request" && " · requested via support ticket"}
                  </p>
                </div>
              </div>
              <Badge variant="default" className="text-xs shrink-0">
                Active
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              {revokeMutation.isPending ? "Revoking…" : "Revoke access now"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Allow support access</p>
                <p className="text-xs text-muted-foreground">
                  Off — support cannot view or change anything in your account.
                </p>
              </div>
              <Switch
                checked={false}
                onCheckedChange={() => grantMutation.mutate()}
                disabled={grantMutation.isPending}
                aria-label="Grant support access"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="support-access-duration" className="text-xs text-muted-foreground">
                Duration
              </Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger id="support-access-duration" className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.hours} value={String(d.hours)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Every action support takes is recorded below in the activity log.
        </p>
      </CardContent>
    </Card>
  );
}

function humanizeAction(action: string): string {
  return action.replace(/_/g, " ");
}
