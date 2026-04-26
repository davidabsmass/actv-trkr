import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, ExternalLink, RefreshCw, Clock, Plus, Copy } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

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

type SiteOption = {
  id: string;
  domain: string;
  display_name: string | null;
  org_id: string;
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
  const cfg = map[effective] || { variant: "outline" as const, label: effective };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function GrantDialog({ onGranted }: { onGranted: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [duration, setDuration] = useState("24");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: sites } = useQuery<SiteOption[]>({
    enabled: open,
    queryKey: ["support_access_sites"],
    queryFn: async () => {
      // Admins are not members of every org, so direct `sites` SELECT is
      // gated by RLS (is_org_member). Use the admin edge function which
      // bypasses RLS with the service role and returns every subscriber site.
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "list_subscriber_sites" },
      });
      if (error) throw error;
      const orgs: { id: string; name: string }[] = data?.orgs || [];
      const rawSites: { id: string; domain: string; display_name: string | null; org_id: string }[] =
        data?.sites || [];
      const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
      return rawSites
        .map((s) => ({
          id: s.id,
          domain: s.domain,
          display_name: s.display_name,
          org_id: s.org_id,
          orgs: { name: orgMap.get(s.org_id) || "" },
        }))
        .sort((a, b) => (a.domain || "").localeCompare(b.domain || ""));
    },
  });

  const submit = async () => {
    if (!siteId) {
      toast.error("Pick a site first");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("grant-support-access", {
        body: {
          site_id: siteId,
          duration_hours: Number(duration),
          reason: reason.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Grant issued — valid for ${duration}h`);
      onGranted(data.login_url);
      setOpen(false);
      setReason("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to issue support access");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Grant access
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant temporary support access</DialogTitle>
          <DialogDescription>
            Creates a disposable WordPress admin user on the selected site and returns a one-time
            magic-login URL. The user is deleted automatically on revoke or expiry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Site</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger><SelectValue placeholder="Select a site…" /></SelectTrigger>
              <SelectContent>
                {(sites || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.display_name || s.domain} {s.orgs?.name ? `— ${s.orgs.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hour</SelectItem>
                <SelectItem value="24">24 hours</SelectItem>
                <SelectItem value="72">72 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea
              placeholder="e.g. Debugging form submission failures reported in ticket #4821"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !siteId}>
            {submitting ? "Provisioning…" : "Issue grant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SupportAccessPanel() {
  const [showAll, setShowAll] = useState(false);
  const [lastLoginUrl, setLastLoginUrl] = useState<string | null>(null);
  const qc = useQueryClient();

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
      if (!showAll) query = query.in("status", ["active", "pending"]);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SupportGrant[];
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (grantId: string) => {
      const { data, error } = await supabase.functions.invoke("revoke-support-access", {
        body: { grant_id: grantId, reason: "revoked_by_dashboard" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.wp_deleted ? "Access revoked, WP user deleted" : "Grant revoked");
      qc.invalidateQueries({ queryKey: ["support_access_grants"] });
    },
    onError: (e: any) => toast.error(e?.message || "Revoke failed"),
  });

  const activeCount = (grants || []).filter(
    (g) => g.status === "active" && new Date(g.expires_at).getTime() > Date.now()
  ).length;

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Login URL copied");
    } catch {
      toast.error("Copy failed — select the URL manually");
    }
  };

  return (
    <div className="space-y-4">
      {lastLoginUrl && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 flex items-center gap-3">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">One-time login URL ready</p>
              <p className="text-xs font-mono text-muted-foreground truncate">{lastLoginUrl}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => copyUrl(lastLoginUrl)}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy
            </Button>
            <Button size="sm" onClick={() => window.open(lastLoginUrl, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Open
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Temporary Support Access
              </CardTitle>
              <CardDescription className="mt-1">
                Issue a time-limited login for ACTV TRKR staff to troubleshoot a customer site. The plugin
                creates a disposable WP admin user, returns a one-time magic-login URL, and deletes the user
                on revoke or expiry.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={activeCount > 0 ? "default" : "secondary"} className="whitespace-nowrap">
                {activeCount} active
              </Badge>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <GrantDialog onGranted={(url) => setLastLoginUrl(url)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Button size="sm" variant={!showAll ? "default" : "outline"} onClick={() => setShowAll(false)}>
              Active grants
            </Button>
            <Button size="sm" variant={showAll ? "default" : "outline"} onClick={() => setShowAll(true)}>
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
                Click "Grant access" to issue a time-limited WP admin login for a customer site.
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
                      <TableCell className="text-right">
                        {canAccess ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeMut.mutate(g.id)}
                            disabled={revokeMut.isPending}
                          >
                            Revoke
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
        </CardContent>
      </Card>
    </div>
  );
}
