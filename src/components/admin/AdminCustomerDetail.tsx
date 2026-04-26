import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { useSupportAccessAudit } from "@/hooks/use-support-access-audit";
import { Shield } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ExternalLink,
  KeyRound,
  LogOut,
  Loader2,
  Trash2,
  Globe,
  AlertCircle,
  ChevronDown,
  Mail,
  ShieldAlert,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { RetentionPanel } from "@/components/admin/RetentionPanel";
import { MaskedId } from "@/components/admin/MaskedId";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  email: string | null;
  subscriberId?: string | null;
}

const NOTE_TAGS = ["billing", "onboarding", "tracking", "imports", "support"] as const;

export function AdminCustomerDetail({ open, onOpenChange, email, subscriberId }: Props) {
  const qc = useQueryClient();
  const [noteBody, setNoteBody] = useState("");
  const [noteTag, setNoteTag] = useState<string>("support");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin_customer_detail", email, subscriberId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-customer-detail", {
        body: { email, subscriber_id: subscriberId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    enabled: open && !!(email || subscriberId),
  });

  const subscriber = data?.subscriber;
  const profile = data?.profile;
  const auth = data?.auth;
  const orgs: any[] = data?.orgs ?? [];
  const primaryOrgId: string | null = orgs[0]?.org_id ?? null;

  // Consent-aware audit logging — every meaningful admin action below calls
  // logAction() so the customer can see what was done during their grant.
  const { hasActiveGrant, activeGrant, logAction } = useSupportAccessAudit(primaryOrgId);

  // Log that an admin opened this customer's profile while a grant is active.
  useEffect(() => {
    if (open && hasActiveGrant && primaryOrgId) {
      logAction("customer_detail_viewed", {
        resourceType: "customer",
        resourceId: primaryOrgId,
        metadata: { email },
      });
    }
    // We intentionally key only on open + grant + org so we don't double-log
    // on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasActiveGrant, primaryOrgId]);
  const sites: any[] = data?.sites ?? [];
  const importJobs: any[] = data?.import_jobs ?? [];
  const recentAlerts: any[] = data?.recent_alerts ?? [];
  const consentConfigs: any[] = data?.consent_configs ?? [];
  const teamMembers: any[] = data?.team_members ?? [];
  const notes: any[] = data?.notes ?? [];
  const stripe = data?.stripe;

  const primarySite = sites[0];
  const consentByOrg = (orgId: string) =>
    consentConfigs.find((c) => c.org_id === orgId)?.consent_mode || "strict";

  // ── Action handlers ─────────────────────────────────────────────────
  const callAction = async (actionKey: string, body: any, successMsg: string) => {
    setActionLoading(actionKey);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(successMsg);
      refetch();
    } catch (e: any) {
      toast.error(e.message || `Failed: ${actionKey}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = () => {
    if (!email) return;
    logAction("password_reset_sent", { resourceType: "auth", metadata: { email } });
    callAction("reset", { action: "send_password_reset", email }, `Password reset sent to ${email}`);
  };

  const handleSendLoginLink = () => {
    if (!email) return;
    logAction("login_link_sent", { resourceType: "auth", metadata: { email } });
    callAction("login", { action: "send_password_reset", email }, `Login link sent to ${email}`);
  };

  const handleForceLogout = () => {
    if (!email || !confirm(`Force logout ${email} from all sessions?`)) return;
    logAction("force_logout", { resourceType: "auth", metadata: { email } });
    callAction("logout", { action: "force_logout", email }, "All sessions revoked");
  };

  const addNote = useMutation({
    mutationFn: async () => {
      const orgId = orgs[0]?.org_id ?? null;
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "add_note",
          body: noteBody.trim(),
          org_id: orgId,
          subscriber_id: subscriber?.id ?? null,
          subscriber_email: email,
          category: noteTag,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      setNoteBody("");
      toast.success("Note saved");
      refetch();
    },
    onError: (e: any) => toast.error(e.message || "Failed to add note"),
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "delete_note", note_id: noteId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success("Note removed");
      refetch();
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete note"),
  });

  // ── Status helpers ──────────────────────────────────────────────────
  const subStatus = stripe?.subscription?.status || subscriber?.status || "—";
  const subStatusVariant: any =
    subStatus === "active" || subStatus === "trialing"
      ? "default"
      : subStatus === "past_due" || subStatus === "canceled"
      ? "destructive"
      : "secondary";

  const trackingStatus =
    sites.length === 0
      ? "no-sites"
      : sites.every((s) => s.status === "UP")
      ? "active"
      : sites.some((s) => s.status === "DOWN")
      ? "error"
      : "degraded";
  const trackingVariant: any =
    trackingStatus === "active" ? "default" : trackingStatus === "error" ? "destructive" : "secondary";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-6xl overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-24 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading customer details…
          </div>
        ) : (
          <>
            {/* ── STICKY HEADER ───────────────────────────────────── */}
            <SheetHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4 space-y-3">
              {hasActiveGrant && activeGrant && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
                  <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Customer has granted support access
                  </span>
                  <span className="text-muted-foreground">
                    · Your actions are being logged · Expires{" "}
                    {format(new Date(activeGrant.expires_at), "MMM d 'at' h:mm a")}
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <SheetTitle className="text-xl truncate">
                    {orgs[0]?.name || profile?.full_name || email || "Customer"}
                  </SheetTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="font-mono truncate">{email}</span>
                    {primarySite?.domain && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {primarySite.domain}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant={subStatusVariant} className="text-[10px]">
                      {subStatus}
                    </Badge>
                    <Badge
                      variant={subscriber?.pricing_type === "founding" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {subscriber?.pricing_type || "standard"}
                    </Badge>
                    <Badge variant={trackingVariant} className="text-[10px]">
                      tracking: {trackingStatus}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSendLoginLink}
                    disabled={actionLoading === "login"}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1" />
                    {actionLoading === "login" ? "Sending…" : "Send Login Link"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetPassword}
                    disabled={actionLoading === "reset"}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" />
                    {actionLoading === "reset" ? "Sending…" : "Password Reset"}
                  </Button>
                  {stripe?.customer_url && (
                    <Button asChild size="sm">
                      <a href={stripe.customer_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open in Stripe
                      </a>
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">
                        More <ChevronDown className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-popover">
                      <DropdownMenuItem
                        onClick={handleForceLogout}
                        disabled={actionLoading === "logout"}
                      >
                        <LogOut className="h-3.5 w-3.5 mr-2" /> Force logout sessions
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled className="text-muted-foreground">
                        Pause tracking (use site controls)
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-muted-foreground">
                        Pause imports (use Forms page)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled className="text-destructive opacity-60">
                        Disable account (Stripe-managed)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </SheetHeader>

            {/* ── 2-COLUMN BODY ───────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 p-6">
              {/* LEFT COLUMN (~70%) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Card 1: Account */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Account Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <Row label="Name" value={profile?.full_name || "—"} />
                    <Row label="Email" value={email || "—"} mono />
                    <Row label="Organization" value={orgs[0]?.name || "—"} />
                    <Row label="Pricing tier" value={subscriber?.pricing_type || "standard"} />
                    <Row
                      label="Signup"
                      value={
                        subscriber?.created_at
                          ? format(new Date(subscriber.created_at), "PP")
                          : profile?.created_at
                          ? format(new Date(profile.created_at), "PP")
                          : "—"
                      }
                    />
                    <Row
                      label="Last login"
                      value={
                        auth?.last_sign_in_at
                          ? `${formatDistanceToNow(new Date(auth.last_sign_in_at))} ago`
                          : "Never"
                      }
                    />
                    <Row label="Coupon" value={stripe?.coupon?.name || stripe?.coupon?.id || "—"} />
                    <Row label="Team members" value={String(teamMembers.length)} />
                    <div className="col-span-2">
                      <Row
                        label="Address"
                        value={
                          profile?.address_line1
                            ? [
                                profile.address_line1,
                                profile.address_line2,
                                [profile.city, profile.state, profile.postal_code].filter(Boolean).join(" "),
                                profile.country,
                              ]
                                .filter(Boolean)
                                .join(", ")
                            : "—"
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Retention panel — one per org */}
                {orgs.map((o) => (
                  <RetentionPanel key={`ret-${o.id}`} orgId={o.id} orgName={o.name} />
                ))}

                {/* Card 2: Sites & Product Status */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Sites & Product Status ({sites.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sites.length === 0 && (
                      <p className="text-sm text-muted-foreground">No sites connected</p>
                    )}
                    {sites.map((s) => {
                      const siteAlerts = recentAlerts.filter((a) => a.org_id === s.org_id).slice(0, 3);
                      return (
                        <div key={s.id} className="rounded-md border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <a
                                href={`https://${s.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium hover:underline truncate"
                              >
                                {s.domain}
                              </a>
                            </div>
                            <div className="flex gap-1.5">
                              <Badge
                                variant={s.status === "UP" ? "default" : "destructive"}
                                className="text-[10px]"
                              >
                                {s.status}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {consentByOrg(s.org_id)}
                              </Badge>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                            <div>
                              <span className="block text-foreground/70">Plugin</span>
                              v{s.plugin_version || "—"}
                            </div>
                            <div>
                              <span className="block text-foreground/70">Last sync</span>
                              {s.last_heartbeat_at
                                ? `${formatDistanceToNow(new Date(s.last_heartbeat_at))} ago`
                                : "Never"}
                            </div>
                            <div>
                              <span className="block text-foreground/70">Plan tier</span>
                              {s.plan_tier || "—"}
                            </div>
                          </div>
                          {siteAlerts.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-border/40">
                              {siteAlerts.map((a) => (
                                <div key={a.id} className="flex items-center gap-2 text-[11px]">
                                  <AlertCircle
                                    className={`h-3 w-3 ${
                                      a.severity === "critical" ? "text-destructive" : "text-muted-foreground"
                                    }`}
                                  />
                                  <span className="truncate">{a.title}</span>
                                  <span className="ml-auto text-muted-foreground">
                                    {format(new Date(a.created_at), "MMM d")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Card 3: Imports & Jobs */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Imports & Jobs ({importJobs.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {importJobs.length === 0 && (
                      <p className="text-sm text-muted-foreground">No import jobs</p>
                    )}
                    {importJobs.slice(0, 8).map((j) => {
                      const pct =
                        j.total_expected > 0
                          ? Math.min(100, Math.round((j.total_processed / j.total_expected) * 100))
                          : 0;
                      return (
                        <div
                          key={j.id}
                          className="rounded border bg-muted/30 p-2 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge
                              variant={
                                j.status === "failed"
                                  ? "destructive"
                                  : j.status === "completed"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {j.status}
                            </Badge>
                            <span className="text-muted-foreground">
                              {j.total_processed}/{j.total_expected || "?"} ({pct}%)
                            </span>
                            <span className="text-muted-foreground">
                              {j.updated_at
                                ? `${formatDistanceToNow(new Date(j.updated_at))} ago`
                                : "—"}
                            </span>
                          </div>
                          {j.last_error && (
                            <p className="text-destructive text-[11px] truncate">{j.last_error}</p>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Card 4: Notes */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Support Notes ({notes.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Textarea
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        placeholder="Context, ticket reference, refund approval, etc."
                        rows={2}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1">
                          {NOTE_TAGS.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setNoteTag(t)}
                              className={`text-[10px] px-2 py-0.5 rounded border ${
                                noteTag === t
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          className="ml-auto"
                          disabled={!noteBody.trim() || addNote.isPending}
                          onClick={() => addNote.mutate()}
                        >
                          {addNote.isPending ? "Saving…" : "Save Note"}
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      {notes.length === 0 && (
                        <p className="text-xs text-muted-foreground">No notes yet</p>
                      )}
                      {notes.map((n) => (
                        <div key={n.id} className="border-b border-border/40 pb-2 space-y-1">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">
                                {n.category}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {n.author_email || "system"} ·{" "}
                                {format(new Date(n.created_at), "PPp")}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() => deleteNote.mutate(n.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT COLUMN (~30%) */}
              <div className="lg:col-span-3 space-y-4">
                {/* Card 5: Billing snapshot (read-only) */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Receipt className="h-3.5 w-3.5" /> Billing (read-only)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {!stripe?.customer_id && (
                      <p className="text-xs text-muted-foreground">
                        No Stripe customer found for this email.
                      </p>
                    )}
                    {stripe?.customer_id && (
                      <>
                        <div className="space-y-1.5">
                          <Row label="Plan" value={stripe.subscription?.plan_name || "—"} />
                          <Row
                            label="Status"
                            value={stripe.subscription?.status || "—"}
                          />
                          <Row
                            label="Price"
                            value={
                              stripe.subscription
                                ? `$${stripe.subscription.amount}/${stripe.subscription.interval}`
                                : "—"
                            }
                          />
                          <Row
                            label="Next billing"
                            value={
                              stripe.subscription?.current_period_end
                                ? format(
                                    new Date(stripe.subscription.current_period_end * 1000),
                                    "PP",
                                  )
                                : "—"
                            }
                          />
                          <Row
                            label="Last payment"
                            value={
                              stripe.last_payment?.paid_at
                                ? `$${stripe.last_payment.amount_paid} · ${format(
                                    new Date(stripe.last_payment.paid_at * 1000),
                                    "PP",
                                  )}`
                                : "—"
                            }
                          />
                          <Row label="Coupon" value={stripe.coupon?.name || stripe.coupon?.id || "—"} />
                          <Separator className="my-2" />
                          <div className="flex justify-between gap-3 items-center">
                            <span className="text-muted-foreground text-xs shrink-0">Customer ID</span>
                            <MaskedId value={stripe.customer_id} />
                          </div>
                          {stripe.subscription?.id && (
                            <div className="flex justify-between gap-3 items-center">
                              <span className="text-muted-foreground text-xs shrink-0">Subscription ID</span>
                              <MaskedId value={stripe.subscription.id} />
                            </div>
                          )}
                          {stripe.subscription?.cancel_at_period_end && (
                            <p className="text-xs text-warning pt-1">
                              ⚠ Cancelling at period end
                            </p>
                          )}
                        </div>
                        <Separator />
                        <div className="flex flex-col gap-1.5">
                          <Button asChild size="sm" variant="outline" className="justify-start">
                            <a href={stripe.customer_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-2" /> Open Customer in Stripe
                            </a>
                          </Button>
                          {stripe.subscription?.url && (
                            <Button asChild size="sm" variant="outline" className="justify-start">
                              <a
                                href={stripe.subscription.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3 w-3 mr-2" /> Open Subscription in Stripe
                              </a>
                            </Button>
                          )}
                          <Button asChild size="sm" variant="outline" className="justify-start">
                            <a href={stripe.invoices_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-2" /> View Invoices
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline" className="justify-start">
                            <a href={stripe.customer_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-2" /> Refund in Stripe
                            </a>
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground italic">
                          Billing edits, refunds, and plan changes happen in Stripe.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Card 6: Team & Access */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Team & Access ({teamMembers.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {teamMembers.length === 0 && (
                      <p className="text-xs text-muted-foreground">No team members</p>
                    )}
                    {teamMembers.map((m) => (
                      <div
                        key={`${m.org_id}-${m.user_id}`}
                        className="flex items-center justify-between text-xs gap-2"
                      >
                        <span className="truncate" title={m.email}>
                          {m.full_name || m.email}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {m.role}
                        </Badge>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground italic pt-2">
                      Invite & role changes are self-service in the customer's Account page.
                    </p>
                  </CardContent>
                </Card>

                {/* Card 7: Security / Admin actions */}
                <Card className="border-destructive/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-3.5 w-3.5" /> Security Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleForceLogout}
                      disabled={actionLoading === "logout"}
                    >
                      <LogOut className="h-3.5 w-3.5 mr-2" />
                      {actionLoading === "logout" ? "Revoking…" : "Force logout sessions"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleResetPassword}
                      disabled={actionLoading === "reset"}
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-2" />
                      Send password reset
                    </Button>
                    <p className="text-[10px] text-muted-foreground italic pt-1">
                      Disable / reactivate account is managed via Stripe subscription status.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 items-baseline">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span
        className={`text-right truncate ${mono ? "font-mono text-[11px]" : "text-sm"}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
