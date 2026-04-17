import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtNumber } from "@/lib/acquisition-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AcquisitionData, ReconciliationRow } from "./useAcquisitionData";

export default function ReconciliationPage({ data }: { data: AcquisitionData }) {
  const [editing, setEditing] = useState<ReconciliationRow | null>(null);
  const [form, setForm] = useState({ status: "pending", discrepancy_amount: "", notes: "" });

  const open = (row: ReconciliationRow) => {
    setEditing(row);
    setForm({
      status: row.status,
      discrepancy_amount: row.discrepancy_amount != null ? String(row.discrepancy_amount) : "",
      notes: row.notes ?? "",
    });
  };

  const submit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("reconciliation_status")
      .update({
        status: form.status,
        discrepancy_amount: form.discrepancy_amount ? Number(form.discrepancy_amount) : null,
        notes: form.notes || null,
        last_reconciled_at: form.status === "reconciled" ? new Date().toISOString() : editing.last_reconciled_at,
      })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditing(null);
    await data.reload();
  };

  const reconciled = data.reconciliation.filter((r) => r.status === "reconciled").length;
  const pending = data.reconciliation.filter((r) => r.status === "pending").length;
  const flagged = data.reconciliation.filter((r) => r.status === "discrepancy").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Data Reconciliation</h2>
        <p className="text-sm text-muted-foreground mt-1">Validate that dashboard metrics tie back to source systems.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AcqKpiCard label="Total Metrics" value={fmtNumber(data.reconciliation.length)} icon={Clock} />
        <AcqKpiCard label="Reconciled" value={fmtNumber(reconciled)} icon={CheckCircle2} tone="success" />
        <AcqKpiCard label="Pending" value={fmtNumber(pending)} icon={Clock} tone="warning" />
        <AcqKpiCard label="Discrepancies" value={fmtNumber(flagged)} icon={AlertTriangle} tone={flagged > 0 ? "danger" : "default"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Reconciliation Status</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Discrepancy</TableHead>
                <TableHead>Last Reconciled</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reconciliation.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium uppercase">{r.metric_key}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "reconciled" ? "default" : r.status === "discrepancy" ? "destructive" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right">{r.discrepancy_amount != null ? Number(r.discrepancy_amount).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-xs">{r.last_reconciled_at ? new Date(r.last_reconciled_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{r.notes ?? "—"}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => open(r)}>Edit</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reconcile {editing?.metric_key.toUpperCase()}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reconciled">Reconciled</SelectItem>
                  <SelectItem value="discrepancy">Discrepancy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Discrepancy amount</Label><Input type="number" value={form.discrepancy_amount} onChange={(e) => setForm({ ...form, discrepancy_amount: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
