import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useOrgRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Trash2, Loader2, ShieldAlert, History, Crown, Mail, RotateCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Role = "admin" | "manager";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
};

const ROLE_HELP: Record<Role, string> = {
  admin: "Full access: manage team, billing, sites, and settings.",
  manager: "Operational access. Cannot manage team, billing, or destructive settings.",
};

export default function TeamSection() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { isOrgAdmin, loading: roleLoading } = useOrgRole(orgId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("manager");
  const [showAudit, setShowAudit] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["org_members", orgId],
    enabled: !!orgId && isOrgAdmin,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("org_users")
        .select("id, user_id, role, is_owner, status, created_at, invited_by, invited_at, invite_accepted_at")
        .eq("org_id", orgId);
      if (error) throw error;

      const userIds = data.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || []);

      return data.map((m: any) => ({
        ...m,
        email: profileMap.get(m.user_id)?.email || "—",
        full_name: profileMap.get(m.user_id)?.full_name || "",
      }));
    },
  });

  const pendingInvites = members.filter((m: any) => m.status === "invited");
  const activeMembers = members.filter((m: any) => m.status !== "invited");
  const adminCount = activeMembers.filter((m: any) => m.role === "admin").length;

  const { data: auditLog = [] } = useQuery({
    queryKey: ["team_audit_log", orgId],
    enabled: !!orgId && isOrgAdmin && showAudit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_audit_log")
        .select("id, action, previous_role, new_role, created_at, actor_user_id, target_user_id, metadata")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("add-org-member", {
        body: { email: email.trim(), orgId, role: inviteRole },
      });
      if (error) {
        const body = error?.context?.body
          ? await new Response(error.context.body).json().catch(() => null)
          : null;
        throw new Error(body?.error || error.message);
      }
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["org_members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["team_audit_log", orgId] });
      toast({ title: "Invite sent", description: data.message });
      setEmail("");
      setInviteRole("manager");
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ targetUserId, newRole }: { targetUserId: string; newRole: Role }) => {
      const { data, error } = await supabase.functions.invoke("manage-org-member", {
        body: { action: "change_role", orgId, targetUserId, newRole },
      });
      if (error) {
        const body = error?.context?.body
          ? await new Response(error.context.body).json().catch(() => null)
          : null;
        throw new Error(body?.error || error.message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["team_audit_log", orgId] });
      toast({ title: "Role updated" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-org-member", {
        body: { action: "remove", orgId, targetUserId },
      });
      if (error) {
        const body = error?.context?.body
          ? await new Response(error.context.body).json().catch(() => null)
          : null;
        throw new Error(body?.error || error.message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["team_audit_log", orgId] });
      toast({ title: "Member removed" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const inviteAction = useMutation({
    mutationFn: async ({ action, targetUserId }: { action: "resend" | "cancel"; targetUserId: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-org-invite", {
        body: { action, orgId, targetUserId },
      });
      if (error) {
        const body = error?.context?.body
          ? await new Response(error.context.body).json().catch(() => null)
          : null;
        throw new Error(body?.error || error.message);
      }
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["org_members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["team_audit_log", orgId] });
      toast({ title: data?.message || "Done" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    addMember.mutate();
  };

  // Non-admins see a 403-style message and nothing else.
  if (!roleLoading && !isOrgAdmin) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" /> Team Members
          </CardTitle>
          <CardDescription>
            Team management is only available to organization admins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You don't have permission to view or manage team members. Contact your organization
            admin if you need to invite or remove a teammate.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> Team Members
              </CardTitle>
              <CardDescription>
                Invite teammates and manage their access. New invites default to <strong>Manager</strong>.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAudit((s) => !s)}
              className="gap-1.5 text-xs"
            >
              <History className="h-3 w-3" /> {showAudit ? "Hide" : "Audit log"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invite form */}
          <form onSubmit={handleAdd} className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label className="text-xs">Email address</Label>
              <Input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={addMember.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={addMember.isPending || !email.trim()} className="gap-1.5">
              {addMember.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
              Invite
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground">{ROLE_HELP[inviteRole]}</p>

          {/* Pending invitations */}
          {pendingInvites.length > 0 && (
            <div className="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs font-medium text-amber-200/90 uppercase tracking-wide flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Pending invitations ({pendingInvites.length})
              </p>
              <div className="divide-y divide-border/30">
                {pendingInvites.map((m: any) => {
                  const invitedAt = m.invited_at ? new Date(m.invited_at) : null;
                  const ageMs = invitedAt ? Date.now() - invitedAt.getTime() : 0;
                  const ageLabel = !invitedAt
                    ? "—"
                    : ageMs < 60_000
                    ? "just now"
                    : ageMs < 3_600_000
                    ? `${Math.floor(ageMs / 60_000)}m ago`
                    : ageMs < 86_400_000
                    ? `${Math.floor(ageMs / 3_600_000)}h ago`
                    : `${Math.floor(ageMs / 86_400_000)}d ago`;
                  const busy =
                    inviteAction.isPending && inviteAction.variables?.targetUserId === m.user_id;
                  return (
                    <div key={m.id} className="flex items-center justify-between py-2 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{m.email}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Invited {ageLabel} · {ROLE_LABEL[m.role as Role] || m.role}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          disabled={busy}
                          onClick={() =>
                            inviteAction.mutate({ action: "resend", targetUserId: m.user_id })
                          }
                        >
                          {busy && inviteAction.variables?.action === "resend" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCw className="h-3 w-3" />
                          )}
                          Resend
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                              disabled={busy}
                            >
                              <X className="h-3 w-3" /> Cancel
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The invitation for {m.email} will be revoked. Their pending sign-in
                                link will no longer add them to this organization.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep invite</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  inviteAction.mutate({ action: "cancel", targetUserId: m.user_id })
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Cancel invite
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Members list */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : activeMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members yet.</p>
          ) : (
            <div className="divide-y">
              {activeMembers.map((m: any) => {
                const isSelf = m.user_id === user?.id;
                const isOwner = !!m.is_owner;
                const isLastAdmin = m.role === "admin" && adminCount <= 1;
                const lockedReason = isOwner
                  ? "The organization owner cannot be removed or demoted."
                  : isLastAdmin
                  ? "Cannot remove or demote the last admin."
                  : null;

                return (
                  <div key={m.id} className="flex items-center justify-between py-2.5 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                          {m.full_name || m.email}
                          {isOwner && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Crown className="h-3 w-3 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>Organization owner</TooltipContent>
                            </Tooltip>
                          )}
                          {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                        </p>
                        {m.full_name && (
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isOwner ? (
                        <Badge variant="default" className="text-[10px]">Owner</Badge>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Select
                                value={m.role}
                                onValueChange={(v) =>
                                  changeRole.mutate({ targetUserId: m.user_id, newRole: v as Role })
                                }
                                disabled={changeRole.isPending || isLastAdmin}
                              >
                                <SelectTrigger className="h-7 w-[110px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </TooltipTrigger>
                          {isLastAdmin && (
                            <TooltipContent>Cannot demote the last admin</TooltipContent>
                          )}
                        </Tooltip>
                      )}

                      {lockedReason ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground/50"
                                disabled
                                aria-label="Cannot remove"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{lockedReason}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={removeMember.isPending}
                              aria-label={`Remove ${m.email || "team member"}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {m.full_name || m.email} will lose access to this organization
                                immediately. This cannot be undone from here.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMember.mutate(m.user_id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            New users will receive an account. They should use "Forgot Password" on the login screen to set their password.
          </p>

          {/* Audit log */}
          {showAudit && (
            <div className="border-t pt-3 mt-2 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recent team activity
              </p>
              {auditLog.length === 0 ? (
                <p className="text-xs text-muted-foreground">No team changes recorded yet.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {auditLog.map((e: any) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>
                        <span className="font-medium text-foreground">{e.action.replace(/_/g, " ")}</span>
                        {e.previous_role && e.new_role && (
                          <span> · {e.previous_role} → {e.new_role}</span>
                        )}
                        {!e.previous_role && e.new_role && <span> · {e.new_role}</span>}
                      </span>
                      <span>{new Date(e.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
