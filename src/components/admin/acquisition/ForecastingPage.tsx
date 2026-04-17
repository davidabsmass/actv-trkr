import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TrendingUp, Calendar, AlertTriangle, Plus } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtMoney, fmtPct } from "@/lib/acquisition-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AcquisitionData } from "./useAcquisitionData";

export default function ForecastingPage({ data }: { data: AcquisitionData }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ period_label: "", scenario: "base", metric_key: "arr", forecast_value: "", actual_value: "", notes: "" });

  const submit = async () => {
    if (!form.period_label.trim() || !form.metric_key.trim()) return toast.error("Period and metric required");
    const payload = {
      period_label: form.period_label.trim(),
      scenario: form.scenario,
      metric_key: form.metric_key,
      forecast_value: form.forecast_value ? Number(form.forecast_value) : null,
      actual_value: form.actual_value ? Number(form.actual_value) : null,
      notes: form.notes || null,
    };
    const { error } = await supabase.from("forecast_assumptions").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Forecast saved");
    setOpen(false);
    setForm({ period_label: "", scenario: "base", metric_key: "arr", forecast_value: "", actual_value: "", notes: "" });
    await data.reload();
  };

  const now = new Date();
  const next180 = new Date(now.getTime() + 180 * 86400000);
  const upcomingRenewals = data.contracts.filter((c) => c.contract_end && new Date(c.contract_end) <= next180 && new Date(c.contract_end) >= now);
  const renewalArr = upcomingRenewals.reduce((s, c) => s + (c.mrr || 0) * 12, 0);

  const baseForecasts = data.forecasts.filter((f) => f.scenario === "base");
  const variances = baseForecasts
    .filter((f) => f.forecast_value != null && f.actual_value != null)
    .map((f) => {
      const v = ((Number(f.actual_value) - Number(f.forecast_value)) / Number(f.forecast_value)) * 100;
      return { ...f, variance: v };
    });
  const avgVariance = variances.length > 0 ? variances.reduce((s, v) => s + Math.abs(v.variance), 0) / variances.length : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Forecasting &amp; Planning</h2>
        <p className="text-sm text-muted-foreground mt-1">Predictability and operational planning quality.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AcqKpiCard label="Renewal ARR (180d)" value={fmtMoney(renewalArr)} icon={Calendar} hint="ARR up for renewal in next 180 days." />
        <AcqKpiCard label="Renewals Due" value={String(upcomingRenewals.length)} icon={Calendar} />
        <AcqKpiCard label="Avg Forecast Variance" value={avgVariance != null ? fmtPct(avgVariance) : "—"} icon={TrendingUp} tone={avgVariance != null && avgVariance > 15 ? "warning" : "success"} />
        <AcqKpiCard label="Open Risk Flags" value={String(data.risks.filter((r) => r.status === "open").length)} icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Forecast Assumptions</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" />Add Forecast</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Forecast Entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Period (e.g. 2026-Q2)</Label><Input value={form.period_label} onChange={(e) => setForm({ ...form, period_label: e.target.value })} /></div>
                <div>
                  <Label>Scenario</Label>
                  <Select value={form.scenario} onValueChange={(v) => setForm({ ...form, scenario: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">Base</SelectItem>
                      <SelectItem value="upside">Upside</SelectItem>
                      <SelectItem value="downside">Downside</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Metric</Label>
                  <Select value={form.metric_key} onValueChange={(v) => setForm({ ...form, metric_key: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="arr">ARR</SelectItem>
                      <SelectItem value="mrr">MRR</SelectItem>
                      <SelectItem value="new_arr">New ARR</SelectItem>
                      <SelectItem value="expansion_arr">Expansion ARR</SelectItem>
                      <SelectItem value="churn_arr">Churn ARR</SelectItem>
                      <SelectItem value="cash_balance">Cash Balance</SelectItem>
                      <SelectItem value="headcount">Headcount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Forecast</Label><Input type="number" value={form.forecast_value} onChange={(e) => setForm({ ...form, forecast_value: e.target.value })} /></div>
                  <div><Label>Actual</Label><Input type="number" value={form.actual_value} onChange={(e) => setForm({ ...form, actual_value: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {data.forecasts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No forecast entries. Add quarterly or monthly forecasts with optional actuals to track variance.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.forecasts.map((f) => {
                  const variance = f.forecast_value != null && f.actual_value != null
                    ? ((Number(f.actual_value) - Number(f.forecast_value)) / Number(f.forecast_value)) * 100
                    : null;
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs">{f.period_label}</TableCell>
                      <TableCell><Badge variant="outline">{f.scenario}</Badge></TableCell>
                      <TableCell className="text-xs">{f.metric_key}</TableCell>
                      <TableCell className="text-xs text-right">{f.forecast_value != null ? Number(f.forecast_value).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs text-right">{f.actual_value != null ? Number(f.actual_value).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs text-right">{variance != null ? `${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Renewal Calendar (Next 180 Days)</CardTitle></CardHeader>
        <CardContent>
          {upcomingRenewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracts ending in the next 180 days.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">ACV</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Auto-Renew</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingRenewals.slice(0, 25).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs font-medium">{c.customer_name}</TableCell>
                    <TableCell className="text-xs">{c.plan ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right">{fmtMoney(c.acv)}</TableCell>
                    <TableCell className="text-xs">{c.contract_end ? new Date(c.contract_end).toLocaleDateString() : "—"}</TableCell>
                    <TableCell><Badge variant={c.auto_renew ? "default" : "destructive"}>{c.auto_renew ? "Yes" : "No"}</Badge></TableCell>
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
