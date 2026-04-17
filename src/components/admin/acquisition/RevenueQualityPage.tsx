import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, BarChart, Bar, Legend } from "recharts";
import { Download, DollarSign, TrendingUp, RefreshCw, Users } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtCurrency, fmtNumber, monthLabel } from "@/lib/acquisition-utils";
import { buildMonthlyArr } from "./calculations";
import type { AcquisitionData } from "./useAcquisitionData";
import { downloadCsv } from "@/lib/csv-export";

export default function RevenueQualityPage({ data }: { data: AcquisitionData }) {
  const arr = buildMonthlyArr(data.subscribers, 24);
  const latest = arr[arr.length - 1];

  const totalNewArr = arr.reduce((s, a) => s + a.new_arr, 0);
  const totalChurnedArr = arr.reduce((s, a) => s + a.churned_arr, 0);

  const trendData = arr.map((a) => ({
    month: monthLabel(a.month),
    ARR: a.arr,
    MRR: a.mrr,
    "New ARR": a.new_arr,
    "Churned ARR": -a.churned_arr,
    "Net New": a.net_new_arr,
  }));

  // Revenue by plan (from active subscribers)
  const planMap = new Map<string, { arr: number; count: number }>();
  data.subscribers.filter((s) => s.status === "active").forEach((s) => {
    const k = s.plan || "unknown";
    const cur = planMap.get(k) ?? { arr: 0, count: 0 };
    cur.arr += Number(s.mrr || 0) * 12;
    cur.count += 1;
    planMap.set(k, cur);
  });
  const byPlan = Array.from(planMap.entries()).map(([plan, v]) => ({ plan, ...v })).sort((a, b) => b.arr - a.arr);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Revenue Quality</h2>
          <p className="text-sm text-muted-foreground mt-1">Bridge, segments, and source-traceable revenue.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv("revenue-bridge.csv", arr)}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <AcqKpiCard label="ARR" value={fmtCurrency(latest?.arr ?? 0, { compact: true })} icon={DollarSign} />
        <AcqKpiCard label="MRR" value={fmtCurrency(latest?.mrr ?? 0, { compact: true })} icon={DollarSign} />
        <AcqKpiCard label="Net New ARR (mo)" value={fmtCurrency(latest?.net_new_arr ?? 0, { compact: true })} icon={TrendingUp} />
        <AcqKpiCard label="New ARR (mo)" value={fmtCurrency(latest?.new_arr ?? 0, { compact: true })} icon={TrendingUp} />
        <AcqKpiCard label="Churned ARR (mo)" value={fmtCurrency(latest?.churned_arr ?? 0, { compact: true })} icon={RefreshCw} />
        <AcqKpiCard label="Active Customers" value={fmtNumber(latest?.active_customers ?? 0)} icon={Users} />
        <AcqKpiCard label="Total New ARR (24mo)" value={fmtCurrency(totalNewArr, { compact: true })} icon={TrendingUp} />
        <AcqKpiCard label="Total Churn ARR (24mo)" value={fmtCurrency(totalChurnedArr, { compact: true })} icon={RefreshCw} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ARR Bridge — 24 months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ReTooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="New ARR" stackId="a" fill="hsl(var(--chart-2))" />
                <Bar dataKey="Churned ARR" stackId="a" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MRR Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ReTooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Line type="monotone" dataKey="MRR" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            {byPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active subscribers.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPlan.map((p) => (
                    <TableRow key={p.plan}>
                      <TableCell className="text-xs"><Badge variant="outline">{p.plan}</Badge></TableCell>
                      <TableCell className="text-xs text-right">{p.count}</TableCell>
                      <TableCell className="text-xs text-right">{fmtCurrency(p.arr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly ARR Bridge — Last 12 Months</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Churned</TableHead>
                    <TableHead className="text-right">Net New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arr.slice(-12).reverse().map((a) => (
                    <TableRow key={a.month}>
                      <TableCell className="text-xs">{monthLabel(a.month)}</TableCell>
                      <TableCell className="text-xs text-right">{fmtCurrency(a.arr, { compact: true })}</TableCell>
                      <TableCell className="text-xs text-right text-[hsl(var(--success))]">{fmtCurrency(a.new_arr, { compact: true })}</TableCell>
                      <TableCell className="text-xs text-right text-destructive">{fmtCurrency(a.churned_arr, { compact: true })}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{fmtCurrency(a.net_new_arr, { compact: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 text-xs text-muted-foreground">
          <p><strong>Source:</strong> ARR/MRR computed from <code className="bg-muted px-1 rounded">subscribers</code> (Stripe-synced) using subscription start and churn dates. Expansion/contraction approximated from net change minus new/churn.</p>
        </CardContent>
      </Card>
    </div>
  );
}
