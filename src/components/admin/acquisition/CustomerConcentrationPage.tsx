import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Plus, AlertTriangle, Users, DollarSign } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtCurrency, fmtPct } from "@/lib/acquisition-utils";
import { buildConcentration } from "./calculations";
import type { AcquisitionData } from "./useAcquisitionData";
import { downloadCsv } from "@/lib/csv-export";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function CustomerConcentrationPage({ data }: { data: AcquisitionData }) {
  const concentration = buildConcentration(data.contracts, data.subscribers);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_name: "", plan: "", acv: 0, mrr: 0,
    contract_start: "", contract_end: "", auto_renew: true, billing_frequency: "monthly",
    industry: "", geography: "", custom_terms: "",
  });

  const upcomingRenewals = data.contracts
    .filter((c) => c.contract_end && new Date(c.contract_end) >= new Date())
    .sort((a, b) => (a.contract_end ?? "").localeCompare(b.contract_end ?? ""));

  const submit = async () => {
    if (!form.customer_name) {
      toast({ title: "Customer name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customer_contracts").insert({
      customer_id: crypto.randomUUID(),
      ...form,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
    } as never);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setOpen(false);
    toast({ title: "Contract added" });
    await data.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Customer Quality &amp; Concentration</h2>
          <p className="text-sm text-muted-foreground mt-1">Surface fragility and upside in the customer base.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCsv("contracts.csv", data.contracts)}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Contract</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Customer Contract</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Customer Name</Label>
                  <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
                </div>
                <div>
                  <Label>Plan</Label>
                  <Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
                </div>
                <div>
                  <Label>Billing</Label>
                  <Select value={form.billing_frequency} onValueChange={(v) => setForm({ ...form, billing_frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="multi-year">Multi-year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ACV ($)</Label>
                  <Input type="number" value={form.acv} onChange={(e) => setForm({ ...form, acv: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>MRR ($)</Label>
                  <Input type="number" value={form.mrr} onChange={(e) => setForm({ ...form, mrr: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Contract Start</Label>
                  <Input type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} />
                </div>
                <div>
                  <Label>Contract End</Label>
                  <Input type="date" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} />
                </div>
                <div>
                  <Label>Industry</Label>
                  <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                </div>
                <div>
                  <Label>Geography</Label>
                  <Input value={form.geography} onChange={(e) => setForm({ ...form, geography: e.target.value })} />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Switch checked={form.auto_renew} onCheckedChange={(v) => setForm({ ...form, auto_renew: v })} />
                  <Label>Auto-renew</Label>
                </div>
                <div className="col-span-2">
                  <Label>Custom terms / notes</Label>
                  <Input value={form.custom_terms} onChange={(e) => setForm({ ...form, custom_terms: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <AcqKpiCard label="Total ARR" value={fmtCurrency(concentration.total_arr, { compact: true })} icon={DollarSign} />
        <AcqKpiCard label="Top Customer %" value={fmtPct(concentration.top_1_pct)} icon={AlertTriangle} tone={concentration.top_1_pct > 20 ? "warning" : "default"} />
        <AcqKpiCard label="Top 5 %" value={fmtPct(concentration.top_5_pct)} icon={AlertTriangle} />
        <AcqKpiCard label="Top 10 %" value={fmtPct(concentration.top_10_pct)} icon={AlertTriangle} />
        <AcqKpiCard label="Customers" value={String(data.contracts.length || data.subscribers.filter((s) => s.status === "active").length)} icon={Users} />
        <AcqKpiCard label="ACV (avg)" value={fmtCurrency(concentration.total_arr / Math.max(1, data.contracts.length || data.subscribers.filter((s) => s.status === "active").length))} icon={DollarSign} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <ConcentrationList title="By Industry" rows={concentration.by_industry} />
        <ConcentrationList title="By Geography" rows={concentration.by_geography} />
        <ConcentrationList title="By Plan" rows={concentration.by_plan} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 25 Customers by ARR</CardTitle>
        </CardHeader>
        <CardContent>
          {data.contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracts on file. Click <strong>Add Contract</strong> to populate.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">ACV</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Auto-Renew</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.contracts.slice(0, 25).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs font-medium">{c.customer_name}</TableCell>
                    <TableCell className="text-xs">{c.plan ?? "—"}</TableCell>
                    <TableCell className="text-xs">{c.industry ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(c.acv)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(c.mrr)}</TableCell>
                    <TableCell className="text-xs">{c.contract_end ?? "—"}</TableCell>
                    <TableCell className="text-xs">{c.auto_renew ? "✓" : "✗"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Renewal Calendar (next 12)</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingRenewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming renewals.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead className="text-right">ARR</TableHead>
                  <TableHead>Auto-Renew</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingRenewals.slice(0, 12).map((c) => {
                  const days = Math.ceil((new Date(c.contract_end!).getTime() - Date.now()) / 86400000);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-medium">{c.customer_name}</TableCell>
                      <TableCell className="text-xs">{c.contract_end} <Badge variant={days < 90 ? "destructive" : days < 180 ? "default" : "secondary"} className="ml-1">{days}d</Badge></TableCell>
                      <TableCell className="text-xs text-right">{fmtCurrency(c.acv)}</TableCell>
                      <TableCell className="text-xs">{c.auto_renew ? "✓" : <Badge variant="destructive">No</Badge>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConcentrationList({ title, rows }: { title: string; rows: Array<{ key: string; arr: number; pct: number }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data</p>
        ) : (
          rows.slice(0, 8).map((r) => (
            <div key={r.key} className="flex justify-between text-xs">
              <span className="text-foreground truncate max-w-[140px]">{r.key}</span>
              <span className="text-muted-foreground">{fmtCurrency(r.arr, { compact: true })} ({fmtPct(r.pct, 0)})</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
