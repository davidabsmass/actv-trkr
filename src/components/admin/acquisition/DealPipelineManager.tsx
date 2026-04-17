import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Briefcase, DollarSign, Calendar as CalendarIcon, TrendingUp, Trash2 } from "lucide-react";
import DealDetailDialog from "./DealDetailDialog";

interface Stage {
  id: string;
  stage_key: string;
  stage_name: string;
  sort_order: number;
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
  currency: string;
  probability: number;
  expected_close_date: string | null;
  status: string;
  notes: string | null;
  source: string | null;
  created_at: string;
}

const BUYER_TYPES = [
  { value: "strategic", label: "Strategic" },
  { value: "financial", label: "Financial" },
  { value: "pe", label: "Private Equity" },
  { value: "vc", label: "Venture Capital" },
  { value: "individual", label: "Individual" },
];

export default function DealPipelineManager() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);

  // create form
  const [form, setForm] = useState({
    deal_name: "",
    buyer_name: "",
    buyer_company: "",
    buyer_email: "",
    buyer_type: "strategic",
    deal_value: "",
    probability: "10",
    expected_close_date: "",
    source: "",
    notes: "",
  });

  const loadAll = async () => {
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from("deal_pipeline_stages").select("*").order("sort_order"),
      supabase.from("deals").select("*").order("created_at", { ascending: false }),
    ]);
    setStages((s as Stage[]) ?? []);
    setDeals((d as Deal[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const stage of stages) map[stage.stage_key] = [];
    for (const d of deals) {
      if (!map[d.stage_key]) map[d.stage_key] = [];
      map[d.stage_key].push(d);
    }
    return map;
  }, [deals, stages]);

  const totals = useMemo(() => {
    const open = deals.filter((d) => d.status === "open");
    const won = deals.filter((d) => d.status === "won");
    const pipelineValue = open.reduce((sum, d) => sum + (d.deal_value || 0), 0);
    const weightedValue = open.reduce((sum, d) => sum + (d.deal_value || 0) * (d.probability / 100), 0);
    const wonValue = won.reduce((sum, d) => sum + (d.deal_value || 0), 0);
    return { pipelineValue, weightedValue, wonValue, openCount: open.length, wonCount: won.length };
  }, [deals]);

  const handleCreate = async () => {
    if (!form.deal_name.trim() || !form.buyer_name.trim()) {
      toast.error("Deal name and buyer name are required");
      return;
    }
    const { data: user } = await supabase.auth.getUser();
    const payload = {
      deal_name: form.deal_name.trim(),
      buyer_name: form.buyer_name.trim(),
      buyer_company: form.buyer_company.trim() || null,
      buyer_email: form.buyer_email.trim() || null,
      buyer_type: form.buyer_type,
      deal_value: form.deal_value ? Number(form.deal_value) : null,
      probability: Number(form.probability) || 10,
      expected_close_date: form.expected_close_date || null,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
      stage_key: "lead",
      status: "open",
      created_by_user_id: user.user?.id ?? null,
      owner_user_id: user.user?.id ?? null,
    };
    const { error } = await supabase.from("deals").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deal created");
    setCreateOpen(false);
    setForm({
      deal_name: "", buyer_name: "", buyer_company: "", buyer_email: "",
      buyer_type: "strategic", deal_value: "", probability: "10",
      expected_close_date: "", source: "", notes: "",
    });
    loadAll();
  };

  const handleStageChange = async (dealId: string, newStageKey: string) => {
    const stage = stages.find((s) => s.stage_key === newStageKey);
    const updates: Record<string, unknown> = { stage_key: newStageKey };
    if (stage?.is_won) updates.status = "won";
    else if (stage?.is_lost) updates.status = "lost";
    else updates.status = "open";

    const { error } = await supabase.from("deals").update(updates).eq("id", dealId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stage updated");
    loadAll();
  };

  const handleDelete = async (dealId: string) => {
    if (!confirm("Delete this deal? This cannot be undone.")) return;
    const { error } = await supabase.from("deals").delete().eq("id", dealId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deal deleted");
    loadAll();
  };

  const fmtMoney = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Briefcase className="h-3 w-3" /> Open Deals</div>
            <div className="text-2xl font-semibold mt-1">{totals.openCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="h-3 w-3" /> Pipeline Value</div>
            <div className="text-2xl font-semibold mt-1">{fmtMoney(totals.pipelineValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3 w-3" /> Weighted Pipeline</div>
            <div className="text-2xl font-semibold mt-1">{fmtMoney(totals.weightedValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarIcon className="h-3 w-3" /> Closed Won</div>
            <div className="text-2xl font-semibold mt-1">{fmtMoney(totals.wonValue)}</div>
            <div className="text-xs text-muted-foreground">{totals.wonCount} deals</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Deal Pipeline</CardTitle>
            <p className="text-sm text-muted-foreground">Track buyer/investor opportunities through your acquisition funnel.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Deal</Button>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {stages.map((stage) => {
              const stageDeals = dealsByStage[stage.stage_key] ?? [];
              const stageValue = stageDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
              return (
                <div
                  key={stage.id}
                  className="flex-shrink-0 w-72 bg-muted/40 rounded-md p-3 border"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingDealId) {
                      handleStageChange(draggingDealId, stage.stage_key);
                      setDraggingDealId(null);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {stage.stage_name}
                      <Badge variant="secondary" className="text-xs">{stageDeals.length}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{fmtMoney(stageValue)}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => setDraggingDealId(deal.id)}
                        onDragEnd={() => setDraggingDealId(null)}
                        onClick={() => setSelectedDealId(deal.id)}
                        className="bg-background rounded border p-2 cursor-pointer hover:border-primary transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm truncate flex-1">{deal.deal_name}</div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(deal.id); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {deal.buyer_company || deal.buyer_name}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs font-medium">{deal.deal_value ? fmtMoney(deal.deal_value) : "—"}</span>
                          <Badge variant="outline" className="text-xs h-5">{deal.probability}%</Badge>
                        </div>
                      </div>
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-6">Drop deals here</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Create Deal Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Deal</DialogTitle>
            <DialogDescription>Add a new acquisition opportunity to your pipeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Deal Name *</Label>
              <Input value={form.deal_name} onChange={(e) => setForm({ ...form, deal_name: e.target.value })} placeholder="e.g. Acme Corp - Strategic Acquisition" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Buyer Name *</Label>
                <Input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} />
              </div>
              <div>
                <Label>Buyer Company</Label>
                <Input value={form.buyer_company} onChange={(e) => setForm({ ...form, buyer_company: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} />
              </div>
              <div>
                <Label>Buyer Type</Label>
                <Select value={form.buyer_type} onValueChange={(v) => setForm({ ...form, buyer_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUYER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Deal Value (USD)</Label>
                <Input type="number" value={form.deal_value} onChange={(e) => setForm({ ...form, deal_value: e.target.value })} />
              </div>
              <div>
                <Label>Probability %</Label>
                <Input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} />
              </div>
              <div>
                <Label>Expected Close</Label>
                <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Source</Label>
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Inbound, Banker Intro, Outbound" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Deal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deal Detail */}
      {selectedDealId && (
        <DealDetailDialog
          dealId={selectedDealId}
          stages={stages}
          onClose={() => setSelectedDealId(null)}
          onChanged={loadAll}
        />
      )}
    </div>
  );
}
