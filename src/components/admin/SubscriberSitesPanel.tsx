import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  ChevronDown,
  ChevronRight,
  KeyRound,
  UserPlus,
  UserMinus,
  Loader2,
  Globe,
  Check,
  X,
  Ban,
  Download,
} from "lucide-react";

type Org = { id: string; name: string; created_at: string };
type Site = { id: string; domain: string; org_id: string; last_heartbeat_at: string | null };
type ApiKey = { id: string; org_id: string; created_at: string; revoked_at: string | null; label: string };
type Member = { user_id: string; role: string; joined_at: string; email: string | null; full_name: string | null };

export default function SubscriberSitesPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active_key" | "all">("active_key");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Add user dialog state
  const [addUserOrg, setAddUserOrg] = useState<{ id: string; name: string } | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"member" | "admin">("member");
  const [addUserSubmitting, setAddUserSubmitting] = useState(false);

  const { data: subscriberData, isLoading: dataLoading } = useQuery({
    queryKey: ["admin_subscriber_sites_all"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "list_subscriber_sites" },
      });
      if (error) throw error;
      return data as { orgs: Org[]; sites: Site[]; api_keys: ApiKey[] };
    },
  });

  const orgs = subscriberData?.orgs;
  const sites = subscriberData?.sites;
  const apiKeys = subscriberData?.api_keys;

  const sitesByOrg = useMemo(() => {
    const m = new Map<string, Site[]>();
    (sites || []).forEach((s) => {
      if (!m.has(s.org_id)) m.set(s.org_id, []);
      m.get(s.org_id)!.push(s);
    });
    return m;
  }, [sites]);

  const activeKeyByOrg = useMemo(() => {
    const m = new Map<string, ApiKey>();
    (apiKeys || []).forEach((k) => {
      if (!k.revoked_at && !m.has(k.org_id)) m.set(k.org_id, k);
    });
    return m;
  }, [apiKeys]);

  const rows = useMemo(() => {
    const list = (orgs || []).map((o) => {
      const orgSites = sitesByOrg.get(o.id) || [];
      const activeKey = activeKeyByOrg.get(o.id) || null;
      return {
        org: o,
        sites: orgSites,
        activeKey,
        primaryDomain: orgSites[0]?.domain || null,
        lastSignal: orgSites
          .map((s) => s.last_heartbeat_at)
          .filter(Boolean)
          .sort()
          .reverse()[0] || null,
      };
    });

    const filtered = list.filter((r) => {
      if (filter === "active_key" && !r.activeKey) return false;
      if (search) {
        const q = search.toLowerCase();
        const inName = r.org.name?.toLowerCase().includes(q);
        const inDomain = r.sites.some((s) => s.domain?.toLowerCase().includes(q));
        if (!inName && !inDomain) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      // Active-key orgs first, then by signal recency, then by created_at
      const aHas = a.activeKey ? 1 : 0;
      const bHas = b.activeKey ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      const aSig = a.lastSignal ? new Date(a.lastSignal).getTime() : 0;
      const bSig = b.lastSignal ? new Date(b.lastSignal).getTime() : 0;
      if (aSig !== bSig) return bSig - aSig;
      return new Date(b.org.created_at).getTime() - new Date(a.org.created_at).getTime();
    });
  }, [orgs, sitesByOrg, activeKeyByOrg, search, filter]);

  // Members for the expanded org only
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["admin_org_members", expandedOrg],
    queryFn: async () => {
      if (!expandedOrg) return [];
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "list_org_members", org_id: expandedOrg },
      });
      if (error) throw error;
      return (data?.members || []) as Member[];
    },
    enabled: !!expandedOrg,
  });

  const refreshMembers = () => {
    if (expandedOrg) {
      queryClient.invalidateQueries({ queryKey: ["admin_org_members", expandedOrg] });
    }
  };

  const handleSendReset = async (email: string) => {
    setActionLoading(`reset-${email}`);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "send_password_reset", email },
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (orgId: string, userId: string, email: string | null) => {
    if (!confirm(`Remove ${email || "this user"} from the organization? Their account will not be deleted.`)) return;
    setActionLoading(`remove-${userId}`);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "remove_user_from_org", org_id: orgId, user_id: userId },
      });
      if (error) throw error;
      toast.success("User removed from organization");
      refreshMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeKey = async (apiKeyId: string, orgName: string) => {
    if (!confirm(`Revoke the active API key for ${orgName}? The site will stop reporting until a new key is generated.`)) return;
    setActionLoading(`revoke-${apiKeyId}`);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "revoke_api_key", api_key_id: apiKeyId },
      });
      if (error) throw error;
      toast.success("API key revoked");
      queryClient.invalidateQueries({ queryKey: ["admin_subscriber_sites_all"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke API key");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportUsers = async () => {
    setActionLoading("export-users");
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "export_users" },
      });
      if (error) throw error;
      const csv: string = data?.csv || "";
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `actv-trkr-users-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data?.row_count ?? "?"} users`);
    } catch (err: any) {
      toast.error(err.message || "Failed to export users");
    } finally {
      setActionLoading(null);
    }
  };
    if (!addUserOrg) return;
    const email = newUserEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setAddUserSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "add_existing_user_to_org",
          org_id: addUserOrg.id,
          email,
          role: newUserRole,
          send_invite_email: true,
        },
      });
      if (error) throw error;
      toast.success(
        data?.was_created
          ? `Created account for ${email} and added to ${addUserOrg.name}. Password setup email sent.`
          : `${email} added to ${addUserOrg.name}. Password setup email sent.`,
      );
      setAddUserOrg(null);
      setNewUserEmail("");
      setNewUserRole("member");
      refreshMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to add user");
    } finally {
      setAddUserSubmitting(false);
    }
  };

  const totalActiveKey = (orgs || []).filter((o) => activeKeyByOrg.has(o.id)).length;
  const totalAll = (orgs || []).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Subscriber Sites ({rows.length} of {filter === "active_key" ? totalActiveKey : totalAll})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
                <button
                  onClick={() => setFilter("active_key")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    filter === "active_key"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Active API Key ({totalActiveKey})
                </button>
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    filter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({totalAll})
                </button>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search org name or domain"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage user access for any subscriber site. Add users, remove users, or send password-reset emails.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Organization</TableHead>
                <TableHead>Domain(s)</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Last Signal</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No subscriber sites match your filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const expanded = expandedOrg === r.org.id;
                return (
                  <>
                    <TableRow key={r.org.id} className="cursor-pointer" onClick={() => setExpandedOrg(expanded ? null : r.org.id)}>
                      <TableCell>
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{r.org.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.sites.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {r.sites.slice(0, 3).map((s) => (
                              <span key={s.id}>{s.domain}</span>
                            ))}
                            {r.sites.length > 3 && (
                              <span className="text-muted-foreground">+{r.sites.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.activeKey ? (
                          <Badge variant="default" className="gap-1">
                            <Check className="h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <X className="h-3 w-3" /> None
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lastSignal ? new Date(r.lastSignal).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={() => setAddUserOrg({ id: r.org.id, name: r.org.name })}
                        >
                          <UserPlus className="h-3 w-3 mr-1" /> Add User
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={`${r.org.id}-members`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-foreground">
                                Members of {r.org.name}
                              </h4>
                            </div>
                            {membersLoading ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
                              </div>
                            ) : !members || members.length === 0 ? (
                              <p className="text-sm text-muted-foreground italic">
                                No members yet. Use "Add User" to grant access.
                              </p>
                            ) : (
                              <div className="rounded-md border border-border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Name</TableHead>
                                      <TableHead>Email</TableHead>
                                      <TableHead>Role</TableHead>
                                      <TableHead>Joined</TableHead>
                                      <TableHead>Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {members.map((m) => (
                                      <TableRow key={m.user_id}>
                                        <TableCell className="text-xs font-medium">
                                          {m.full_name || "—"}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                          {m.email || <span className="text-muted-foreground">unknown</span>}
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={m.role === "admin" ? "default" : "outline"}>
                                            {m.role}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-1">
                                            {m.email && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs"
                                                onClick={() => handleSendReset(m.email!)}
                                                disabled={actionLoading === `reset-${m.email}`}
                                              >
                                                {actionLoading === `reset-${m.email}` ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <KeyRound className="h-3 w-3 mr-1" />
                                                )}
                                                Reset Password
                                              </Button>
                                            )}
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              className="h-7 text-xs"
                                              onClick={() => handleRemove(r.org.id, m.user_id, m.email)}
                                              disabled={actionLoading === `remove-${m.user_id}`}
                                            >
                                              {actionLoading === `remove-${m.user_id}` ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                <UserMinus className="h-3 w-3 mr-1" />
                                              )}
                                              Remove
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog
        open={!!addUserOrg}
        onOpenChange={(open) => {
          if (!open) {
            setAddUserOrg(null);
            setNewUserEmail("");
            setNewUserRole("member");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user to {addUserOrg?.name}</DialogTitle>
            <DialogDescription>
              The user will receive an email with a link to set their password. If they don't have an account yet, one will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email address</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="user@example.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-role">Role</Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as "member" | "admin")}>
                <SelectTrigger id="new-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOrg(null)} disabled={addUserSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={addUserSubmitting}>
              {addUserSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Adding…
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Add User
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
