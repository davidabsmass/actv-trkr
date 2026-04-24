import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, ExternalLink, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type SupportGrant = {
  id: string;
  org_id: string;
  site_id: string;
  status: string;
  duration_hours: number;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  granted_by_email: string | null;
  wp_temp_username: string | null;
  staff_access_count: number;
  last_staff_access_at: string | null;
  sites?: { domain: string; display_name: string | null } | null;
  orgs?: { name: string } | null;
};

function statusBadge(status: string, expiresAt: string) {
  const isExpired = new Date(expiresAt).getTime() < Date.now();
  const effective = status === "active" && isExpired ? "expired" : status;

  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    active: { variant: "default", label: "Active" },
    pending: { variant: "outline", label: "Pending" },
    expired: { variant: "secondary", label: "Expired" },
    revoked: { variant: "secondary", label: "Revoked" },
  };
  const config = map[effective] || { variant: "outline" as const, label: effective };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function SupportAccessPanel() {
  const [showAll, setShowAll] = useState(false);

  const { data: grants, isLoading, refetch, isFetching } = useQuery<SupportGrant[]>({
    queryKey: ["support_access_grants", showAll],
    queryFn: async () => {
      let query = (supabase as any)
        .from("support_access_grants")
        .select(`
          id, org_id, site_id, status, duration_hours,
          granted_at, expires_at, revoked_at, granted_by_email,
          wp_temp_username, staff_access_count, last_staff_access_at,
          sites:site_id ( domain, display_name ),
          orgs:org_id ( name )
        `)
        .order("granted_at", { ascending: false })
        .limit(showAll ? 200 : 50);

      if (!showAll) {
        query = query.in("status", ["active", "pending"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SupportGrant[];
    },
  });

  const activeCount = (grants || []).filter(
    (g) => g.status === "active" && new Date(g.expires_at).getTime() > Date.now()
  ).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Temporary Support Access
              </CardTitle>
              <CardDescription className="mt-1">
                Time-limited troubleshooting grants issued by customers from inside their WordPress plugin.
                Access is logged, expires automatically, and can be revoked at any time.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={activeCount > 0 ? "default" : "secondary"}>
                {activeCount} active
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Button
              size="sm"
              variant={!showAll ? "default" : "outline"}
              onClick={() => setShowAll(false)}
            >
              Active grants
            </Button>
            <Button
              size="sm"
              variant={showAll ? "default" : "outline"}
              onClick={() => setShowAll(true)}
            >
              All history
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : !grants || grants.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">No {showAll ? "" : "active"} support access grants</p>
              <p className="text-xs text-muted-foreground mt-1">
                Customers grant access from their WordPress plugin's Settings → Advanced → Support Access.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Granted by</TableHead>
                  <TableHead>WP user</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((g) => {
                  const isExpired = new Date(g.expires_at).getTime() < Date.now();
                  const canAccess = g.status === "active" && !isExpired;
                  const siteLabel = g.sites?.display_name || g.sites?.domain || g.site_id.slice(0, 8);
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{siteLabel}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {g.orgs?.name || g.org_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{statusBadge(g.status, g.expires_at)}</TableCell>
                      <TableCell className="text-sm">
                        {canAccess ? (
                          <span className="flex items-center gap-1 text-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(g.expires_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {format(new Date(g.expires_at), "MMM d, h:mm a")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {g.granted_by_email || "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {g.wp_temp_username || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {g.staff_access_count > 0
                          ? `${g.staff_access_count} access${g.staff_access_count === 1 ? "" : "es"}`
                          : "Not used"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canAccess ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            title="Plugin support endpoint not yet shipped"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Open
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Plugin-side support access UI is pending.</p>
              <p className="text-muted-foreground">
                The database, RLS, and admin viewer are live. The WordPress plugin still needs the
                Settings → Advanced → Support Access screen, the temporary user lifecycle, and the
                magic-link consumption endpoint. Until then, no grants can be created from the customer side.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
