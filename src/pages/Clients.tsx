import { useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, UserPlus, Users, Mail, Trash2, Copy, Check, Link, KeyRound, Ticket, Activity,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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
      <h1 className="text-2xl font-bold text-foreground mb-1">Users</h1>
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

function OrgDetail({ org }: { org: any }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [urlCopied, setUrlCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const isPreviewEnvironment = window.location.hostname.includes("preview--");
  const dashboardUrl = `${window.location.origin}/auth`;

  const copyDashboardUrl = () => {
    navigator.clipboard.writeText(dashboardUrl);
    setUrlCopied(true);
    toast.success("Dashboard URL copied!");
    setTimeout(() => setUrlCopied(false), 2000);
  };

  // Invite codes
  const { data: inviteCodes } = useQuery({
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
      const inviteUrl = `${window.location.origin}/auth?invite=${code}`;
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
    const url = `${window.location.origin}/auth?invite=${code}`;
    navigator.clipboard.writeText(url);
    setInviteCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">{org.name}</h2>
        <p className="text-sm text-muted-foreground">{org.timezone}</p>
      </div>

      {isPreviewEnvironment && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-xs text-warning-foreground">
            You’re in Preview. Users and passwords created here only work in this Preview environment.
          </p>
        </div>
      )}

      {/* Members - at top */}
      <MembersSection org={org} />

      {/* Dashboard URL card */}
      <div className="rounded-lg border border-border bg-card p-4">
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

    </div>
  );
}
function MembersSection({ org }: { org: any }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState("member");

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
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          full_name: newFullName.trim(),
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

      {/* User Activity / Login History */}
      <UserActivitySection orgId={org.id} />
    </div>
  );
}

function UserActivitySection() {
  const { data: loginEvents, isLoading } = useQuery({
    queryKey: ["login-events"],
    queryFn: async () => {
      // Fetch all login events using pagination to avoid the 1000-row limit
      const allRows: Array<{
        id: string;
        user_id: string;
        email: string | null;
        full_name: string | null;
        org_id: string | null;
        ip_address: string | null;
        user_agent: string | null;
        logged_in_at: string;
      }> = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await (supabase as any)
          .from("login_events")
          .select("*")
          .order("logged_in_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allRows.push(...data);
          from += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      return allRows as Array<{
        id: string;
        user_id: string;
        email: string | null;
        full_name: string | null;
        org_id: string | null;
        ip_address: string | null;
        user_agent: string | null;
        logged_in_at: string;
      }>;
    },
  });

  // Get the true total count separately
  const { data: totalCount } = useQuery({
    queryKey: ["login-events-count"],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("login_events")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count as number;
    },
  });

  // Aggregate stats per user
  const userStats = (loginEvents || []).reduce((acc, ev) => {
    const key = ev.user_id;
    if (!acc[key]) {
      acc[key] = {
        user_id: ev.user_id,
        email: ev.email,
        full_name: ev.full_name,
        total_logins: 0,
        last_login: ev.logged_in_at,
        first_login: ev.logged_in_at,
      };
    }
    acc[key].total_logins++;
    if (ev.logged_in_at > acc[key].last_login) acc[key].last_login = ev.logged_in_at;
    if (ev.logged_in_at < acc[key].first_login) acc[key].first_login = ev.logged_in_at;
    return acc;
  }, {} as Record<string, { user_id: string; email: string | null; full_name: string | null; total_logins: number; last_login: string; first_login: string }>);

  const sortedUsers = Object.values(userStats).sort((a, b) =>
    new Date(b.last_login).getTime() - new Date(a.last_login).getTime()
  );

  return (
    <div className="mt-10 border-t border-border pt-8">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">User Activity</h2>
        <span className="text-xs text-muted-foreground ml-2">
          {totalCount ?? loginEvents?.length ?? 0} login events tracked
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : sortedUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No login events recorded yet. Activity will appear here once users log in.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Users</p>
              <p className="text-2xl font-bold text-foreground">{sortedUsers.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Logins</p>
              <p className="text-2xl font-bold text-foreground">{totalCount ?? loginEvents?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Last Activity</p>
              <p className="text-sm font-medium text-foreground">
                {sortedUsers[0] ? formatDistanceToNow(new Date(sortedUsers[0].last_login), { addSuffix: true }) : "—"}
              </p>
            </div>
          </div>

          {/* User table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Logins</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last Login</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">First Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u) => (
                    <tr key={u.user_id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{u.full_name || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{u.email || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">{u.total_logins}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDistanceToNow(new Date(u.last_login), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {format(new Date(u.first_login), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent login log */}
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              View raw login log ({loginEvents?.length} events)
            </summary>
            <div className="mt-2 rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {(loginEvents || []).map((ev) => (
                    <tr key={ev.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {format(new Date(ev.logged_in_at), "MMM d, HH:mm")}
                      </td>
                      <td className="px-3 py-1.5 text-foreground">{ev.full_name || "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{ev.email || "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground font-mono">{ev.ip_address || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
