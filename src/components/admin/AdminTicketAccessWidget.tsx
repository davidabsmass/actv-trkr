import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Send, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const REQUEST_MESSAGE_PREFIX = "[Support Access Request] ";

const REQUEST_TEMPLATE =
  "Our support team would like temporary access to your dashboard so we can investigate this issue more quickly. " +
  "If you'd like us to take a look, please go to **Account → Support → Support access** and switch on \"Allow support access\". " +
  "You can revoke it any time, and you'll see exactly what we did in the access history.";

type GrantSummary = {
  id: string;
  expires_at: string;
  granted_at: string;
  source: string;
};

/**
 * Admin-only sidebar widget on a support ticket. Shows whether the customer's
 * org currently allows the support team to access their dashboard, and lets
 * the agent post a polite consent request into the ticket thread.
 */
export function AdminTicketAccessWidget({
  ticketId,
  orgId,
}: {
  ticketId: string;
  orgId: string | null | undefined;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeGrant, isLoading } = useQuery({
    queryKey: ["admin_dashboard_grant", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<GrantSummary | null> => {
      const { data, error } = await supabase
        .from("dashboard_access_grants")
        .select("id, expires_at, granted_at, source")
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

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        author_user_id: user.id,
        author_name: profile?.full_name || "Support",
        author_email: profile?.email || user.email,
        author_type: "admin",
        message: REQUEST_MESSAGE_PREFIX + REQUEST_TEMPLATE,
        is_internal: false,
      });
      if (error) throw error;
      // Notify the customer (existing notification pipeline).
      supabase.functions
        .invoke("notify-support-event", {
          body: {
            ticket_id: ticketId,
            event_kind: "admin_replied",
            message_preview: "Support access request sent",
          },
        })
        .catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_support_ticket_messages", ticketId] });
      toast({
        title: "Access request sent",
        description: "The customer will see the request in this ticket and can grant access from their Account page.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Could not send request", description: e.message, variant: "destructive" }),
  });

  if (!orgId) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> Dashboard access
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground">Checking…</p>
        ) : activeGrant ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="default" className="text-[10px]">Granted</Badge>
              <span className="text-muted-foreground">
                until {format(new Date(activeGrant.expires_at), "MMM d, h:mm a")}
              </span>
            </div>
            <p className="text-muted-foreground">
              The customer has authorized temporary dashboard access. Log every action you take.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Lock className="h-2.5 w-2.5" /> Not granted
              </Badge>
            </div>
            <p className="text-muted-foreground">
              You don't have permission to access this customer's dashboard. Send a polite request and they can toggle access on from their Account page.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 mt-1"
              onClick={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
            >
              <Send className="h-3.5 w-3.5" />
              {requestMutation.isPending ? "Sending…" : "Request access"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
