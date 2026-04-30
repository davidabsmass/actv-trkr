import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Mail,
} from "lucide-react";

type Org = {
  id: string;
  name: string;
  created_at: string;
  status?: "active" | "grace_period" | "archived" | null;
  billing_exempt?: boolean | null;
  grace_period_ends_at?: string | null;
  archived_at?: string | null;
};
type Site = { id: string; domain: string; org_id: string; last_heartbeat_at: string | null };
type ApiKey = { id: string; org_id: string; created_at: string; revoked_at: string | null; label: string };
type Member = {
  user_id: string;
  role: string;
  status?: string | null;
  joined_at: string;
  invited_at?: string | null;
  invite_accepted_at?: string | null;
  is_owner?: boolean;
  email: string | null;
  full_name: string | null;
};

export default function SubscriberSitesPanel() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active_key" | "all">("active_key");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"manager" | "admin">("manager");

  // Add user dialog state
  const [addUserOrg, setAddUserOrg] = useState<{ id: string; name: string } | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"manager" | "admin">("manager");
  const [newUserTempPassword, setNewUserTempPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [addUserSubmitting, setAddUserSubmitting] = useState(false);

  const generateTempPassword = () => {
    // 14-char password with mixed case, digits, and a symbol — safe for clipboard sharing
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const symbols = "!@#$%^&*";
    let pw = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 12; i++) pw += chars[arr[i] % chars.length];
    // Guarantee complexity
    pw += symbols[Math.floor(Math.random() * symbols.length)];
    pw += String(Math.floor(Math.random() * 10));
    setNewUserTempPassword(pw);
    setShowTempPassword(true);
  };

  const { data: subscriberData, isLoading: dataLoading } = useQuery({
    queryKey: ["admin_subscriber_sites_all"],
    queryFn: async () => {
      if (!user) return { orgs: [], sites: [], api_keys: [] };
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "list_subscriber_sites" },
      });
      if (error) throw error;
      return data as { orgs: Org[]; sites: Site[]; api_keys: ApiKey[] };
    },
    enabled: !!user,
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
      if (!expandedOrg || !user) return [];
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "list_org_members", org_id: expandedOrg },
      });
      if (error) throw error;
      return (data?.members || []) as Member[];
    },
    enabled: !!expandedOrg && !!user,
    retry: (failureCount, err: any) => {
      // Retry transient 404 / NOT_FOUND from edge function cold-boot routing
      const msg = String(err?.message || err?.context?.body || "");
      if (failureCount < 2 && /404|NOT_FOUND|not found/i.test(msg)) return true;
      return false;
    },
    retryDelay: 500,
  });

  if (authLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          Loading admin access…
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          Sign in to load subscriber sites.
        </CardContent>
      </Card>
    );
  }


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

  const handleInviteAction = async (orgId: string, userId: string, action: "resend" | "cancel") => {
    if (action === "cancel" && !confirm("Cancel this pending invitation?")) return;
    setActionLoading(`${action}-invite-${userId}`);
    try {
      const { error } = await supabase.functions.invoke("manage-org-invite", {
        body: { action, orgId, targetUserId: userId },
      });
      if (error) throw error;
      toast.success(action === "resend" ? "Invitation resent" : "Invitation cancelled");
      refreshMembers();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} invite`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetPassword = async (orgId: string, email: string) => {
    if (!confirm(`Generate a new temporary password for ${email}? Their current password will be replaced and copied to your clipboard.`)) return;
    // Generate a 14-char password
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const symbols = "!@#$%^&*";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    let pw = "";
    for (let i = 0; i < 12; i++) pw += chars[arr[i] % chars.length];
    pw += symbols[Math.floor(Math.random() * symbols.length)];
    pw += String(Math.floor(Math.random() * 10));

    setActionLoading(`setpw-${email}`);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "reset_password", email, new_password: pw, org_id: orgId },
      });
      if (error) throw error;
      try {
        await navigator.clipboard.writeText(pw);
        toast.success(`New password set & copied to clipboard: ${pw}`, { duration: 15000 });
      } catch {
        toast.success(`Password set. Copy it now: ${pw}`, { duration: 30000 });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to set password");
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

  const startEditMember = (m: Member) => {
    setEditingMember(m.user_id);
    setEditName(m.full_name || "");
    setEditRole((m.role === "admin" ? "admin" : "manager"));
  };

  const cancelEditMember = () => {
    setEditingMember(null);
    setEditName("");
    setEditRole("manager");
  };

  const handleSaveMember = async (orgId: string, userId: string) => {
    setActionLoading(`save-${userId}`);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "update_org_member",
          org_id: orgId,
          user_id: userId,
          full_name: editName.trim(),
          role: editRole,
        },
      });

      // Edge function returned a non-2xx — try to read the JSON error body.
      if (error) {
        let serverMsg = "";
        try {
          const ctx = (error as any).context;
          if (ctx?.json) serverMsg = (await ctx.json())?.error || "";
          else if (ctx?.text) serverMsg = await ctx.text();
        } catch (_) { /* ignore */ }
        toast.error(serverMsg || error.message || "Failed to update member");
        return;
      }

      if (data && (data as any).error) {
        toast.error((data as any).error);
        return;
      }

      toast.success("Member updated");
      cancelEditMember();
      refreshMembers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update member");
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

  const handleAddUser = async () => {
    if (!addUserOrg) return;
    const email = newUserEmail.trim().toLowerCase();
    const fullName = newUserName.trim();
    const tempPassword = newUserTempPassword.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (tempPassword && tempPassword.length < 8) {
      toast.error("Temporary password must be at least 8 characters");
      return;
    }
    setAddUserSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "add_existing_user_to_org",
          org_id: addUserOrg.id,
          email,
          full_name: fullName || undefined,
          temp_password: tempPassword || undefined,
          role: newUserRole,
          send_invite_email: !tempPassword, // skip the reset email when admin sets a temp password
        },
      });
      if (error) throw error;

      if (tempPassword) {
        // Copy to clipboard for the admin to share
        try { await navigator.clipboard.writeText(tempPassword); } catch { /* noop */ }
        toast.success(
          `${email} added to ${addUserOrg.name}. Temporary password copied to clipboard — share it securely.`,
          { duration: 8000 },
        );
      } else {
        toast.success(
          data?.was_created
            ? `Created account for ${email} and added to ${addUserOrg.name}. Password setup email sent.`
            : `${email} added to ${addUserOrg.name}. Password setup email sent.`,
        );
      }
      setAddUserOrg(null);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserRole("manager");
      setNewUserTempPassword("");
      setShowTempPassword(false);
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
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportUsers}
                disabled={actionLoading === "export-users"}
                className="h-9"
              >
                {actionLoading === "export-users" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                Export Users CSV
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage user access for any subscriber site. Add users, remove users, send password resets, or revoke API keys. A daily user export is also emailed automatically to david@absmass.com.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Domain(s)</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Lifecycle</TableHead>
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
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="gap-1">
                              <Check className="h-3 w-3" /> Active
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevokeKey(r.activeKey!.id, r.org.name);
                              }}
                              disabled={actionLoading === `revoke-${r.activeKey.id}`}
                              title="Revoke this API key"
                            >
                              {actionLoading === `revoke-${r.activeKey.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Ban className="h-3 w-3 mr-1" />
                              )}
                              Revoke
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <X className="h-3 w-3" /> None
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const status = (r.org as any).status || "active";
                          const exempt = (r.org as any).billing_exempt === true;
                          const wouldBe = exempt && status !== "active" ? ` (would be ${status})` : "";
                          const displayStatus = exempt ? "active" : status;
                          const variant: "default" | "secondary" | "destructive" =
                            displayStatus === "active" ? "default" : displayStatus === "grace_period" ? "secondary" : "destructive";
                          return (
                            <div className="flex flex-col gap-1">
                              <Badge variant={variant} className="w-fit text-[10px] capitalize leading-tight">
                                {displayStatus.replace("_", " ")}{exempt ? " · exempt" : ""}
                              </Badge>
                              {wouldBe && <span className="text-[10px] text-muted-foreground">{wouldBe}</span>}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lastSignal ? new Date(r.lastSignal).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => setAddUserOrg({ id: r.org.id, name: r.org.name })}
                          >
                            <UserPlus className="h-3 w-3 mr-1" /> Add User
                          </Button>
                          <Select
                            value=""
                            onValueChange={async (newStatus) => {
                              if (!newStatus) return;
                              const current = (r.org as any).status || "active";
                              if (newStatus === current) return;
                              if (!confirm(`Change ${r.org.name} from "${current}" to "${newStatus}"?`)) return;
                              setActionLoading(`status-${r.org.id}`);
                              try {
                                const { error } = await supabase.functions.invoke("admin-manage-user", {
                                  body: { action: "set_org_lifecycle_status", org_id: r.org.id, status: newStatus },
                                });
                                if (error) throw error;
                                toast.success(`Status set to ${newStatus}`);
                                queryClient.invalidateQueries({ queryKey: ["admin_subscriber_sites_all"] });
                              } catch (err: any) {
                                toast.error(err.message || "Failed to update status");
                              } finally {
                                setActionLoading(null);
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 w-[110px] text-xs" disabled={actionLoading === `status-${r.org.id}`}>
                              <SelectValue placeholder="Override…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Set Active</SelectItem>
                              <SelectItem value="grace_period">Set Grace</SelectItem>
                              <SelectItem value="archived">Set Archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
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
                                    {members.map((m) => {
                                      const isEditing = editingMember === m.user_id;
                                      const saving = actionLoading === `save-${m.user_id}`;
                                      return (
                                      <TableRow key={m.user_id}>
                                        <TableCell className="text-xs font-medium">
                                          {isEditing ? (
                                            <Input
                                              value={editName}
                                              onChange={(e) => setEditName(e.target.value)}
                                              placeholder="Full name"
                                              className="h-7 text-xs"
                                              disabled={saving}
                                            />
                                          ) : (
                                            m.full_name || "—"
                                          )}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                          {m.email || <span className="text-muted-foreground">unknown</span>}
                                        </TableCell>
                                        <TableCell>
                                          {isEditing ? (
                                            <Select
                                              value={editRole}
                                              onValueChange={(v) => setEditRole(v as "manager" | "admin")}
                                              disabled={saving}
                                            >
                                              <SelectTrigger className="h-7 w-[100px] text-xs">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="manager">manager</SelectItem>
                                                <SelectItem value="admin">admin</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          ) : (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <Badge variant={m.role === "admin" ? "default" : "outline"}>
                                                {m.role}
                                              </Badge>
                                              {m.status === "invited" && (
                                                <Badge variant="secondary" className="gap-1">
                                                  <Mail className="h-3 w-3" /> Pending
                                                </Badge>
                                              )}
                                            </div>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {m.status === "invited"
                                            ? m.invited_at
                                              ? `Invited ${new Date(m.invited_at).toLocaleDateString()}`
                                              : "Invited"
                                            : m.joined_at
                                              ? new Date(m.joined_at).toLocaleDateString()
                                              : "—"}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-1 flex-wrap">
                                            {isEditing ? (
                                              <>
                                                <Button
                                                  size="sm"
                                                  variant="default"
                                                  className="h-7 text-xs"
                                                  onClick={() => handleSaveMember(r.org.id, m.user_id)}
                                                  disabled={saving}
                                                >
                                                  {saving ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <Check className="h-3 w-3 mr-1" />
                                                  )}
                                                  Save
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-7 text-xs"
                                                  onClick={cancelEditMember}
                                                  disabled={saving}
                                                >
                                                  <X className="h-3 w-3 mr-1" />
                                                  Cancel
                                                </Button>
                                              </>
                                            ) : m.status === "invited" ? (
                                              <>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 text-xs"
                                                  onClick={() => handleInviteAction(r.org.id, m.user_id, "resend")}
                                                  disabled={actionLoading === `resend-invite-${m.user_id}`}
                                                >
                                                  {actionLoading === `resend-invite-${m.user_id}` ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <RefreshCw className="h-3 w-3 mr-1" />
                                                  )}
                                                  Resend
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                                  onClick={() => handleInviteAction(r.org.id, m.user_id, "cancel")}
                                                  disabled={actionLoading === `cancel-invite-${m.user_id}`}
                                                >
                                                  {actionLoading === `cancel-invite-${m.user_id}` ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <X className="h-3 w-3 mr-1" />
                                                  )}
                                                  Cancel invite
                                                </Button>
                                              </>
                                            ) : (
                                              <>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 text-xs"
                                                  onClick={() => startEditMember(m)}
                                                >
                                                  Edit
                                                </Button>
                                                {m.email && (
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs"
                                                    onClick={() => handleSendReset(m.email!)}
                                                    disabled={actionLoading === `reset-${m.email}`}
                                                  >
                                                    {actionLoading === `reset-${m.email}` ? (
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                      <KeyRound className="h-3 w-3 mr-1" />
                                                    )}
                                                    Email Reset
                                                  </Button>
                                                )}
                                                <button
                                                  type="button"
                                                  className="text-xs text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                                                  onClick={() => handleRemove(r.org.id, m.user_id, m.email)}
                                                  disabled={actionLoading === `remove-${m.user_id}`}
                                                >
                                                  {actionLoading === `remove-${m.user_id}` && (
                                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                  )}
                                                  Remove
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                      );
                                    })}
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
            setNewUserName("");
            setNewUserRole("manager");
            setNewUserTempPassword("");
            setShowTempPassword(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user to {addUserOrg?.name}</DialogTitle>
            <DialogDescription>
              {newUserTempPassword
                ? "A temporary password will be set on the account. Share it securely — the user can change it after their first login."
                : "The user will receive an email with a link to set their password. If they don't have an account yet, one will be created automatically."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-user-name">Full name</Label>
              <Input
                id="new-user-name"
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="off"
              />
            </div>
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
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as "manager" | "admin")}>
                <SelectTrigger id="new-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="new-user-temp-password">Temporary password (optional)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={generateTempPassword}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Generate
                </Button>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="new-user-temp-password"
                    type={showTempPassword ? "text" : "password"}
                    value={newUserTempPassword}
                    onChange={(e) => setNewUserTempPassword(e.target.value)}
                    placeholder="Leave blank to email a setup link"
                    autoComplete="new-password"
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTempPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showTempPassword ? "Hide password" : "Show password"}
                  >
                    {showTempPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newUserTempPassword && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(newUserTempPassword);
                        toast.success("Copied to clipboard");
                      } catch {
                        toast.error("Could not copy");
                      }
                    }}
                    aria-label="Copy password"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {newUserTempPassword
                  ? "Skips the password-setup email. Share this with the user securely."
                  : "If left blank, the user gets an email link to choose their own password."}
              </p>
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
