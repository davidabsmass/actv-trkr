import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LifeBuoy, Plus, MessageSquare, Paperclip, ArrowLeft, Send, CheckCircle2, ThumbsUp, ThumbsDown, X, Lightbulb } from "lucide-react";
import { format } from "date-fns";
import { articlesForType } from "./helpContent";
import { markSupportTicketRead } from "@/hooks/use-unread-support-replies";

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  question: "Question",
  billing: "Billing",
  setup: "Setup Help",
};

const STATUS_LABELS: Record<string, { label: string; tone: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "New", tone: "default" },
  in_review: { label: "In Review", tone: "secondary" },
  waiting_on_us: { label: "With Support", tone: "default" },
  waiting_on_customer: { label: "Waiting on You", tone: "outline" },
  planned: { label: "Planned", tone: "secondary" },
  in_progress: { label: "In Progress", tone: "secondary" },
  resolved: { label: "Resolved", tone: "outline" },
  closed: { label: "Closed", tone: "outline" },
};

export default function SupportSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTicketId = searchParams.get("ticket");
  const [showForm, setShowForm] = useState(false);
  const [successTicketNumber, setSuccessTicketNumber] = useState<number | null>(null);

  const setActiveTicket = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("ticket", id); else next.delete("ticket");
    next.set("tab", "support");
    setSearchParams(next, { replace: true });
  };

  if (activeTicketId) {
    return <TicketDetail ticketId={activeTicketId} onBack={() => setActiveTicket(null)} />;
  }

  if (showForm) {
    return (
      <SubmitTicketForm
        onCancel={() => setShowForm(false)}
        onSuccess={(number) => { setShowForm(false); setSuccessTicketNumber(number); }}
      />
    );
  }

  if (successTicketNumber !== null) {
    return (
      <Card className="lg:col-span-2 border-success/30 bg-success/5">
        <CardContent className="pt-6 pb-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Request Submitted</h3>
          <p className="text-sm text-muted-foreground mb-4">
            We received your request and created ticket <span className="font-mono font-semibold text-foreground">#{successTicketNumber}</span>.
            We'll follow up as soon as possible.
          </p>
          <Button size="sm" onClick={() => setSuccessTicketNumber(null)}>View My Requests</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <LifeBuoy className="h-4 w-4" /> Need Help?
            </CardTitle>
            <CardDescription>Report a problem, request a feature, or ask a question.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Submit Request
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <TicketList onOpen={(id) => setActiveTicket(id)} />
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── Ticket list ───────────────────────── */

function TicketList({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const { orgId } = useOrg();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["my_support_tickets", orgId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_number, type, subject, status, updated_at, website_url, site_id")
        .eq("org_id", orgId!)
        .eq("submitted_by_user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && !!user,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!tickets || tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <MessageSquare className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">No requests yet</p>
        <p className="text-xs text-muted-foreground">
          When you submit a question, bug report, or feature request, it will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="font-medium py-2 px-2">Ticket</th>
            <th className="font-medium py-2 px-2">Type</th>
            <th className="font-medium py-2 px-2">Subject</th>
            <th className="font-medium py-2 px-2">Status</th>
            <th className="font-medium py-2 px-2 text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const status = STATUS_LABELS[t.status] || { label: t.status, tone: "outline" as const };
            return (
              <tr
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="cursor-pointer hover:bg-muted/40 border-b border-border/60"
              >
                <td className="py-3 px-2 font-mono text-xs text-muted-foreground">#{t.ticket_number}</td>
                <td className="py-3 px-2 text-xs">{TYPE_LABELS[t.type] || t.type}</td>
                <td className="py-3 px-2 font-medium text-foreground max-w-[280px] truncate">{t.subject}</td>
                <td className="py-3 px-2"><Badge variant={status.tone} className="text-xs">{status.label}</Badge></td>
                <td className="py-3 px-2 text-xs text-muted-foreground text-right">
                  {format(new Date(t.updated_at), "MMM d, h:mm a")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── Submit form ───────────────────────── */

function SubmitTicketForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: (n: number) => void }) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<string>("question");
  const [siteId, setSiteId] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [whatHappened, setWhatHappened] = useState("");
  const [whatExpected, setWhatExpected] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [featureWhy, setFeatureWhy] = useState("");
  const [billingTopic, setBillingTopic] = useState("");
  const [setupBlocker, setSetupBlocker] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: sites } = useQuery({
    queryKey: ["my_sites", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, domain")
        .eq("org_id", orgId!)
        .order("domain");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: profile } = useQuery({
    queryKey: ["my_profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, email").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    const valid = list.filter((f) => f.size <= 10 * 1024 * 1024);
    if (valid.length < list.length) {
      toast({ title: "Some files were too large", description: "Max 10 MB per file.", variant: "destructive" });
    }
    setFiles(valid.slice(0, 5));
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Subject and message are required", variant: "destructive" });
      return;
    }
    if (!user || !orgId) return;

    setSubmitting(true);
    try {
      // Build composed message with conditional fields
      let composed = message.trim();
      const extras: string[] = [];
      if (type === "bug") {
        if (whatHappened.trim()) extras.push(`What happened:\n${whatHappened.trim()}`);
        if (whatExpected.trim()) extras.push(`What I expected:\n${whatExpected.trim()}`);
        if (stepsToReproduce.trim()) extras.push(`Steps to reproduce:\n${stepsToReproduce.trim()}`);
      }
      if (type === "feature" && featureWhy.trim()) extras.push(`Why this would help:\n${featureWhy.trim()}`);
      if (type === "billing" && billingTopic.trim()) extras.push(`Billing topic: ${billingTopic.trim()}`);
      if (type === "setup" && setupBlocker.trim()) extras.push(`Where I'm stuck:\n${setupBlocker.trim()}`);
      if (extras.length) composed += "\n\n---\n" + extras.join("\n\n");

      const ticketPayload = {
        org_id: orgId,
        site_id: siteId || null,
        submitted_by_user_id: user.id,
        submitted_by_name: profile?.full_name || null,
        submitted_by_email: profile?.email || user.email || null,
        type,
        subject: subject.trim(),
        message: composed,
        priority,
        website_url: websiteUrl.trim() || null,
        current_app_path: window.location.pathname + window.location.search,
        browser_info: navigator.userAgent,
        app_version: import.meta.env.MODE,
        metadata: {
          business_reason: type === "feature" ? featureWhy.trim() : null,
        },
      };

      const { data: inserted, error: insErr } = await supabase
        .from("support_tickets")
        .insert(ticketPayload)
        .select("id, ticket_number")
        .single();
      if (insErr || !inserted) throw insErr || new Error("Failed to create ticket");

      // Upload attachments
      if (files.length > 0) {
        for (const file of files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${inserted.id}/${crypto.randomUUID()}-${safeName}`;
          const { error: upErr } = await supabase.storage.from("support-attachments").upload(path, file, {
            contentType: file.type || "application/octet-stream",
          });
          if (upErr) {
            console.error("upload error", upErr);
            continue;
          }
          await supabase.from("support_ticket_attachments").insert({
            ticket_id: inserted.id,
            file_name: file.name,
            file_path: path,
            file_size: file.size,
            mime_type: file.type || null,
            uploaded_by_user_id: user.id,
          });
        }
      }

      // Fire-and-forget notification
      supabase.functions.invoke("notify-support-event", {
        body: { ticket_id: inserted.id, event_kind: "created" },
      }).catch((e) => console.warn("notify-support-event failed", e));

      queryClient.invalidateQueries({ queryKey: ["my_support_tickets"] });
      onSuccess(Number(inserted.ticket_number));
    } catch (e: any) {
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Submit Request</CardTitle>
            <CardDescription>
              Tell us what's going on. We'll get back to you as soon as we can.
              Many issues are answered in <span className="text-foreground font-medium">Quick Help</span> above — worth a glance first.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="setup">Setup Help</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priority (optional)</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SuggestedArticles type={type} />

        <div className="space-y-1.5">
          <Label className="text-xs">Affected Site</Label>
          {sites && sites.length > 0 ? (
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger><SelectValue placeholder="Select a site (optional)" /></SelectTrigger>
              <SelectContent>
                {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.domain}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input placeholder="https://your-site.com (optional)" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" maxLength={200} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Tell us more…" maxLength={4000} />
        </div>

        {type === "bug" && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <ConditionalField label="What happened?" value={whatHappened} setValue={setWhatHappened} />
            <ConditionalField label="What did you expect to happen?" value={whatExpected} setValue={setWhatExpected} />
            <ConditionalField label="Steps to reproduce" value={stepsToReproduce} setValue={setStepsToReproduce} rows={3} />
          </div>
        )}
        {type === "feature" && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <ConditionalField label="Why would this help?" value={featureWhy} setValue={setFeatureWhy} rows={3} />
          </div>
        )}
        {type === "billing" && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <Label className="text-xs">Billing topic</Label>
            <Input className="mt-1.5" value={billingTopic} onChange={(e) => setBillingTopic(e.target.value)} placeholder="e.g. invoice, refund, payment method" />
          </div>
        )}
        {type === "setup" && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <ConditionalField label="Where are you stuck?" value={setupBlocker} setValue={setSetupBlocker} rows={3} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Paperclip className="h-3 w-3" /> Attachments (optional, max 5 files · 10 MB each)
          </Label>
          <Input type="file" multiple onChange={handleFileChange} accept="image/*,application/pdf,.txt,.csv,.json,.zip" />
          {files.length > 0 && (
            <p className="text-xs text-muted-foreground">{files.length} file{files.length !== 1 && "s"} selected</p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={submitting || !subject || !message}>
            {submitting ? "Submitting…" : "Submit Request"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestedArticles({ type }: { type: string }) {
  const articles = articlesForType(type);
  if (articles.length === 0) return null;
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        Before you submit — these might already answer your question:
      </div>
      <ul className="space-y-1.5">
        {articles.map((a) => (
          <li key={a.id}>
            <details className="group">
              <summary className="cursor-pointer text-sm text-foreground hover:text-primary list-none flex items-start gap-1.5">
                <span className="text-primary mt-0.5">›</span>
                <span className="group-open:font-medium">{a.question}</span>
              </summary>
              <p className="text-xs text-muted-foreground mt-1.5 ml-4 leading-relaxed">{a.answer}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConditionalField({ label, value, setValue, rows = 2 }: { label: string; value: string; setValue: (v: string) => void; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={rows} maxLength={2000} />
    </div>
  );
}

/* ───────────────────────── Ticket detail ───────────────────────── */

function TicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const latestAdminReplyRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);

  // Mark this ticket's admin replies as read for the current user as soon as
  // it opens — clears the dashboard "Support replied" banner and bell dot.
  useEffect(() => {
    if (user?.id && ticketId) {
      markSupportTicketRead(user.id, ticketId, queryClient);
    }
  }, [user?.id, ticketId, queryClient]);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["support_ticket", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("id", ticketId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["support_ticket_messages", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // ID of the most recent admin reply — used to scroll/highlight when the
  // user arrives from the dashboard "Support replied" banner (focus=reply).
  const latestAdminMessageId = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].author_type === "admin") return messages[i].id as string;
    }
    return null;
  }, [messages]);

  const focusReply = searchParams.get("focus") === "reply";

  useEffect(() => {
    if (!focusReply || hasScrolledRef.current) return;
    if (!latestAdminReplyRef.current) return;
    hasScrolledRef.current = true;
    // Defer to next frame so layout has settled.
    requestAnimationFrame(() => {
      latestAdminReplyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    // Clean the URL flag so a refresh doesn't keep re-scrolling.
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [focusReply, latestAdminMessageId, searchParams, setSearchParams]);

  const { data: attachments } = useQuery({
    queryKey: ["support_ticket_attachments", ticketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_ticket_attachments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: satisfaction } = useQuery({
    queryKey: ["support_ticket_satisfaction", ticketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_ticket_satisfaction")
        .select("*")
        .eq("ticket_id", ticketId)
        .maybeSingle();
      return data;
    },
  });

  const handleReply = async () => {
    if (!reply.trim() || !user) return;
    setSending(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();

      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        author_user_id: user.id,
        author_name: profile?.full_name,
        author_email: profile?.email || user.email,
        author_type: "customer",
        message: reply.trim(),
        is_internal: false,
      });
      if (error) throw error;

      supabase.functions.invoke("notify-support-event", {
        body: { ticket_id: ticketId, event_kind: "customer_replied", message_preview: reply.trim().slice(0, 200) },
      }).catch(() => {});

      setReply("");
      queryClient.invalidateQueries({ queryKey: ["support_ticket_messages", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support_ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["my_support_tickets"] });
    } catch (e: any) {
      toast({ title: "Reply failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!ticket) return;
    const ok = window.confirm("Mark this ticket as resolved? You can reopen it later by replying.");
    if (!ok) return;
    try {
      const { error } = await supabase.rpc("customer_resolve_ticket", { _ticket_id: ticketId });
      if (error) throw error;
      supabase.functions.invoke("notify-support-event", {
        body: { ticket_id: ticketId, event_kind: "customer_resolved", message_preview: "Customer marked as resolved" },
      }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["support_ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["my_support_tickets"] });
      toast({ title: "Ticket resolved", description: "Thanks for letting us know!" });
    } catch (e: any) {
      toast({ title: "Could not update ticket", description: e.message, variant: "destructive" });
    }
  };

  const submitSatisfaction = async (rating: "helpful" | "not_helpful") => {
    const { error } = await supabase.from("support_ticket_satisfaction").insert({
      ticket_id: ticketId, rating,
    });
    if (error && !error.message.includes("duplicate")) {
      toast({ title: "Could not save rating", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["support_ticket_satisfaction", ticketId] });
    toast({ title: "Thanks for the feedback!" });
  };

  if (isLoading) return <Card className="lg:col-span-2"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Loading…</p></CardContent></Card>;
  if (!ticket) return <Card className="lg:col-span-2"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Ticket not found.</p></CardContent></Card>;

  const status = STATUS_LABELS[ticket.status] || { label: ticket.status, tone: "outline" as const };
  const closedOrResolved = ["resolved", "closed"].includes(ticket.status);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-2 h-7 text-xs gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to requests
            </Button>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">#{ticket.ticket_number}</span>
              <Badge variant={status.tone} className="text-xs">{status.label}</Badge>
              <Badge variant="outline" className="text-xs">{TYPE_LABELS[ticket.type] || ticket.type}</Badge>
            </div>
            <CardTitle className="text-base">{ticket.subject}</CardTitle>
            <CardDescription className="text-xs">
              Submitted {format(new Date(ticket.created_at), "MMM d, yyyy 'at' h:mm a")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Original */}
        <div className="rounded-lg border border-border p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">You wrote</p>
          <p className="text-sm whitespace-pre-wrap text-foreground">{ticket.message}</p>
        </div>

        {/* Attachments (original + message attachments) */}
        {attachments && attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Attachments</p>
            {attachments.map((a) => (
              <AttachmentLink key={a.id} attachment={a} />
            ))}
          </div>
        )}

        {/* Thread (non-internal only thanks to RLS) */}
        {messages && messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((m) => {
              const isLatestAdmin = m.id === latestAdminMessageId;
              return (
                <div
                  key={m.id}
                  ref={isLatestAdmin ? latestAdminReplyRef : undefined}
                  className={`rounded-lg p-3 transition-shadow ${m.author_type === "admin" ? "bg-primary/5 border border-primary/20" : "bg-muted/30 border border-border"} ${isLatestAdmin && focusReply ? "ring-2 ring-primary/40 shadow-md scroll-mt-24" : "scroll-mt-24"}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-foreground">
                      {m.author_type === "admin" ? "Support team" : (m.author_name || "You")}
                    </p>
                    <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), "MMM d, h:mm a")}</p>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground">{m.message}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Reply */}
        {ticket.status !== "closed" && (
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs">Reply</Label>
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Add a reply…" maxLength={4000} />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleReply} disabled={sending || !reply.trim()} size="sm" className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Reply"}
              </Button>
              {!closedOrResolved && (
                <Button onClick={handleMarkResolved} variant="outline" size="sm" className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark as resolved
                </Button>
              )}
            </div>
            {!closedOrResolved && (
              <p className="text-xs text-muted-foreground">
                Figured it out on your own? Mark this resolved to let our team off the hook.
              </p>
            )}
          </div>
        )}

        {/* Satisfaction */}
        {closedOrResolved && !satisfaction && (
          <div className="rounded-lg border border-border p-3 flex items-center justify-between">
            <p className="text-sm text-foreground">Was this support helpful?</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => submitSatisfaction("helpful")} className="gap-1.5"><ThumbsUp className="h-3.5 w-3.5" /> Yes</Button>
              <Button variant="outline" size="sm" onClick={() => submitSatisfaction("not_helpful")} className="gap-1.5"><ThumbsDown className="h-3.5 w-3.5" /> No</Button>
            </div>
          </div>
        )}
        {satisfaction?.rating && (
          <p className="text-xs text-muted-foreground text-center">
            Thanks — you rated this {satisfaction.rating === "helpful" ? "helpful 👍" : "not helpful 👎"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AttachmentLink({ attachment }: { attachment: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useMemo(() => {
    supabase.storage.from("support-attachments").createSignedUrl(attachment.file_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [attachment.file_path]);

  return (
    <a href={url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
      <Paperclip className="h-3 w-3" />
      {attachment.file_name}
      {attachment.file_size && <span className="text-muted-foreground">({Math.round(attachment.file_size / 1024)} KB)</span>}
    </a>
  );
}
