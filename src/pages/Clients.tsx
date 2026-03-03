import { useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, UserPlus, Users, Mail, Trash2, Copy, Check, Link, KeyRound, Ticket,
  Key, Plus, Ban, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadPlugin } from "@/lib/plugin-download";

export default function Clients() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { orgs } = useOrg();
  const { user } = useAuth();

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgTimezone, setNewOrgTimezone] = useState("America/New_York");
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  if (roleLoading) return <div className="p-12 text-center text-muted-foreground text-sm">Loading…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Clients</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage client organizations and users</p>

      {/* Client selector + Add */}
      <div className="flex items-center gap-3 mb-6">
        <Select value={selectedOrgId ?? ""} onValueChange={(v) => setSelectedOrgId(v)}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Select a client…" />
          </SelectTrigger>
          <SelectContent>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
              <Building2 className="h-3.5 w-3.5" /> Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Client Organization</DialogTitle></DialogHeader>
            <CreateOrgForm
              newOrgName={newOrgName}
              setNewOrgName={setNewOrgName}
              newOrgTimezone={newOrgTimezone}
              setNewOrgTimezone={setNewOrgTimezone}
              userId={user?.id}
              onCreated={(orgId: string) => {
                setCreateOrgOpen(false);
                setNewOrgName("");
                setSelectedOrgId(orgId);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {selectedOrg ? (
        <OrgDetail org={selectedOrg} />
      ) : (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {orgs.length === 0 ? "No organizations yet. Add a client to get started." : "Select a client from the dropdown above."}
          </p>
        </div>
      )}
    </div>
  );
}

function CreateOrgForm({
  newOrgName, setNewOrgName, newOrgTimezone, setNewOrgTimezone, userId, onCreated,
}: {
  newOrgName: string; setNewOrgName: (v: string) => void;
  newOrgTimezone: string; setNewOrgTimezone: (v: string) => void;
  userId?: string; onCreated: (orgId: string) => void;
}) {
  const queryClient = useQueryClient();

  const createOrg = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const orgId = crypto.randomUUID();
      const { error: orgErr } = await supabase
        .from("orgs").insert({ id: orgId, name: newOrgName, timezone: newOrgTimezone });
      if (orgErr) throw orgErr;
      const { error: ouErr } = await supabase
        .from("org_users").insert({ org_id: orgId, user_id: userId, role: "admin" });
      if (ouErr) throw ouErr;
      return { id: orgId, name: newOrgName };
    },
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      toast.success("Client organization created");
      onCreated(org.id);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create org"),
  });

  return (
    <div className="space-y-4 pt-2">
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Organization Name</label>
        <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Client name" />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Timezone</label>
        <Select value={newOrgTimezone} onValueChange={setNewOrgTimezone}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "UTC"].map((tz) => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full" disabled={!newOrgName.trim() || createOrg.isPending} onClick={() => createOrg.mutate()}>
        {createOrg.isPending ? "Creating…" : "Create Organization"}
      </Button>
    </div>
  );
}

function ClientApiKeys({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api_keys", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, label, created_at, revoked_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const generateKey = async () => {
    setGenerating(true);
    try {
      const rawKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(rawKey)
      );
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error } = await supabase
        .from("api_keys")
        .insert({ org_id: orgId, key_hash: keyHash, label: "Default" });
      if (error) throw error;

      setNewKey(rawKey);
      queryClient.invalidateQueries({ queryKey: ["api_keys", orgId] });
      toast.success("API key generated — copy it now.");
    } catch (err: any) {
      toast.error(err?.message || "Error generating key");
    } finally {
      setGenerating(false);
    }
  };

  const revokeKey = async (id: string) => {
    setRevokingId(id);
    try {
      const { error } = await supabase
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["api_keys", orgId] });
      toast.success("Key revoked");
    } catch (err: any) {
      toast.error(err?.message || "Error revoking key");
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async (key: string) => {
    setDownloading(true);
    try {
      await downloadPlugin(key);
      toast.success("Plugin downloaded with this client's API key.");
    } catch (err: any) {
      toast.error(err?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">API Keys & Plugin</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={generating}
          onClick={generateKey}
        >
          <Plus className="h-3 w-3" />
          {generating ? "Generating…" : "New Key"}
        </Button>
      </div>

      {newKey && (
        <div className="mb-3 rounded-lg bg-secondary p-3 space-y-2">
          <p className="text-xs text-secondary-foreground/70 font-medium">
            New API key — copy it now, it won't be shown again:
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-secondary-foreground flex-1 break-all">
              {newKey}
            </code>
            <button
              onClick={() => copyKey(newKey)}
              className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
          <button
            onClick={() => handleDownload(newKey)}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            {downloading ? "Downloading…" : "Download Plugin with this key"}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading keys…</p>
      ) : !keys?.length ? (
        <p className="text-xs text-muted-foreground">No API keys yet. Generate one to get started.</p>
      ) : (
        <ScrollArea className="max-h-[240px]">
          <div className="space-y-2 pr-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{k.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.revoked_at && (
                      <span className="ml-2 text-destructive">
                        · Revoked {new Date(k.revoked_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!k.revoked_at && newKey && (
                    <button
                      onClick={() => handleDownload(newKey)}
                      disabled={downloading}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-foreground hover:bg-accent rounded transition-colors"
                      title="Download plugin with this key"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  )}
                  {!k.revoked_at && (
                    <button
                      onClick={() => revokeKey(k.id)}
                      disabled={revokingId === k.id}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50"
                    >
                      <Ban className="h-3 w-3" />
                      {revokingId === k.id ? "…" : "Revoke"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function OrgDetail({ org }: { org: any }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [urlCopied, setUrlCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const dashboardUrl = `https://actvtrkr.com/auth`;

  const copyDashboardUrl = () => {
    navigator.clipboard.writeText(dashboardUrl);
    setUrlCopied(true);
    toast.success("Dashboard URL copied!");
    setTimeout(() => setUrlCopied(false), 2000);
  };

  // Invite codes
  const { data: inviteCodes, isLoading: inviteLoading } = useQuery({
    queryKey: ["invite_codes", org.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invite_codes")
        .select("*")
        .eq("org_id", org.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const generateInvite = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((b) => b.toString(36).toUpperCase().padStart(2, "0"))
        .join("")
        .slice(0, 8);
      const { error } = await supabase
        .from("invite_codes")
        .insert({ org_id: org.id, code, created_by: user.id });
      if (error) throw error;
      return code;
    },
    onSuccess: (code) => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes", org.id] });
      const inviteUrl = `https://actvtrkr.com/auth?invite=${code}`;
      navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied to clipboard!");
    },
    onError: (err: any) => toast.error(err.message || "Failed to generate invite"),
  });

  const deactivateInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invite_codes")
        .update({ active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes", org.id] });
      toast.success("Invite code deactivated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to deactivate"),
  });

  const copyInviteLink = (code: string) => {
    const url = `https://actvtrkr.com/auth?invite=${code}`;
    navigator.clipboard.writeText(url);
    setInviteCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const { data: members, isLoading } = useQuery({
    queryKey: ["org_users", org.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_users").select("id, user_id, role, created_at")
        .eq("org_id", org.id).order("created_at");
      if (error) throw error;

      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, email, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      // Filter out org_users whose auth account no longer exists (no profile)
      return data
        .map((m) => ({ ...m, profile: profileMap.get(m.user_id) || null }))
        .filter((m) => m.profile !== null);
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "create_user",
          email: newEmail,
          password: newPassword,
          full_name: newFullName,
          org_id: org.id,
          role: newRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_users", org.id] });
      toast.success("User created and added to organization!");
      setCreateUserOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setNewRole("member");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create user"),
  });

  const sendPasswordReset = useMutation({
    mutationFn: async ({ email, new_password }: { email: string; new_password: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "reset_password", email, new_password },
      });
      const errMsg = data?.error || (error as any)?.message;
      if (errMsg) throw new Error(errMsg);
      return data;
    },
    onSuccess: () => toast.success("Password updated successfully!"),
    onError: (err: any) => toast.error(err.message || "Failed to update password"),
  });

  const removeMember = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("org_users").delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_users", org.id] });
      toast.success("User removed");
    },
    onError: (err: any) => toast.error(err.message || "Failed to remove user"),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from("org_users").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_users", org.id] });
      toast.success("Role updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update role"),
  });

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-1">{org.name}</h2>
      <p className="text-sm text-muted-foreground mb-6">{org.timezone}</p>

      {/* API Keys & Plugin - scoped to THIS client org */}
      <ClientApiKeys orgId={org.id} />

      {/* Dashboard URL card */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">ACTV TRKR Dashboard URL</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Share this link with client users so they can log in and view their dashboard.
        </p>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
          <code className="text-xs font-mono text-secondary-foreground flex-1 break-all">{dashboardUrl}</code>
          <button onClick={copyDashboardUrl} className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors">
            {urlCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-secondary-foreground/60" />}
          </button>
        </div>
      </div>

      {/* Invite Codes */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Invite Link</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={generateInvite.isPending}
            onClick={() => generateInvite.mutate()}
          >
            <Ticket className="h-3.5 w-3.5" />
            {generateInvite.isPending ? "Generating…" : "Generate Invite"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Generate an invite link to send to clients. They'll sign up and automatically join this organization.
        </p>
        {inviteCodes && inviteCodes.length > 0 && (
          <div className="space-y-2">
            {inviteCodes.map((ic: any) => (
              <div key={ic.id} className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <code className="text-xs font-mono text-secondary-foreground flex-1">
                  {window.location.origin}/auth?invite={ic.code}
                </code>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {ic.use_count} used
                </span>
                <button
                  onClick={() => copyInviteLink(ic.code)}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors"
                  title="Copy invite link"
                >
                  <Copy className="h-3.5 w-3.5 text-secondary-foreground/60" />
                </button>
                <button
                  onClick={() => deactivateInvite.mutate(ic.id)}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-destructive/10 transition-colors"
                  title="Deactivate"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Members */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Members
          </h3>
          <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create User for {org.name}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
                  <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                  <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="client@example.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Temporary Password</label>
                  <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Role</label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={!newEmail.trim() || !newPassword.trim() || newPassword.length < 6 || createUser.isPending}
                  onClick={() => createUser.mutate()}
                >
                  {createUser.isPending ? "Creating…" : "Create User"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  The user will be created with a confirmed email. Share the dashboard URL and temporary password, then send a password reset.
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading members…</div>
        ) : !members || members.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No members.</div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {m.profile?.full_name || m.profile?.email || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.profile?.email || m.user_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={sendPasswordReset.isPending}
                    onClick={() => {
                      const email = m.profile?.email;
                      if (!email) { toast.error("No email found for this user"); return; }
                      const newPw = window.prompt(`Set new password for ${email} (min 6 chars):`);
                      if (!newPw || newPw.length < 6) {
                        if (newPw !== null) toast.error("Password must be at least 6 characters");
                        return;
                      }
                      sendPasswordReset.mutate({ email, new_password: newPw });
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Reset Password
                  </Button>
                  <Select value={m.role} onValueChange={(role) => updateRole.mutate({ id: m.id, role })}>
                    <SelectTrigger className="w-[110px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeMember.mutate(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
