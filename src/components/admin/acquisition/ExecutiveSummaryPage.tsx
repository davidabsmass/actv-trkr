import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DollarSign, TrendingUp, TrendingDown, Users, Shield, Target, AlertTriangle, Activity, Clock, Percent, RefreshCw } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtCurrency, fmtPct, fmtRatio, fmtMonths, fmtNumber, severityTone, monthLabel } from "@/lib/acquisition-utils";
import { buildMonthlyArr, buildRetention, buildConcentration, buildFinance, evaluateAutoRisks, diligenceReadinessScore } from "./calculations";
import type { AcquisitionData } from "./useAcquisitionData";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function ExecutiveSummaryPage({ data }: { data: AcquisitionData }) {
  const [recomputing, setRecomputing] = useState(false);

  const recompute = async () => {
    setRecomputing(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("compute-acquisition-metrics");
      if (error) throw error;
      toast({ title: "Metrics recomputed", description: `${result?.snapshots ?? 0} snapshots saved, ${result?.auto_flags ?? 0} risk flags updated.` });
      await data.reload();
    } catch (e) {
      toast({ title: "Recompute failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  };

  const arr = buildMonthlyArr(data.subscribers, 24);
  const retention = buildRetention(arr);
  const concentration = buildConcentration(data.contracts, data.subscribers);
  const finance = buildFinance(data.finance, arr);
  const autoRisks = evaluateAutoRisks(concentration, finance, retention, data.contracts);
  const readiness = diligenceReadinessScore(data.checklist);

  const latest = arr[arr.length - 1];
  const yearAgo = arr[arr.length - 13] ?? arr[0];
  const yoyArrGrowth = yearAgo && yearAgo.arr > 0 ? ((latest.arr - yearAgo.arr) / yearAgo.arr) * 100 : null;

  const latestRetention = retention.filter((r) => r.nrr != null).slice(-1)[0];
  const openRiskCount = data.risks.filter((r) => r.status === "open").length + autoRisks.length;
  const criticalRiskCount = data.risks.filter((r) => r.status === "open" && (r.severity === "critical" || r.severity === "high")).length
    + autoRisks.filter((r) => r.severity === "critical" || r.severity === "high").length;

  // Open renewal risk ARR (next 180 days)
  const sixMonths = new Date();
  sixMonths.setDate(sixMonths.getDate() + 180);
  const openRenewalArr = data.contracts
    .filter((c) => c.contract_end && new Date(c.contract_end) <= sixMonths && new Date(c.contract_end) >= new Date())
    .reduce((sum, c) => sum + Number(c.acv || 0), 0);

  const trendData = arr.map((a) => ({ month: monthLabel(a.month), arr: a.arr, mrr: a.mrr, net_new: a.net_new_arr }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Acquisition Readiness</h2>
          <p className="text-sm text-muted-foreground mt-1">
            A complete view of growth, retention, efficiency, risk, and diligence readiness. Auto-recomputed nightly.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recompute} disabled={recomputing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Recomputing…" : "Recompute now"}
        </Button>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <AcqKpiCard label="ARR" value={fmtCurrency(latest?.arr ?? 0, { compact: true })} icon={DollarSign} hint="Annualized run-rate of all active recurring subscriptions." />
        <AcqKpiCard label="MRR" value={fmtCurrency(latest?.mrr ?? 0, { compact: true })} icon={DollarSign} />
        <AcqKpiCard label="YoY ARR Growth" value={yoyArrGrowth != null ? fmtPct(yoyArrGrowth) : "—"} icon={TrendingUp} tone={yoyArrGrowth != null && yoyArrGrowth > 0 ? "success" : "default"} />
        <AcqKpiCard label="NRR" value={latestRetention?.nrr != null ? fmtPct(latestRetention.nrr) : "—"} icon={Activity} tone={latestRetention?.nrr != null && latestRetention.nrr >= 100 ? "success" : "warning"} hint="Net Revenue Retention. Buyers want >100%." />
        <AcqKpiCard label="GRR" value={latestRetention?.grr != null ? fmtPct(latestRetention.grr) : "—"} icon={Shield} hint="Gross Revenue Retention. Excludes expansion." />
        <AcqKpiCard label="Gross Margin" value={fmtPct(finance.gross_margin_pct)} icon={Percent} hint="Latest month gross margin from finance entries." />
        <AcqKpiCard label="Rule of 40" value={finance.rule_of_40 != null ? finance.rule_of_40.toFixed(1) : "—"} icon={Target} tone={finance.rule_of_40 != null && finance.rule_of_40 >= 40 ? "success" : "default"} />
        <AcqKpiCard label="Burn Multiple" value={fmtRatio(finance.burn_multiple)} icon={TrendingDown} tone={finance.burn_multiple != null && finance.burn_multiple > 2 ? "warning" : "default"} />
        <AcqKpiCard label="Cash Runway" value={fmtMonths(finance.cash_runway_months)} icon={Clock} tone={finance.cash_runway_months != null && finance.cash_runway_months < 9 ? "danger" : "default"} />
        <AcqKpiCard label="ARR / Employee" value={fmtCurrency(finance.arr_per_employee)} icon={Users} />
        <AcqKpiCard label="Top Customer % ARR" value={fmtPct(concentration.top_1_pct)} icon={AlertTriangle} tone={concentration.top_1_pct > 20 ? "warning" : "default"} hint="Single-customer concentration risk." />
        <AcqKpiCard label="Renewal Risk (180d)" value={fmtCurrency(openRenewalArr, { compact: true })} icon={AlertTriangle} />
        <AcqKpiCard label="Open Risks" value={String(openRiskCount)} icon={AlertTriangle} tone={criticalRiskCount > 0 ? "danger" : "default"} />
        <AcqKpiCard label="Diligence Score" value={`${readiness.score}/100`} icon={Shield} tone={readiness.score >= 80 ? "success" : readiness.score >= 50 ? "warning" : "danger"} />
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ARR / MRR — 24 months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ReTooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="arr" name="ARR" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="mrr" name="MRR" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Net new ARR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net New ARR — Monthly</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ReTooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Bar dataKey="net_new" name="Net New ARR" fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top 10 customers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 Customers by ARR</CardTitle>
          </CardHeader>
          <CardContent>
            {concentration.top_5.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add customer contracts to populate.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {concentration.top_5.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell className="text-xs font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-right">{fmtCurrency(c.arr)}</TableCell>
                      <TableCell className="text-xs text-right">
                        <Badge variant={c.pct > 20 ? "destructive" : "secondary"}>{fmtPct(c.pct)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Open risks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Open Risks &amp; Auto-Flags</span>
              <Badge variant={criticalRiskCount > 0 ? "destructive" : "secondary"}>{openRiskCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {autoRisks.length === 0 && data.risks.filter((r) => r.status === "open").length === 0 ? (
              <p className="text-sm text-muted-foreground">No open risks. ✓</p>
            ) : (
              <>
                {autoRisks.slice(0, 6).map((r) => (
                  <div key={r.key} className="flex items-start justify-between gap-2 text-xs border-l-2 border-l-destructive/40 pl-2">
                    <div>
                      <div className="font-medium text-foreground">{r.title}</div>
                      <div className="text-muted-foreground">{r.description}</div>
                    </div>
                    <Badge variant={severityTone(r.severity)} className="shrink-0">{r.severity}</Badge>
                  </div>
                ))}
                {data.risks.filter((r) => r.status === "open").slice(0, 4).map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-2 text-xs border-l-2 border-l-warning/40 pl-2">
                    <div>
                      <div className="font-medium text-foreground">{r.title}</div>
                      <div className="text-muted-foreground">{r.risk_type}</div>
                    </div>
                    <Badge variant={severityTone(r.severity)} className="shrink-0">{r.severity}</Badge>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diligence readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diligence Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-foreground">{readiness.score}<span className="text-base font-normal text-muted-foreground">/100</span></div>
            <div className="flex-1">
              <Progress value={readiness.score} />
              <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                <span>✓ {readiness.ready} Ready</span>
                <span>◐ {readiness.partial} Partial</span>
                <span>○ {readiness.missing} Missing</span>
                <span>Total {readiness.total}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What a buyer will see */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What a Buyer Will See</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <BuyerSummary
              title="Revenue Durability"
              status={latestRetention?.nrr != null && latestRetention.nrr >= 100 ? "strong" : "developing"}
              note={latestRetention?.nrr != null ? `NRR at ${latestRetention.nrr.toFixed(0)}%` : "Insufficient retention history"}
            />
            <BuyerSummary
              title="Growth Efficiency"
              status={finance.burn_multiple != null && finance.burn_multiple < 2 ? "strong" : finance.burn_multiple != null ? "needs work" : "no data"}
              note={finance.burn_multiple != null ? `Burn multiple ${finance.burn_multiple.toFixed(2)}×` : "Add finance entries"}
            />
            <BuyerSummary
              title="Customer Risk"
              status={concentration.top_1_pct > 20 ? "elevated" : "low"}
              note={`Top customer ${concentration.top_1_pct.toFixed(1)}% of ARR`}
            />
            <BuyerSummary
              title="Operational Maturity"
              status={readiness.score >= 80 ? "strong" : readiness.score >= 50 ? "developing" : "early"}
              note={`Diligence ${readiness.score}/100`}
            />
            <BuyerSummary
              title="Capital Position"
              status={finance.cash_runway_months != null && finance.cash_runway_months >= 18 ? "strong" : finance.cash_runway_months != null && finance.cash_runway_months >= 9 ? "adequate" : "constrained"}
              note={finance.cash_runway_months != null ? `${finance.cash_runway_months.toFixed(1)} months runway` : "Add cash balance"}
            />
            <BuyerSummary
              title="Open Critical Issues"
              status={criticalRiskCount === 0 ? "strong" : "needs work"}
              note={`${criticalRiskCount} high/critical risks`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BuyerSummary({ title, status, note }: { title: string; status: string; note: string }) {
  const tone = status === "strong" ? "default" : status === "developing" || status === "adequate" ? "secondary" : "destructive";
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="text-xs text-muted-foreground">{title}</div>
      <Badge variant={tone} className="mt-1 capitalize">{status}</Badge>
      <div className="text-xs text-foreground mt-1.5">{note}</div>
    </div>
  );
}
