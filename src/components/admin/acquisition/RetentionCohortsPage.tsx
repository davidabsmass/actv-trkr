import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend } from "recharts";
import { Download, Activity, Shield, TrendingDown } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtPct, monthLabel, fmtCurrency } from "@/lib/acquisition-utils";
import { buildMonthlyArr, buildRetention } from "./calculations";
import type { AcquisitionData } from "./useAcquisitionData";
import { downloadCsv } from "@/lib/csv-export";
import RetentionCohorts from "../RetentionCohorts";

export default function RetentionCohortsPage({ data }: { data: AcquisitionData }) {
  const arr = buildMonthlyArr(data.subscribers, 24);
  const retention = buildRetention(arr).filter((r) => r.starting_arr > 0);

  const latest = retention[retention.length - 1];
  const trend = retention.map((r) => ({
    month: monthLabel(r.month),
    NRR: r.nrr ?? null,
    GRR: r.grr ?? null,
    "Logo Churn": r.logo_churn ?? null,
  }));

  // Aggregate churn 12mo
  const last12 = retention.slice(-12);
  const totalChurnedArr = last12.reduce((s, r) => s + r.churned_arr, 0);
  const totalStartingArr = last12.reduce((s, r) => s + r.starting_arr, 0);
  const blendedRevenueChurn = totalStartingArr > 0 ? (totalChurnedArr / totalStartingArr) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Retention &amp; Cohorts</h2>
          <p className="text-sm text-muted-foreground mt-1">Durability of revenue over time, segmented and cohorted.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv("retention-monthly.csv", retention)}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AcqKpiCard label="NRR (latest)" value={fmtPct(latest?.nrr)} icon={Activity} tone={latest?.nrr != null && latest.nrr >= 100 ? "success" : "warning"} hint="Net Revenue Retention. Buyers expect >100%." />
        <AcqKpiCard label="GRR (latest)" value={fmtPct(latest?.grr)} icon={Shield} hint="Gross Revenue Retention." />
        <AcqKpiCard label="Logo Churn (latest)" value={fmtPct(latest?.logo_churn)} icon={TrendingDown} />
        <AcqKpiCard label="Revenue Churn (TTM)" value={fmtPct(blendedRevenueChurn)} icon={TrendingDown} hint="Blended revenue churn over trailing 12 months." />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">NRR / GRR / Logo Churn Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <ReTooltip formatter={(v: number) => v != null ? `${v.toFixed(1)}%` : "—"} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="NRR" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="GRR" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="Logo Churn" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Reuse existing cohort heatmap */}
      <RetentionCohorts />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Retention Detail (last 12)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Starting ARR</TableHead>
                  <TableHead className="text-right">Churned ARR</TableHead>
                  <TableHead className="text-right">NRR</TableHead>
                  <TableHead className="text-right">GRR</TableHead>
                  <TableHead className="text-right">Logo Churn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retention.slice(-12).reverse().map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="text-xs">{monthLabel(r.month)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(r.starting_arr, { compact: true })}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(r.churned_arr, { compact: true })}</TableCell>
                    <TableCell className="text-xs text-right">{fmtPct(r.nrr)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtPct(r.grr)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtPct(r.logo_churn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
