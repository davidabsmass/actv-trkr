import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileDown, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { readinessTone } from "@/lib/acquisition-utils";
import { buildMonthlyArr, buildRetention, buildConcentration, buildFinance, diligenceReadinessScore } from "./calculations";
import type { AcquisitionData } from "./useAcquisitionData";
import { downloadCsv } from "@/lib/csv-export";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: "revenue_support", label: "Revenue Support" },
  { key: "customer_contracts", label: "Customer Contracts" },
  { key: "retention_data", label: "Retention Data" },
  { key: "operating_metrics", label: "Operating Metrics" },
  { key: "security_docs", label: "Security Documents" },
  { key: "legal_ip_docs", label: "Legal & IP Documents" },
  { key: "vendor_list", label: "Vendor List" },
  { key: "forecasting_model", label: "Forecasting Model" },
  { key: "sop_runbooks", label: "SOPs & Runbooks" },
];

export default function DiligenceExportsPage({ data }: { data: AcquisitionData }) {
  const arr = buildMonthlyArr(data.subscribers, 24);
  const retention = buildRetention(arr);
  const concentration = buildConcentration(data.contracts, data.subscribers);
  const finance = buildFinance(data.finance, arr);
  const readiness = diligenceReadinessScore(data.checklist);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("diligence_checklist_items").update({ readiness_status: status } as never).eq("id", id);
    if (error) { toast({ title: "Update failed", variant: "destructive" }); return; }
    await data.reload();
  };

  const exportSummary = () => {
    const summary = [
      { metric: "ARR", value: arr[arr.length - 1]?.arr ?? 0 },
      { metric: "MRR", value: arr[arr.length - 1]?.mrr ?? 0 },
      { metric: "Active Customers", value: arr[arr.length - 1]?.active_customers ?? 0 },
      { metric: "Top Customer % of ARR", value: concentration.top_1_pct.toFixed(2) + "%" },
      { metric: "Top 5 % of ARR", value: concentration.top_5_pct.toFixed(2) + "%" },
      { metric: "Top 10 % of ARR", value: concentration.top_10_pct.toFixed(2) + "%" },
      { metric: "Latest NRR", value: (retention.filter((r) => r.nrr != null).slice(-1)[0]?.nrr ?? 0).toFixed(1) + "%" },
      { metric: "Latest GRR", value: (retention.filter((r) => r.grr != null).slice(-1)[0]?.grr ?? 0).toFixed(1) + "%" },
      { metric: "Gross Margin %", value: finance.gross_margin_pct?.toFixed(1) + "%" },
      { metric: "Burn Rate", value: finance.burn_rate?.toFixed(0) },
      { metric: "Burn Multiple", value: finance.burn_multiple?.toFixed(2) },
      { metric: "Cash Runway (mo)", value: finance.cash_runway_months?.toFixed(1) },
      { metric: "Rule of 40", value: finance.rule_of_40?.toFixed(1) },
      { metric: "Diligence Readiness Score", value: `${readiness.score}/100` },
    ];
    downloadCsv("kpi-summary.csv", summary);
  };

  const sectionsBySection = SECTIONS.map((s) => {
    const items = data.checklist.filter((c) => c.section_key === s.key);
    const r = diligenceReadinessScore(items);
    return { ...s, items, readiness: r };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Diligence Exports</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Buyer-ready exports and a readiness checklist showing what's ready, partial, or missing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diligence Readiness Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="text-4xl font-bold">{readiness.score}<span className="text-base text-muted-foreground font-normal">/100</span></div>
            <div className="flex-1 space-y-2">
              <Progress value={readiness.score} />
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" /> {readiness.ready} Ready</span>
                <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-[hsl(var(--warning))]" /> {readiness.partial} Partial</span>
                <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive" /> {readiness.missing} Missing</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">One-Click Exports</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={exportSummary}><FileDown className="h-4 w-4 mr-1" /> KPI Summary</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("arr-bridge.csv", arr)}><Download className="h-4 w-4 mr-1" /> ARR/MRR Bridge</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("retention.csv", retention)}><Download className="h-4 w-4 mr-1" /> Retention Trend</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("contracts.csv", data.contracts)}><Download className="h-4 w-4 mr-1" /> Contract Register</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("subscribers.csv", data.subscribers)}><Download className="h-4 w-4 mr-1" /> Subscribers</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("finance-monthly.csv", data.finance)}><Download className="h-4 w-4 mr-1" /> Finance Monthly</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("risks.csv", data.risks)}><Download className="h-4 w-4 mr-1" /> Risk Register</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("vendors.csv", data.vendors)}><Download className="h-4 w-4 mr-1" /> Vendor List</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("metric-definitions.csv", data.metrics)}><Download className="h-4 w-4 mr-1" /> Metric Definitions</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("diligence-checklist.csv", data.checklist)}><Download className="h-4 w-4 mr-1" /> Checklist</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const top = concentration.top_5;
              downloadCsv("concentration-report.csv", [
                ...top.map((c) => ({ section: "top_customers", name: c.name, arr: c.arr, pct: c.pct })),
                ...concentration.by_industry.map((c) => ({ section: "by_industry", name: c.key, arr: c.arr, pct: c.pct })),
                ...concentration.by_geography.map((c) => ({ section: "by_geography", name: c.key, arr: c.arr, pct: c.pct })),
              ]);
            }}><Download className="h-4 w-4 mr-1" /> Concentration Report</Button>
          </div>
        </CardContent>
      </Card>

      {sectionsBySection.map((sec) => (
        <Card key={sec.key}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{sec.label}</span>
              <Badge variant={readinessTone(sec.readiness.score >= 80 ? "ready" : sec.readiness.score >= 40 ? "partial" : "missing")}>
                {sec.readiness.score}/100
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sec.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{item.item_name}</span>
                <Select value={item.readiness_status} onValueChange={(v) => setStatus(item.id, v)}>
                  <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="missing">Missing</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
