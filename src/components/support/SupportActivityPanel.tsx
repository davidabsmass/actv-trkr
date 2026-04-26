import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollText, ChevronDown, ChevronRight } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";

type ActivityRow = {
  entry_id: string;
  grant_id: string | null;
  grant_granted_at: string | null;
  grant_expires_at: string | null;
  grant_revoked_at: string | null;
  grant_source: string | null;
  admin_user_id: string;
  admin_display_name: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

type Session = {
  grantId: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  source: string | null;
  entries: ActivityRow[];
};

/**
 * Customer-facing transparency panel: shows a chronological history of every
 * action the ACTV TRKR support team took during a temporary access window.
 * Pairs with `SupportAccessCard` (which controls granting/revoking access).
 *
 * Data comes from the `get_support_activity_for_org` SQL function, which
 * redacts admin identities to first-name + generic label.
 */
export function SupportActivityPanel() {
  const { orgId } = useOrg();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["support_activity_for_org", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase.rpc("get_support_activity_for_org", {
        _org_id: orgId!,
        _limit: 200,
      });
      if (error) throw error;
      return (data || []) as ActivityRow[];
    },
  });

  // Group entries by grant window so customers see "what happened during each session"
  const sessions: Session[] = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<string, Session>();
    for (const row of data) {
      const key = row.grant_id ?? `orphan-${row.entry_id}`;
      if (!map.has(key)) {
        map.set(key, {
          grantId: row.grant_id,
          grantedAt: row.grant_granted_at,
          expiresAt: row.grant_expires_at,
          revokedAt: row.grant_revoked_at,
          source: row.grant_source,
          entries: [],
        });
      }
      map.get(key)!.entries.push(row);
    }
    // Sort sessions by their most recent activity, descending
    return Array.from(map.values()).sort((a, b) => {
      const at = new Date(a.entries[0]?.occurred_at ?? 0).getTime();
      const bt = new Date(b.entries[0]?.occurred_at ?? 0).getTime();
      return bt - at;
    });
  }, [data]);

  const toggleSession = (key: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4" /> Support activity log
        </CardTitle>
        <CardDescription>
          A complete record of every action the ACTV TRKR support team has taken in your account.
          Grouped by access session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading activity…</p>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
            <ScrollText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No support activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              When you grant access and our team takes action in your account, every step will
              appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((session, idx) => {
              const key = session.grantId ?? `orphan-${idx}`;
              const isExpanded = expandedSessions.has(key) || sessions.length === 1;
              const status = getSessionStatus(session);
              return (
                <li
                  key={key}
                  className="rounded-lg border border-border bg-muted/20 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleSession(key)}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {session.grantedAt
                            ? format(new Date(session.grantedAt), "MMM d, yyyy 'at' h:mm a")
                            : "Access session"}
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · {session.entries.length} action
                            {session.entries.length === 1 ? "" : "s"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {describeSession(session)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={status.variant} className="text-xs shrink-0">
                      {status.label}
                    </Badge>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border bg-background/50">
                      <ul className="divide-y divide-border">
                        {session.entries.map((entry) => (
                          <li
                            key={entry.entry_id}
                            className="px-3 py-2 flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="text-foreground">
                                <span className="font-medium">{entry.admin_display_name}</span>{" "}
                                <span className="text-muted-foreground">
                                  {humanizeAction(entry.action)}
                                </span>
                                {entry.resource_type && (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    ({entry.resource_type})
                                  </span>
                                )}
                              </p>
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {format(new Date(entry.occurred_at), "MMM d, h:mm a")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function getSessionStatus(session: Session): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  const now = Date.now();
  if (session.revokedAt) return { label: "Revoked", variant: "outline" };
  if (session.expiresAt && new Date(session.expiresAt).getTime() < now) {
    return { label: "Expired", variant: "secondary" };
  }
  if (session.expiresAt && new Date(session.expiresAt).getTime() >= now) {
    return { label: "Active", variant: "default" };
  }
  return { label: "Closed", variant: "secondary" };
}

function describeSession(session: Session): string {
  const parts: string[] = [];
  if (session.source === "ticket_request") parts.push("Requested via support ticket");
  else if (session.source === "proactive") parts.push("You granted access");

  if (session.revokedAt) {
    parts.push(`Revoked ${formatDistanceToNowStrict(new Date(session.revokedAt), { addSuffix: true })}`);
  } else if (session.expiresAt) {
    const exp = new Date(session.expiresAt).getTime();
    if (exp < Date.now()) {
      parts.push(`Expired ${formatDistanceToNowStrict(new Date(session.expiresAt), { addSuffix: true })}`);
    } else {
      parts.push(`Expires ${formatDistanceToNowStrict(new Date(session.expiresAt), { addSuffix: true })}`);
    }
  }
  return parts.join(" · ");
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    customer_detail_viewed: "viewed your account details",
    password_reset_sent: "sent you a password reset email",
    login_link_sent: "sent you a one-time login link",
    force_logout: "signed you out of all sessions",
    ticket_replied: "replied to your support ticket",
    ticket_status_changed: "updated your ticket status",
    ticket_priority_changed: "changed your ticket priority",
  };
  return map[action] ?? action.replace(/_/g, " ");
}
