import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Inbox, MessageSquare, Send, Lock, Paperclip, Activity } from "lucide-react";
import { format } from "date-fns";
import { AdminTicketAccessWidget } from "@/components/admin/AdminTicketAccessWidget";
import { useSupportAccessAudit } from "@/hooks/use-support-access-audit";

const STATUSES = ["new","in_review","waiting_on_us","waiting_on_customer","planned","in_progress","resolved","closed"] as const;
const PRIORITIES = ["low","normal","high","urgent"] as const;
const TYPES = ["bug","feature","question","billing","setup"] as const;

const tone = (s: string) =>
  s === "new" ? "default"
  : s === "resolved" || s === "closed" ? "outline"
  : s === "waiting_on_customer" ? "secondary"
  : "default";

export default function SupportInbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(searchParams.get("ticket"));
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Sync URL → state when navigating via emailed deep links
  useEffect(() => {
    const t = searchParams.get("ticket");
    if (t && t !== activeTicketId) setActiveTicketId(t);
  }, [searchParams]);

  const openTicket = (id: string | null) => {
    setActiveTicketId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("ticket", id); else next.delete("ticket");
    setSearchParams(next, { replace: true });
  };

  if (activeTicketId) return <AdminTicketDetail ticketId={activeTicketId} onBack={() => openTicket(null)} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Inbox className="h-4 w-4" /> Support Inbox</CardTitle>
          <CardDescription>All customer tickets across organizations.</CardDescription>
        </CardHeader>
        <CardContent>
          <SupportKpis />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 mb-4">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open (any active)</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="text-xs h-8" placeholder="Search subject…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <AdminTicketTable
            filterStatus={filterStatus} filterType={filterType} filterPriority={filterPriority} search={search}
            onOpen={openTicket}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SupportKpis() {
  const { data } = useQuery({
    queryKey: ["support_kpis"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 7);
      const [{ count: weekCount }, { count: openCount }, { count: featureCount }] = await Promise.all([
        supabase.from("support_tickets").select("id", { head: true, count: "exact" }).gte("created_at", since.toISOString()),
        supabase.from("support_tickets").select("id", { head: true, count: "exact" }).not("status", "in", "(resolved,closed)"),
        supabase.from("support_tickets").select("id", { head: true, count: "exact" }).eq("type", "feature"),
      ]);
      return { weekCount: weekCount || 0, openCount: openCount || 0, featureCount: featureCount || 0 };
    },
  });

  return (
    <div className="grid grid-cols-3 gap-2">
      <Kpi label="New (7d)" value={data?.weekCount ?? "—"} />
      <Kpi label="Open" value={data?.openCount ?? "—"} />
      <Kpi label="Feature requests" value={data?.featureCount ?? "—"} />
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function AdminTicketTable({ filterStatus, filterType, filterPriority, search, onOpen }: {
  filterStatus: string; filterType: string; filterPriority: string; search: string;
  onOpen: (id: string) => void;
}) {
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin_support_tickets", filterStatus, filterType, filterPriority],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets")
        .select("id, ticket_number, type, subject, status, priority, updated_at, created_at, submitted_by_name, submitted_by_email, website_url")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (filterStatus === "open") q = q.not("status", "in", "(resolved,closed)");
      else if (filterStatus !== "all") q = q.eq("status", filterStatus);
      if (filterType !== "all") q = q.eq("type", filterType);
      if (filterPriority !== "all") q = q.eq("priority", filterPriority);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!tickets) return [];
    if (!search.trim()) return tickets;
    const q = search.toLowerCase();
    return tickets.filter((t) =>
      t.subject?.toLowerCase().includes(q) ||
      t.submitted_by_email?.toLowerCase().includes(q) ||
      t.website_url?.toLowerCase().includes(q) ||
      String(t.ticket_number).includes(q)
    );
  }, [tickets, search]);

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading tickets…</p>;
  if (!filtered.length) return <p className="text-sm text-muted-foreground py-4">No tickets match these filters.</p>;

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="font-medium py-2 px-2">#</th>
            <th className="font-medium py-2 px-2">Subject</th>
            <th className="font-medium py-2 px-2">Customer</th>
            <th className="font-medium py-2 px-2">Type</th>
            <th className="font-medium py-2 px-2">Priority</th>
            <th className="font-medium py-2 px-2">Status</th>
            <th className="font-medium py-2 px-2 text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.id} onClick={() => onOpen(t.id)} className="cursor-pointer hover:bg-muted/40 border-b border-border/60">
              <td className="py-2 px-2 font-mono text-xs text-muted-foreground">{t.ticket_number}</td>
              <td className="py-2 px-2 font-medium text-foreground max-w-[260px] truncate">{t.subject}</td>
              <td className="py-2 px-2 text-xs text-muted-foreground">{t.submitted_by_email}</td>
              <td className="py-2 px-2 text-xs"><Badge variant="outline" className="text-xs">{t.type}</Badge></td>
              <td className="py-2 px-2 text-xs">{t.priority}</td>
              <td className="py-2 px-2"><Badge variant={tone(t.status) as any} className="text-xs">{t.status.replace(/_/g, " ")}</Badge></td>
              <td className="py-2 px-2 text-xs text-muted-foreground text-right">{format(new Date(t.updated_at), "MMM d, h:mm a")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminTicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: ticket } = useQuery({
    queryKey: ["admin_support_ticket", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, sites:site_id(url, domain, name, display_name)")
        .eq("id", ticketId)
        .maybeSingle();
      if (error) throw error;
      if (data && !data.website_url) {
        const s: any = (data as any).sites;
        const fallback = s?.url || (s?.domain ? `https://${s.domain}` : null);
        if (fallback) (data as any).website_url = fallback;
      }
      return data;
    },
  });

  // Audit any admin actions on this ticket if the customer has granted access.
  const { logAction: logAccessAction } = useSupportAccessAudit(ticket?.org_id ?? null);

  const { data: messages } = useQuery({
    queryKey: ["admin_support_ticket_messages", ticketId],
    queryFn: async () => {
      const { data } = await supabase.from("support_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["admin_support_ticket_events", ticketId],
    queryFn: async () => {
      const { data } = await supabase.from("support_ticket_events").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const { data: attachments } = useQuery({
    queryKey: ["admin_support_ticket_attachments", ticketId],
    queryFn: async () => {
      const { data } = await supabase.from("support_ticket_attachments").select("*").eq("ticket_id", ticketId);
      return data || [];
    },
  });

  const updateField = async (patch: Record<string, any>) => {
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin_support_ticket", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["admin_support_tickets"] });
    queryClient.invalidateQueries({ queryKey: ["admin_support_ticket_events", ticketId] });
    if (patch.status) {
      logAccessAction("ticket_status_changed", {
        resourceType: "support_ticket",
        resourceId: ticketId,
        metadata: { new_status: patch.status },
      });
      supabase.functions.invoke("notify-support-event", {
        body: { ticket_id: ticketId, event_kind: "status_changed" },
      }).catch(() => {});
    }
    if (patch.priority) {
      logAccessAction("ticket_priority_changed", {
        resourceType: "support_ticket",
        resourceId: ticketId,
        metadata: { new_priority: patch.priority },
      });
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !user) return;
    setSending(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("user_id", user.id).maybeSingle();
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        author_user_id: user.id,
        author_name: profile?.full_name || "Support",
        author_email: profile?.email || user.email,
        author_type: "admin",
        message: reply.trim(),
        is_internal: internal,
      });
      if (error) throw error;

      if (!internal) {
        logAccessAction("ticket_replied", {
          resourceType: "support_ticket",
          resourceId: ticketId,
          metadata: { preview: reply.trim().slice(0, 200) },
        });
        supabase.functions.invoke("notify-support-event", {
          body: { ticket_id: ticketId, event_kind: "admin_replied", message_preview: reply.trim().slice(0, 200) },
        }).catch(() => {});
      }
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["admin_support_ticket_messages", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin_support_ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin_support_ticket_events", ticketId] });
    } catch (e: any) {
      toast({ title: "Reply failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!ticket) return <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Loading…</p></CardContent></Card>;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Main */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-2 h-7 text-xs gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to inbox
          </Button>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">#{ticket.ticket_number}</span>
            <Badge variant="outline" className="text-xs">{ticket.type}</Badge>
            <Badge variant={tone(ticket.status) as any} className="text-xs">{ticket.status.replace(/_/g, " ")}</Badge>
            <Badge variant="outline" className="text-xs">{ticket.priority}</Badge>
          </div>
          <CardTitle className="text-base">{ticket.subject}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Original request — {format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")}</p>
            <p className="text-sm whitespace-pre-wrap text-foreground">{ticket.message}</p>
          </div>

          {attachments && attachments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Attachments</p>
              {attachments.map((a) => <AdminAttachmentLink key={a.id} attachment={a} />)}
            </div>
          )}

          {messages && messages.length > 0 && (
            <div className="space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 border ${
                    m.is_internal ? "bg-warning/5 border-warning/30"
                    : m.author_type === "admin" ? "bg-primary/5 border-primary/20"
                    : "bg-muted/30 border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-foreground">{m.author_name || m.author_email || m.author_type}</p>
                      {m.is_internal && <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" /> Internal Note</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), "MMM d, h:mm a")}</p>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground">{m.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Reply box */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{internal ? "Internal note (not visible to customer)" : "Reply to customer"}</Label>
              <Button variant="ghost" size="sm" onClick={() => setInternal(!internal)} className="h-7 text-xs gap-1">
                <Lock className="h-3 w-3" /> {internal ? "Switch to reply" : "Add internal note"}
              </Button>
            </div>
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder={internal ? "Note for the team only…" : "Reply to the customer…"} maxLength={4000} />
            <Button onClick={sendReply} disabled={sending || !reply.trim()} size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : internal ? "Add Internal Note" : "Send Reply"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sidebar */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1.5">
            <Row label="Name" value={ticket.submitted_by_name} />
            <Row label="Email" value={ticket.submitted_by_email} />
            <Row label="Site" value={ticket.website_url} />
            <Row label="From page" value={ticket.current_app_path} />
            <Row label="Browser" value={ticket.browser_info ? ticket.browser_info.slice(0, 80) + "…" : null} />
          </CardContent>
        </Card>

        <AdminTicketAccessWidget ticketId={ticketId} orgId={ticket.org_id} />

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Manage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={ticket.status} onValueChange={(v) => updateField({ status: v })}>
                <SelectTrigger className="text-xs h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={ticket.priority} onValueChange={(v) => updateField({ priority: v })}>
                <SelectTrigger className="text-xs h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => updateField({ status: "resolved" })}>Mark Resolved</Button>
              {ticket.status !== "closed" ? (
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => updateField({ status: "closed" })}>Close</Button>
              ) : (
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => updateField({ status: "in_review" })}>Reopen</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Activity</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1.5 max-h-64 overflow-y-auto">
            {events && events.length > 0 ? events.map((e) => (
              <div key={e.id} className="flex justify-between gap-2 text-muted-foreground">
                <span className="truncate">{e.event_type.replace(/_/g, " ")}{e.new_value ? ` → ${e.new_value}` : ""}</span>
                <span className="flex-shrink-0">{format(new Date(e.created_at), "MMM d, HH:mm")}</span>
              </div>
            )) : <p className="text-muted-foreground">No activity yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right truncate max-w-[60%]">{value || "—"}</span>
    </div>
  );
}

function AdminAttachmentLink({ attachment }: { attachment: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useMemo(() => {
    supabase.storage.from("support-attachments").createSignedUrl(attachment.file_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [attachment.file_path]);
  return (
    <a href={url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
      <Paperclip className="h-3 w-3" />{attachment.file_name}
    </a>
  );
}
