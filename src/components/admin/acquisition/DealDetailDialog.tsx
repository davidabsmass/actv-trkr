import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, MessageSquare, Calendar, Phone, Mail, ScrollText, Plus } from "lucide-react";

interface Stage {
  stage_key: string;
  stage_name: string;
  is_won: boolean;
  is_lost: boolean;
}

interface Deal {
  id: string;
  deal_name: string;
  buyer_name: string;
  buyer_company: string | null;
  buyer_email: string | null;
  buyer_type: string;
  stage_key: string;
  deal_value: number | null;
  probability: number;
  expected_close_date: string | null;
  status: string;
  notes: string | null;
  source: string | null;
  lost_reason: string | null;
}

interface Activity {
  id: string;
  activity_type: string;
  title: string;
  body: string | null;
  occurred_at: string;
  created_at: string;
}

interface Document {
  id: string;
  document_type: string;
  document_name: string;
  document_url: string | null;
  status: string;
  effective_date: string | null;
  expiration_date: string | null;
  notes: string | null;
}

const ACTIVITY_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare },
  { value: "meeting", label: "Meeting", icon: Calendar },
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "nda_sent", label: "NDA Sent", icon: ScrollText },
  { value: "nda_signed", label: "NDA Signed", icon: ScrollText },
  { value: "loi_received", label: "LOI Received", icon: FileText },
  { value: "term_sheet", label: "Term Sheet", icon: FileText },
  { value: "valuation", label: "Valuation", icon: FileText },
];

const DOC_TYPES = [
  { value: "nda", label: "NDA" },
  { value: "loi", label: "LOI" },
  { value: "term_sheet", label: "Term Sheet" },
  { value: "valuation", label: "Valuation" },
  { value: "contract", label: "Contract" },
  { value: "other", label: "Other" },
];

const DOC_STATUSES = ["draft", "sent", "signed", "executed", "rejected"];

interface Props {
  dealId: string;
  stages: Stage[];
  onClose: () => void;
  onChanged: () => void;
}

export default function DealDetailDialog({ dealId, stages, onClose, onChanged }: Props) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // edit form
  const [editForm, setEditForm] = useState<Partial<Deal>>({});

  // new activity form
  const [actForm, setActForm] = useState({ activity_type: "note", title: "", body: "" });

  // new doc form
  const [docForm, setDocForm] = useState({
    document_type: "nda", document_name: "", document_url: "",
    status: "draft", effective_date: "", expiration_date: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    const [{ data: d }, { data: a }, { data: docs }] = await Promise.all([
      supabase.from("deals").select("*").eq("id", dealId).maybeSingle(),
      supabase.from("deal_activities").select("*").eq("deal_id", dealId).order("occurred_at", { ascending: false }),
      supabase.from("deal_documents").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
    ]);
    setDeal(d as Deal | null);
    setEditForm(d as Deal | null ?? {});
    setActivities((a as Activity[]) ?? []);
    setDocuments((docs as Document[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [dealId]);

  const handleSaveDeal = async () => {
    if (!deal) return;
    const updates = {
      deal_name: editForm.deal_name,
      buyer_name: editForm.buyer_name,
      buyer_company: editForm.buyer_company,
      buyer_email: editForm.buyer_email,
      buyer_type: editForm.buyer_type,
      stage_key: editForm.stage_key,
      deal_value: editForm.deal_value,
      probability: editForm.probability,
      expected_close_date: editForm.expected_close_date,
      notes: editForm.notes,
      source: editForm.source,
      lost_reason: editForm.lost_reason,
    };
    const { error } = await supabase.from("deals").update(updates).eq("id", dealId);
    if (error) { toast.error(error.message); return; }
    toast.success("Deal updated");
    load();
    onChanged();
  };

  const handleAddActivity = async () => {
    if (!actForm.title.trim()) { toast.error("Activity title required"); return; }
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("deal_activities").insert({
      deal_id: dealId,
      activity_type: actForm.activity_type,
      title: actForm.title.trim(),
      body: actForm.body.trim() || null,
      created_by_user_id: user.user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Activity logged");
    setActForm({ activity_type: "note", title: "", body: "" });
    load();
  };

  const handleAddDoc = async () => {
    if (!docForm.document_name.trim()) { toast.error("Document name required"); return; }
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("deal_documents").insert({
      deal_id: dealId,
      document_type: docForm.document_type,
      document_name: docForm.document_name.trim(),
      document_url: docForm.document_url.trim() || null,
      status: docForm.status,
      effective_date: docForm.effective_date || null,
      expiration_date: docForm.expiration_date || null,
      notes: docForm.notes.trim() || null,
      uploaded_by_user_id: user.user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Document added");
    setDocForm({ document_type: "nda", document_name: "", document_url: "", status: "draft", effective_date: "", expiration_date: "", notes: "" });
    load();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deal?.deal_name ?? "Deal"}</DialogTitle>
          <DialogDescription>
            {deal?.buyer_name}{deal?.buyer_company ? ` · ${deal.buyer_company}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading || !deal ? (
          <div className="py-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity ({activities.length})</TabsTrigger>
              <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Deal Name</Label>
                  <Input value={editForm.deal_name ?? ""} onChange={(e) => setEditForm({ ...editForm, deal_name: e.target.value })} />
                </div>
                <div>
                  <Label>Stage</Label>
                  <Select value={editForm.stage_key} onValueChange={(v) => setEditForm({ ...editForm, stage_key: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => <SelectItem key={s.stage_key} value={s.stage_key}>{s.stage_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Buyer Name</Label>
                  <Input value={editForm.buyer_name ?? ""} onChange={(e) => setEditForm({ ...editForm, buyer_name: e.target.value })} />
                </div>
                <div>
                  <Label>Buyer Company</Label>
                  <Input value={editForm.buyer_company ?? ""} onChange={(e) => setEditForm({ ...editForm, buyer_company: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={editForm.buyer_email ?? ""} onChange={(e) => setEditForm({ ...editForm, buyer_email: e.target.value })} />
                </div>
                <div>
                  <Label>Source</Label>
                  <Input value={editForm.source ?? ""} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} />
                </div>
                <div>
                  <Label>Deal Value (USD)</Label>
                  <Input type="number" value={editForm.deal_value ?? ""} onChange={(e) => setEditForm({ ...editForm, deal_value: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Probability %</Label>
                  <Input type="number" min="0" max="100" value={editForm.probability ?? 0} onChange={(e) => setEditForm({ ...editForm, probability: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Expected Close</Label>
                  <Input type="date" value={editForm.expected_close_date ?? ""} onChange={(e) => setEditForm({ ...editForm, expected_close_date: e.target.value })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="pt-2">
                    <Badge variant={deal.status === "won" ? "default" : deal.status === "lost" ? "destructive" : "secondary"}>
                      {deal.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>
              {editForm.stage_key === "lost" && (
                <div>
                  <Label>Lost Reason</Label>
                  <Input value={editForm.lost_reason ?? ""} onChange={(e) => setEditForm({ ...editForm, lost_reason: e.target.value })} />
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Textarea rows={3} value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveDeal}>Save Changes</Button>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-3 pt-3">
              <div className="border rounded p-3 space-y-2">
                <div className="text-sm font-medium">Log Activity</div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={actForm.activity_type} onValueChange={(v) => setActForm({ ...actForm, activity_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Title" value={actForm.title} onChange={(e) => setActForm({ ...actForm, title: e.target.value })} />
                </div>
                <Textarea rows={2} placeholder="Details (optional)" value={actForm.body} onChange={(e) => setActForm({ ...actForm, body: e.target.value })} />
                <Button size="sm" onClick={handleAddActivity}><Plus className="h-3 w-3 mr-1" /> Add</Button>
              </div>
              <div className="space-y-2">
                {activities.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No activity yet</div>}
                {activities.map((a) => {
                  const meta = ACTIVITY_TYPES.find((t) => t.value === a.activity_type);
                  const Icon = meta?.icon ?? MessageSquare;
                  return (
                    <div key={a.id} className="border rounded p-3 flex gap-3">
                      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm">{a.title}</div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(a.occurred_at).toLocaleDateString()}</span>
                        </div>
                        {a.body && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</div>}
                        <Badge variant="outline" className="text-xs mt-1">{meta?.label ?? a.activity_type}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-3 pt-3">
              <div className="border rounded p-3 space-y-2">
                <div className="text-sm font-medium">Add Document</div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={docForm.document_type} onValueChange={(v) => setDocForm({ ...docForm, document_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Document name" value={docForm.document_name} onChange={(e) => setDocForm({ ...docForm, document_name: e.target.value })} />
                </div>
                <Input placeholder="URL (optional)" value={docForm.document_url} onChange={(e) => setDocForm({ ...docForm, document_url: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <Select value={docForm.status} onValueChange={(v) => setDocForm({ ...docForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" placeholder="Effective" value={docForm.effective_date} onChange={(e) => setDocForm({ ...docForm, effective_date: e.target.value })} />
                  <Input type="date" placeholder="Expires" value={docForm.expiration_date} onChange={(e) => setDocForm({ ...docForm, expiration_date: e.target.value })} />
                </div>
                <Button size="sm" onClick={handleAddDoc}><Plus className="h-3 w-3 mr-1" /> Add Document</Button>
              </div>
              <div className="space-y-2">
                {documents.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No documents yet</div>}
                {documents.map((doc) => (
                  <div key={doc.id} className="border rounded p-3 flex gap-3 items-start">
                    <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm">{doc.document_name}</div>
                        <Badge variant="outline" className="text-xs">{doc.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {DOC_TYPES.find((t) => t.value === doc.document_type)?.label}
                        {doc.effective_date && ` · Effective ${doc.effective_date}`}
                        {doc.expiration_date && ` · Expires ${doc.expiration_date}`}
                      </div>
                      {doc.document_url && (
                        <a href={doc.document_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block">Open document</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
