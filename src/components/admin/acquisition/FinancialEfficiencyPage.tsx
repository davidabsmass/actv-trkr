import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, BarChart, Bar, Legend } from "recharts";
import { Download, Plus, DollarSign, Percent, TrendingDown, Users, Clock, Target } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtCurrency, fmtPct, fmtRatio, fmtMonths, fmtNumber, monthLabel } from "@/lib/acquisition-utils";
import { buildMonthlyArr, buildFinance } from "./calculations";
import type { AcquisitionData } from "./useAcquisitionData";
import { downloadCsv } from "@/lib/csv-export";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function FinancialEfficiencyPage({ data }: { data: AcquisitionData }) {
  const arr = buildMonthlyArr(data.subscribers, 24);
  const fin = buildFinance(data.finance, arr);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    month: new Date().toISOString().slice(0, 7) + "-01",
    revenue: 0, cogs_hosting: 0, cogs_ai: 0, cogs_support: 0, cogs_other: 0,
    opex_rd: 0, opex_sm: 0, opex_ga: 0, cash_balance: 0, headcount: 0, notes: "",
  });

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.from("finance_monthly").upsert({ ...form, cash_balance: form.cash_balance || null } as never, { onConflict: "month" });
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    toast({ title: "Finance entry saved" });
    await data.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Financial Efficiency</h2>
          <p className="text-sm text-muted-foreground mt-1">Operating discipline, margin, and capital efficiency.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCsv("finance-monthly.csv", data.finance)}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Month</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Finance Month</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Month</Label>
                  <Input type="month" value={form.month.slice(0, 7)} onChange={(e) => setForm({ ...form, month: `${e.target.value}-01` })} />
                </div>
                {[
                  ["revenue", "Revenue"],
                  ["cogs_hosting", "COGS — Hosting"],
                  ["cogs_ai", "COGS — AI"],
                  ["cogs_support", "COGS — Support"],
                  ["cogs_other", "COGS — Other"],
                  ["opex_rd", "Opex — R&D"],
                  ["opex_sm", "Opex — Sales & Marketing"],
                  ["opex_ga", "Opex — G&A"],
                  ["cash_balance", "Cash Balance (end of month)"],
                  ["headcount", "Headcount"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Input type="number" value={(form as never)[k] ?? 0} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <AcqKpiCard label="Gross Margin" value={fmtPct(fin.gross_margin_pct)} icon={Percent} tone={fin.gross_margin_pct != null && fin.gross_margin_pct >= 75 ? "success" : "default"} />
        <AcqKpiCard label="Burn Rate (mo)" value={fmtCurrency(fin.burn_rate, { compact: true })} icon={TrendingDown} />
        <AcqKpiCard label="Burn Multiple" value={fmtRatio(fin.burn_multiple)} icon={TrendingDown} tone={fin.burn_multiple != null && fin.burn_multiple > 2 ? "warning" : "default"} />
        <AcqKpiCard label="Cash Runway" value={fmtMonths(fin.cash_runway_months)} icon={Clock} tone={fin.cash_runway_months != null && fin.cash_runway_months < 9 ? "danger" : "default"} />
        <AcqKpiCard label="ARR / Employee" value={fmtCurrency(fin.arr_per_employee)} icon={Users} />
        <AcqKpiCard label="Rule of 40" value={fin.rule_of_40 != null ? fin.rule_of_40.toFixed(1) : "—"} icon={Target} tone={fin.rule_of_40 != null && fin.rule_of_40 >= 40 ? "success" : "default"} />
        <AcqKpiCard label="Headcount" value={fmtNumber(fin.latest?.headcount ?? 0)} icon={Users} />
      </div>

      {fin.monthly_series.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No finance entries yet. Click <strong>Add Month</strong> to enter monthly P&amp;L data and unlock margin, burn, and runway calculations.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Margin &amp; Burn Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fin.monthly_series.map((m) => ({ ...m, month: monthLabel(m.month + "-01") }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="gross_margin_pct" name="Gross Margin %" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="burn" name="Burn ($)" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Spend Composition</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fin.monthly_series.map((m) => ({ ...m, month: monthLabel(m.month + "-01") }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="cogs" stackId="a" name="COGS" fill="hsl(var(--chart-4))" />
                    <Bar dataKey="opex" stackId="a" name="Opex" fill="hsl(var(--chart-1))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Monthly P&amp;L</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Opex</TableHead>
                      <TableHead className="text-right">GM%</TableHead>
                      <TableHead className="text-right">Burn</TableHead>
                      <TableHead className="text-right">HC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...fin.monthly_series].reverse().slice(0, 12).map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="text-xs">{monthLabel(m.month + "-01")}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(m.revenue, { compact: true })}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(m.cogs, { compact: true })}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(m.opex, { compact: true })}</TableCell>
                        <TableCell className="text-xs text-right">{fmtPct(m.gross_margin_pct)}</TableCell>
                        <TableCell className="text-xs text-right text-destructive">{fmtCurrency(m.burn, { compact: true })}</TableCell>
                        <TableCell className="text-xs text-right">{m.headcount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
