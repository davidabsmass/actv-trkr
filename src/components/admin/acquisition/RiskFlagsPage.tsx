import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Plus, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { severityTone } from "@/lib/acquisition-utils";
import { buildMonthlyArr, buildRetention, buildConcentration, buildFinance, evaluateAutoRisks } from "./calculations";
import type { AcquisitionData } from "./useAcquisitionData";
import { downloadCsv } from "@/lib/csv-export";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const RISK_TYPES = ["concentration", "retention", "financial", "security", "legal", "founder", "vendor", "compliance", "technical", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "mitigating", "resolved", "accepted"];

export default function RiskFlagsPage({ data }: { data: AcquisitionData }) {
  const arr = buildMonthlyArr(data.subscribers, 24);
  const retention = buildRetention(arr);
  const concentration = buildConcentration(data.contracts, data.subscribers);
  const finance = buildFinance(data.finance, arr);
  const autoRisks = evaluateAutoRisks(concentration, finance, retention, data.contracts);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ risk_type: "other", severity: "medium", title: "", description: "", status: "open", mitigation_plan: "", due_date: "" });

  const open_ = data.risks.filter((r) => r.status === "open");
  const critical = open_.filter((r) => r.severity === "critical").length + autoRisks.filter((r) => r.severity === "critical").length;
  const high = open_.filter((r) => r.severity === "high").length + autoRisks.filter((r) => r.severity === "high").length;

  const submit = async () => {
    if (!form.title) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.from("acquisition_risk_flags").insert({ ...form, due_date: form.due_date || null } as never);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    setForm({ risk_type: "other", severity: "medium", title: "", description: "", status: "open", mitigation_plan: "", due_date: "" });
    toast({ title: "Risk added" });
    await data.reload();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("acquisition_risk_flags").update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null } as never).eq("id", id);
    if (error) { toast({ title: "Update failed", variant: "destructive" }); return; }
    await data.reload();
  };

  const promoteAutoRisk = async (r: typeof autoRisks[number]) => {
    const { error } = await supabase.from("acquisition_risk_flags").insert({
      risk_type: r.risk_type, severity: r.severity, title: r.title, description: r.description,
      auto_generated: true, status: "open",
    } as never);
    if (error) { toast({ title: "Save failed", variant: "destructive" }); return; }
    toast({ title: "Risk added to register" });
    await data.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Risk Flags &amp; Register</h2>
          <p className="text-sm text-muted-foreground mt-1">Auto-detected and manually tracked risks across the business.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCsv("risk-register.csv", data.risks)}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Risk</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Risk</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={form.risk_type} onValueChange={(v) => setForm({ ...form, risk_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{RISK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Severity</Label>
                    <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SEVERITIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                </div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Mitigation Plan</Label><Textarea value={form.mitigation_plan} onChange={(e) => setForm({ ...form, mitigation_plan: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AcqKpiCard label="Open Risks" value={String(open_.length + autoRisks.length)} icon={AlertTriangle} tone={critical > 0 ? "danger" : "default"} />
        <AcqKpiCard label="Critical" value={String(critical)} icon={AlertTriangle} tone={critical > 0 ? "danger" : "default"} />
        <AcqKpiCard label="High" value={String(high)} icon={AlertTriangle} tone={high > 0 ? "warning" : "default"} />
        <AcqKpiCard label="Auto-Detected" value={String(autoRisks.length)} icon={Sparkles} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Auto-Detected Risks</CardTitle></CardHeader>
        <CardContent>
          {autoRisks.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" /> No auto-detected risks. Business is healthy on key thresholds.</p>
          ) : (
            <div className="space-y-2">
              {autoRisks.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-2 border border-border rounded-lg p-3 bg-card">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={severityTone(r.severity)}>{r.severity}</Badge>
                      <Badge variant="outline">{r.risk_type}</Badge>
                      <span className="text-sm font-medium">{r.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => promoteAutoRisk(r)}>Add to Register</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Risk Register</CardTitle></CardHeader>
        <CardContent>
          {data.risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No risks logged.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.risks.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium max-w-[260px]">{r.title}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline">{r.risk_type}</Badge></TableCell>
                    <TableCell className="text-xs"><Badge variant={severityTone(r.severity)}>{r.severity}</Badge></TableCell>
                    <TableCell className="text-xs">
                      <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                        <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs">{r.due_date ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{r.auto_generated ? <Sparkles className="inline h-3 w-3" /> : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
