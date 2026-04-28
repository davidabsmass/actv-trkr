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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export default function Clients() {
  const { t } = useTranslation();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { orgs } = useOrg();
  const { user } = useAuth();

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgTimezone, setNewOrgTimezone] = useState("America/New_York");
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  if (roleLoading) return <div className="p-12 text-center text-muted-foreground text-sm">…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">{t("clients.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("clients.subtitle")}</p>

      <div className="flex items-center gap-3 mb-6">
        <Select value={selectedOrgId ?? ""} onValueChange={(v) => setSelectedOrgId(v)}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder={t("clients.selectClient")} />
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
          <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 flex-shrink-0")}>
            <Building2 className="h-3.5 w-3.5" /> {t("clients.addClient")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("clients.newClientOrg")}</DialogTitle></DialogHeader>
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
            {orgs.length === 0 ? t("clients.noOrgsYet") : t("clients.selectClientAbove")}
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const createOrg = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const orgId = crypto.randomUUID();
      const { error: orgErr } = await supabase.rpc("create_org_with_admin", {
        p_org_id: orgId,
        p_name: newOrgName,
        p_timezone: newOrgTimezone,
        p_allow_existing: false,
      });
      if (orgErr) throw orgErr;
      return { id: orgId, name: newOrgName };
    },
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      toast.success(t("clients.orgCreated"));
      onCreated(org.id);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create org"),
  });

  return (
    <div className="space-y-4 pt-2">
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">{t("clients.orgName")}</label>
        <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder={t("clients.clientName")} />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">{t("clients.timezone")}</label>
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
        {createOrg.isPending ? t("clients.creating") : t("clients.createOrg")}
      </Button>
    </div>
  );
}

function OrgDetail({ org }: { org: any }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [urlCopied, setUrlCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const isPreviewEnvironment = window.location.hostname.includes("preview--");
  const dashboardUrl = `${window.location.origin}/auth`;

  const copyDashboardUrl = () => {
    navigator.clipboard.writeText(dashboardUrl);
    setUrlCopied(true);
    toast.success(t("clients.urlCopied"));
    setTimeout(() => setUrlCopied(false), 2000);
  };

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
      toast.success(t("clients.inviteGenerated"));
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
      toast.success(t("clients.inviteDeactivated"));
    },
    onError: (err: any) => toast.error(err.message || "Failed to deactivate"),
  });

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/auth?invite=${code}`;
    navigator.clipboard.writeText(url);
    setInviteCopied(true);
    toast.success(t("clients.inviteCopied"));
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
          <p className="text-xs text-foreground">
            {t("clients.previewWarning")}
          </p>
        </div>
      )}

      <MembersSection org={org} />

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("clients.dashboardUrl")}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {t("clients.dashboardUrlDesc")}
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState("manager");

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
      toast.success(t("clients.userCreated"));
      setCreateUserOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setNewRole("manager");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create user"),
  });

  const sendPasswordReset = useMutation({
    mutationFn: async ({ email, new_password }: { email: string; new_password: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "reset_password", email, new_password, org_id: org.id },
      });
      const errMsg = data?.error || (error as any)?.message;
      if (errMsg) throw new Error(errMsg);
      return data;
    },
    onSuccess: () => toast.success(t("clients.passwordUpdated")),
    onError: (err: any) => toast.error(err.message || "Failed to update password"),
  });

  const removeMember = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("org_users").delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_users", org.id] });
      toast.success(t("clients.userRemoved"));
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
      toast.success(t("clients.roleUpdated"));
    },
    onError: (err: any) => toast.error(err.message || "Failed to update role"),
  });

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> {t("clients.members")}
        </h3>
        <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
          <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <UserPlus className="h-3.5 w-3.5" /> {t("clients.createUser")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("clients.createUserFor", { name: org.name })}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t("clients.fullName")}</label>
                <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t("clients.email")}</label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="client@example.com" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t("clients.tempPassword")}</label>
                <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("clients.minChars")} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t("clients.role")}</label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("clients.adminRole")}</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!newEmail.trim() || !newPassword.trim() || newPassword.length < 6 || createUser.isPending}
                onClick={() => createUser.mutate()}
              >
                {createUser.isPending ? t("clients.creatingUser") : t("clients.createUserBtn")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("clients.createUserNote")}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">{t("clients.loadingMembers")}</div>
      ) : !members || members.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">{t("clients.noMembers")}</div>
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
                    if (!email) { toast.error(t("clients.noEmailFound")); return; }
                    const newPw = window.prompt(t("clients.setNewPassword", { email }));
                    if (!newPw || newPw.length < 6) {
                      if (newPw !== null) toast.error(t("clients.passwordMinError"));
                      return;
                    }
                    sendPasswordReset.mutate({ email, new_password: newPw });
                  }}
                >
                  <KeyRound className="h-3.5 w-3.5" /> {t("clients.resetPassword")}
                </Button>
                <Select value={m.role} onValueChange={(role) => updateRole.mutate({ id: m.id, role })}>
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("clients.adminRole")}</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeMember.mutate(m.id)}
                  aria-label={t("clients.removeMember", "Remove member")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UserActivitySection orgId={org.id} />
    </div>
  );
}

function UserActivitySection({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [activityTab, setActivityTab] = useState<"activity" | "logins">("activity");

  const { data: loginEvents, isLoading: loginsLoading } = useQuery({
    queryKey: ["login-events", orgId],
    queryFn: async () => {
      const allRows: Array<{
        id: string; user_id: string; email: string | null; full_name: string | null;
        org_id: string | null; ip_address: string | null; user_agent: string | null; logged_in_at: string;
      }> = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await (supabase as any)
          .from("login_events").select("*").eq("org_id", orgId)
          .order("logged_in_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) { allRows.push(...data); from += PAGE_SIZE; hasMore = data.length === PAGE_SIZE; }
        else { hasMore = false; }
      }
      return allRows;
    },
  });

  const { data: totalCount } = useQuery({
    queryKey: ["login-events-count", orgId],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("login_events").select("*", { count: "exact", head: true }).eq("org_id", orgId);
      if (error) throw error;
      return count as number;
    },
  });

  // Full activity log
  const { data: activityLog, isLoading: activityLoading } = useQuery({
    queryKey: ["user-activity-log", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_activity_log")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Array<{
        id: string; user_id: string; org_id: string; activity_type: string;
        page_path: string | null; page_title: string | null; details: any; created_at: string;
      }>;
    },
  });

  // Get profiles for activity log user names
  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles-for-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  const profileMap = (profiles || []).reduce((acc, p) => {
    acc[p.user_id] = p;
    return acc;
  }, {} as Record<string, { full_name: string | null; email: string | null }>);

  const userStats = (loginEvents || []).reduce((acc, ev) => {
    const key = ev.user_id;
    if (!acc[key]) {
      acc[key] = { user_id: ev.user_id, email: ev.email, full_name: ev.full_name, total_logins: 0, last_login: ev.logged_in_at, first_login: ev.logged_in_at };
    }
    acc[key].total_logins++;
    if (ev.logged_in_at > acc[key].last_login) acc[key].last_login = ev.logged_in_at;
    if (ev.logged_in_at < acc[key].first_login) acc[key].first_login = ev.logged_in_at;
    return acc;
  }, {} as Record<string, { user_id: string; email: string | null; full_name: string | null; total_logins: number; last_login: string; first_login: string }>);

  const sortedUsers = Object.values(userStats).sort((a, b) =>
    new Date(b.last_login).getTime() - new Date(a.last_login).getTime()
  );

  // Activity stats
  const activityStats = (activityLog || []).reduce((acc, ev) => {
    const key = ev.user_id;
    if (!acc[key]) acc[key] = { pages: new Set<string>(), actions: 0 };
    acc[key].actions++;
    if (ev.page_path) acc[key].pages.add(ev.page_path);
    return acc;
  }, {} as Record<string, { pages: Set<string>; actions: number }>);

  const activityTypeIcons: Record<string, string> = {
    page_view: "📄",
    feature_click: "🖱️",
    export: "📥",
    report_run: "📊",
  };

  return (
    <div className="mt-10 border-t border-border pt-8">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{t("clients.userActivity")}</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActivityTab("activity")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activityTab === "activity"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t("clients.activityLog", "Activity Log")}
        </button>
        <button
          onClick={() => setActivityTab("logins")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activityTab === "logins"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t("clients.loginHistory", "Login History")}
          <span className="ml-1.5 text-xs text-muted-foreground">({totalCount ?? loginEvents?.length ?? 0})</span>
        </button>
      </div>

      {activityTab === "activity" && (
        <>
          {/* Activity stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{t("clients.totalActions", "Total Actions")}</p>
              <p className="text-2xl font-bold text-foreground">{activityLog?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{t("clients.activeUsers", "Active Users")}</p>
              <p className="text-2xl font-bold text-foreground">{Object.keys(activityStats).length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{t("clients.lastAction", "Last Action")}</p>
              <p className="text-sm font-medium text-foreground">
                {activityLog?.[0] ? formatDistanceToNow(new Date(activityLog[0].created_at), { addSuffix: true }) : "—"}
              </p>
            </div>
          </div>

          {activityLoading ? (
            <p className="text-sm text-muted-foreground">{t("clients.loadingActivity")}</p>
          ) : !activityLog || activityLog.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("clients.noActivityYet", "No activity recorded yet. Activity will appear as users navigate the dashboard.")}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.time")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.user")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.actionType", "Action")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.pageFeature", "Page / Feature")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLog.map((ev) => {
                      const profile = profileMap[ev.user_id];
                      return (
                        <tr key={ev.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                            {format(new Date(ev.created_at), "MMM d, HH:mm:ss")}
                          </td>
                          <td className="px-4 py-2.5">
                            <div>
                              <p className="text-sm font-medium text-foreground">{profile?.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{profile?.email || ev.user_id.slice(0, 8)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-muted text-foreground">
                              {activityTypeIcons[ev.activity_type] || "📌"} {ev.activity_type.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-foreground">
                            {ev.page_title || ev.page_path || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activityTab === "logins" && (
        <>
          {loginsLoading ? (
            <p className="text-sm text-muted-foreground">{t("clients.loadingActivity")}</p>
          ) : sortedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clients.noLoginEvents")}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground mb-1">{t("clients.totalUsers")}</p>
                  <p className="text-2xl font-bold text-foreground">{sortedUsers.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground mb-1">{t("clients.totalLogins")}</p>
                  <p className="text-2xl font-bold text-foreground">{totalCount ?? loginEvents?.length ?? 0}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground mb-1">{t("clients.lastActivity")}</p>
                  <p className="text-sm font-medium text-foreground">
                    {sortedUsers[0] ? formatDistanceToNow(new Date(sortedUsers[0].last_login), { addSuffix: true }) : "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.user")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.email")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("clients.logins")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.lastLogin")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("clients.firstSeen")}</th>
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

              <details className="mt-4">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  {t("clients.viewRawLog", { count: loginEvents?.length ?? 0 })}
                </summary>
                <div className="mt-2 rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
                      <tr className="border-b border-border">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("clients.time")}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("clients.user")}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("clients.email")}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("clients.ip")}</th>
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
        </>
      )}
    </div>
  );
}