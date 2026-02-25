import { useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Building2, UserPlus, Users, Mail, Trash2, Shield, ChevronRight, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  // Admin guard
  if (roleLoading) return <div className="p-12 text-center text-muted-foreground text-sm">Loading…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return selectedOrg ? (
    <OrgDetail
      org={selectedOrg}
      onBack={() => setSelectedOrgId(null)}
      inviteOpen={inviteOpen}
      setInviteOpen={setInviteOpen}
      inviteEmail={inviteEmail}
      setInviteEmail={setInviteEmail}
    />
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
      // Create org
      const { data: org, error: orgErr } = await supabase
        .from("orgs").insert({ name: newOrgName, timezone: newOrgTimezone }).select().single();
      if (orgErr) throw orgErr;
      // Add self as admin
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

function OrgDetail({ org, onBack, inviteOpen, setInviteOpen, inviteEmail, setInviteEmail }: any) {
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ["org_users", org.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_users").select("id, user_id, role, created_at")
        .eq("org_id", org.id).order("created_at");
      if (error) throw error;

      // Fetch profile info for each member
      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, email, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      return data.map((m) => ({ ...m, profile: profileMap.get(m.user_id) || null }));
    },
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      // For now, we create the user via edge function or just show instructions
      // In V1 we'll create the org_users entry — the user must already have an account
      // Search for user by email in profiles
      const { data: profile, error } = await supabase
        .from("profiles").select("user_id").eq("email", inviteEmail).maybeSingle();
      if (error) throw error;
      if (!profile) throw new Error("No user found with that email. They need to sign up first.");

      // Check if already a member
      const { data: existing } = await supabase
        .from("org_users").select("id")
        .eq("org_id", org.id).eq("user_id", profile.user_id).maybeSingle();
      if (existing) throw new Error("User is already a member of this org.");

      const { error: insertErr } = await supabase
        .from("org_users").insert({ org_id: org.id, user_id: profile.user_id, role: "member" });
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_users", org.id] });
      toast.success("Client user added");
      setInviteOpen(false);
      setInviteEmail("");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add user"),
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Members
          </h3>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add User to {org.name}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  Enter the email of a user who has already signed up. They'll be added as a member of this organization.
                </p>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="client@example.com" />
                </div>
                <Button className="w-full" disabled={!inviteEmail.trim() || inviteUser.isPending} onClick={() => inviteUser.mutate()}>
                  {inviteUser.isPending ? "Adding…" : "Add User"}
                </Button>
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
