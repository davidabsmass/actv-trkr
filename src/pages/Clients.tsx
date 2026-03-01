import { useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, UserPlus, Users, Mail, Trash2, ChevronRight, ArrowLeft, Copy, Check, Link, KeyRound,
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

export default function Clients() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { orgs } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgTimezone, setNewOrgTimezone] = useState("America/New_York");
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  if (roleLoading) return <div className="p-12 text-center text-muted-foreground text-sm">Loading…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return selectedOrg ? (
    <OrgDetail org={selectedOrg} onBack={() => setSelectedOrgId(null)} />
  ) : (
    <OrgList
      orgs={orgs}
      onSelect={setSelectedOrgId}
      createOrgOpen={createOrgOpen}
      setCreateOrgOpen={setCreateOrgOpen}
      newOrgName={newOrgName}
      setNewOrgName={setNewOrgName}
      newOrgTimezone={newOrgTimezone}
      setNewOrgTimezone={setNewOrgTimezone}
      userId={user?.id}
    />
  );
}

function OrgList({
  orgs, onSelect, createOrgOpen, setCreateOrgOpen,
  newOrgName, setNewOrgName, newOrgTimezone, setNewOrgTimezone, userId,
}: any) {
  const queryClient = useQueryClient();

  const createOrg = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const { data: org, error: orgErr } = await supabase
        .from("orgs").insert({ name: newOrgName, timezone: newOrgTimezone }).select().single();
      if (orgErr) throw orgErr;
      const { error: ouErr } = await supabase
        .from("org_users").insert({ org_id: org.id, user_id: userId, role: "admin" });
      if (ouErr) throw ouErr;
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      toast.success("Client organization created");
      setCreateOrgOpen(false);
      setNewOrgName("");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create org"),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Clients</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage client organizations and users</p>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Organizations
          </h3>
          <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Add Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Client Organization</DialogTitle></DialogHeader>
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
            </DialogContent>
          </Dialog>
        </div>

        {orgs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No organizations yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {orgs.map((org: any) => (
              <button
                key={org.id}
                onClick={() => onSelect(org.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.timezone}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgDetail({ org, onBack }: { org: any; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [urlCopied, setUrlCopied] = useState(false);

  const dashboardUrl = `${window.location.origin}/auth`;

  const copyDashboardUrl = () => {
    navigator.clipboard.writeText(dashboardUrl);
    setUrlCopied(true);
    toast.success("Dashboard URL copied!");
    setTimeout(() => setUrlCopied(false), 2000);
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
      return data.map((m) => ({ ...m, profile: profileMap.get(m.user_id) || null }));
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
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "reset_password", email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => toast.success("Password reset email sent!"),
    onError: (err: any) => toast.error(err.message || "Failed to send reset email"),
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
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Clients
      </button>

      <h1 className="text-2xl font-bold text-foreground mb-1">{org.name}</h1>
      <p className="text-sm text-muted-foreground mb-6">{org.timezone}</p>

      {/* Dashboard URL card */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Client Dashboard URL</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Share this link with client users so they can log in and view their dashboard.
        </p>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
          <code className="text-xs font-mono text-foreground flex-1 break-all">{dashboardUrl}</code>
          <button onClick={copyDashboardUrl} className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors">
            {urlCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
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
                      if (email) sendPasswordReset.mutate(email);
                      else toast.error("No email found for this user");
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
