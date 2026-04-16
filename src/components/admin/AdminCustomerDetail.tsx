import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink,
  KeyRound,
  LogOut,
  Loader2,
  Trash2,
  User,
  Globe,
  Wrench,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  email: string | null;
  subscriberId?: string | null;
}

export function AdminCustomerDetail({ open, onOpenChange, email, subscriberId }: Props) {
  const qc = useQueryClient();
  const [noteBody, setNoteBody] = useState("");
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
  const orgs = data?.orgs ?? [];
  const sites = data?.sites ?? [];
  const importJobs = data?.import_jobs ?? [];
  const recentAlerts = data?.recent_alerts ?? [];
  const consentConfigs = data?.consent_configs ?? [];
  const teamMembers = data?.team_members ?? [];
  const notes = data?.notes ?? [];
  const stripe = data?.stripe;

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const orgId = orgs[0]?.org_id ?? null;
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "add_note",
          body,
          org_id: orgId,
          subscriber_id: subscriber?.id ?? null,
          subscriber_email: email,
          category: "support",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      setNoteBody("");
      toast.success("Note added");
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

  const handleResetPassword = async () => {
    if (!email) return;
    setActionLoading("reset");
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "send_password_reset", email },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Password reset email sent to ${email}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to send reset");
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceLogout = async () => {
    if (!email) return;
    if (!confirm(`Force logout ${email} from all sessions?`)) return;
    setActionLoading("logout");
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "force_logout", email },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("All sessions revoked");
    } catch (e: any) {
      toast.error(e.message || "Failed to force logout");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {profile?.full_name || email || "Customer"}
            {subscriber?.pricing_type === "founding" && (
              <Badge variant="secondary" className="text-[10px]">Founding</Badge>
            )}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">{email}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading customer details…
          </div>
        ) : (
          <Tabs defaultValue="account" className="mt-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="account"><User className="h-3.5 w-3.5 mr-1" />Account</TabsTrigger>
              <TabsTrigger value="product"><Globe className="h-3.5 w-3.5 mr-1" />Product</TabsTrigger>
              <TabsTrigger value="support"><Wrench className="h-3.5 w-3.5 mr-1" />Support</TabsTrigger>
              <TabsTrigger value="stripe"><CreditCard className="h-3.5 w-3.5 mr-1" />Stripe</TabsTrigger>
            </TabsList>

            {/* ── ACCOUNT ─────────────────────────────────────────── */}
            <TabsContent value="account" className="space-y-4 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Profile</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Name" value={profile?.full_name || "—"} />
                  <Row label="Email" value={email || "—"} mono />
                  <Row label="Phone" value={profile?.phone || "—"} />
                  <Row
                    label="Address"
                    value={
                      profile?.address_line1
                        ? [profile.address_line1, profile.city, profile.state, profile.postal_code, profile.country]
                            .filter(Boolean).join(", ")
                        : "—"
                    }
                  />
                  <Separator />
                  <Row
                    label="Signup"
                    value={subscriber?.created_at ? format(new Date(subscriber.created_at), "PPp") : "—"}
                  />
                  <Row
                    label="Last sign-in"
                    value={
                      auth?.last_sign_in_at
                        ? `${formatDistanceToNow(new Date(auth.last_sign_in_at))} ago`
                        : "Never"
                    }
                  />
                  <Row label="Pricing tier" value={subscriber?.pricing_type || "standard"} />
                  <Row label="Referral source" value={subscriber?.referral_source || "—"} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Access Controls</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button
                    size="sm" variant="outline"
                    onClick={handleResetPassword}
                    disabled={actionLoading === "reset"}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" />
                    {actionLoading === "reset" ? "Sending…" : "Send Password Reset"}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={handleForceLogout}
                    disabled={actionLoading === "logout"}
                  >
                    <LogOut className="h-3.5 w-3.5 mr-1" />
                    {actionLoading === "logout" ? "Revoking…" : "Force Logout"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Team Members ({teamMembers.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {teamMembers.length === 0 && <p className="text-sm text-muted-foreground">No team members</p>}
                  {teamMembers.map((m: any) => (
                    <div key={`${m.org_id}-${m.user_id}`} className="flex justify-between text-xs">
                      <span className="truncate">{m.full_name || m.email}</span>
                      <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── PRODUCT STATE ───────────────────────────────────── */}
            <TabsContent value="product" className="space-y-4 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Organizations ({orgs.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {orgs.length === 0 && <p className="text-sm text-muted-foreground">No orgs</p>}
                  {orgs.map((o: any) => (
                    <div key={o.org_id} className="text-sm border-b border-border/40 pb-2">
                      <div className="flex justify-between">
                        <span className="font-medium">{o.name}</span>
                        <Badge variant="outline" className="text-[10px]">{o.role}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono">{o.org_id}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Connected Sites ({sites.length})</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {sites.length === 0 && <p className="text-sm text-muted-foreground">No sites</p>}
                  {sites.map((s: any) => (
                    <div key={s.id} className="text-sm border-b border-border/40 pb-2 space-y-0.5">
                      <div className="flex justify-between items-center">
                        <span className="font-medium truncate">{s.domain}</span>
                        <Badge variant={s.status === "UP" ? "default" : "destructive"} className="text-[10px]">
                          {s.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Plugin v{s.plugin_version || "—"} · Tier {s.plan_tier}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Last heartbeat:{" "}
                        {s.last_heartbeat_at
                          ? `${formatDistanceToNow(new Date(s.last_heartbeat_at))} ago`
                          : "Never"}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Consent / Tracking</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {consentConfigs.length === 0 && <p className="text-muted-foreground">Default (strict)</p>}
                  {consentConfigs.map((c: any) => (
                    <div key={c.org_id} className="flex justify-between text-xs">
                      <span>Mode</span>
                      <Badge variant="outline" className="text-[10px]">{c.consent_mode}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Import Jobs ({importJobs.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {importJobs.length === 0 && <p className="text-sm text-muted-foreground">No import jobs</p>}
                  {importJobs.slice(0, 5).map((j: any) => (
                    <div key={j.id} className="flex justify-between text-xs">
                      <span>
                        <Badge variant="outline" className="text-[10px] mr-2">{j.status}</Badge>
                        {j.total_processed}/{j.total_expected || "?"}
                      </span>
                      <span className="text-muted-foreground">
                        {j.updated_at ? formatDistanceToNow(new Date(j.updated_at)) + " ago" : "—"}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5" /> Recent Alerts ({recentAlerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {recentAlerts.length === 0 && <p className="text-sm text-muted-foreground">No recent alerts</p>}
                  {recentAlerts.map((a: any) => (
                    <div key={a.id} className="flex justify-between text-xs">
                      <span>
                        <Badge
                          variant={a.severity === "critical" ? "destructive" : "secondary"}
                          className="text-[10px] mr-2"
                        >
                          {a.severity}
                        </Badge>
                        {a.title}
                      </span>
                      <span className="text-muted-foreground">{format(new Date(a.created_at), "MMM d")}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── SUPPORT TOOLS / NOTES ───────────────────────────── */}
            <TabsContent value="support" className="space-y-4 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Add Internal Note</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Context, ticket reference, refund approval, etc."
                    rows={3}
                  />
                  <Button
                    size="sm"
                    disabled={!noteBody.trim() || addNote.isPending}
                    onClick={() => addNote.mutate(noteBody.trim())}
                  >
                    {addNote.isPending ? "Saving…" : "Save Note"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Notes Log ({notes.length})</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet</p>}
                  {notes.map((n: any) => (
                    <div key={n.id} className="border-b border-border/40 pb-2 space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{n.category}</Badge>
                          <span className="text-xs text-muted-foreground">{n.author_email || "system"}</span>
                          <span className="text-xs text-muted-foreground">
                            · {format(new Date(n.created_at), "PPp")}
                          </span>
                        </div>
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2"
                          onClick={() => deleteNote.mutate(n.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── STRIPE (READ-ONLY) ──────────────────────────────── */}
            <TabsContent value="stripe" className="space-y-4 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Stripe (read-only)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {!stripe?.customer_id && (
                    <p className="text-sm text-muted-foreground">
                      No Stripe customer found for this email.
                    </p>
                  )}
                  {stripe?.customer_id && (
                    <>
                      <div className="space-y-2 text-sm">
                        <Row label="Customer ID" value={stripe.customer_id} mono />
                        {stripe.subscription && (
                          <>
                            <Row label="Plan" value={stripe.subscription.plan_name} />
                            <Row
                              label="Amount"
                              value={`$${stripe.subscription.amount}/${stripe.subscription.interval}`}
                            />
                            <Row label="Status" value={stripe.subscription.status} />
                            <Row
                              label="Next billing"
                              value={
                                stripe.subscription.current_period_end
                                  ? format(new Date(stripe.subscription.current_period_end * 1000), "PPP")
                                  : "—"
                              }
                            />
                            {stripe.subscription.cancel_at_period_end && (
                              <p className="text-xs text-warning">Cancelling at period end</p>
                            )}
                          </>
                        )}
                      </div>
                      <Separator />
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a href={stripe.customer_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" /> Open in Stripe → Customer
                          </a>
                        </Button>
                        {stripe.subscription?.url && (
                          <Button asChild size="sm" variant="outline">
                            <a href={stripe.subscription.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" /> Subscription
                            </a>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <a href={stripe.invoices_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" /> Invoices
                          </a>
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground italic">
                        All billing edits, refunds, and plan changes happen in Stripe — this app
                        only links and displays.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs text-right" : "text-right"}>{value}</span>
    </div>
  );
}
