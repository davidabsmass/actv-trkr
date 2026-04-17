import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, CreditCard, Download, Heart, TrendingDown, Users, Workflow, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { downloadCsv } from "@/lib/csv-export";
import RetentionCohorts from "./RetentionCohorts";
import RetentionSettings from "./RetentionSettings";

type BillingEvent = {
  id: string;
  org_id: string | null;
  event_type: string;
  status: string | null;
  amount: number | null;
  currency: string | null;
  occurred_at: string;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
};

type Cancellation = {
  id: string;
  org_id: string;
  reason: string;
  reason_detail: string | null;
  selected_offer: string | null;
  outcome: string;
  created_at: string;
};

type Health = {
  org_id: string;
  health_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  lifecycle_stage: string;
  churn_risk_reasons: Array<{ label: string; category: string }>;
  last_login_at: string | null;
  last_data_received_at: string | null;
  cancellation_intent: boolean;
  billing_risk: boolean;
  engagement_risk: boolean;
  setup_risk: boolean;
  computed_at: string;
};

type Flow = {
  id: string;
  slug: string;
  name: string;
  trigger_type: string;
  description: string | null;
  is_active: boolean;
};

type OrgRow = { id: string; name: string };

const riskTone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

export default function RetentionDashboard() {
  const [health, setHealth] = useState<Health[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [flows, setFlows] = useState<Flow[]>([]);
  const [billing, setBilling] = useState<BillingEvent[]>([]);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const [hRes, oRes, fRes, bRes, cRes] = await Promise.all([
      supabase.from("retention_account_health").select("*").order("health_score", { ascending: true }),
      supabase.from("orgs").select("id, name"),
      supabase.from("retention_flows").select("*").order("name"),
      supabase.from("billing_recovery_events").select("*").order("occurred_at", { ascending: false }).limit(200),
      supabase.from("cancellation_feedback").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (hRes.data) setHealth(hRes.data as any);
    if (oRes.data) setOrgs(Object.fromEntries((oRes.data as OrgRow[]).map((o) => [o.id, o.name])));
    if (fRes.data) setFlows(fRes.data as any);
    if (bRes.data) setBilling(bRes.data as any);
    if (cRes.data) setCancellations(cRes.data as any);
    setLoading(false);
  };

  const toggleFlow = async (flow: Flow, next: boolean) => {
    const { error } = await supabase
      .from("retention_flows")
      .update({ is_active: next })
      .eq("id", flow.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, is_active: next } : f)));
    }
  };

  const total = health.length;
  const atRisk = health.filter((h) => h.risk_level === "high" || h.risk_level === "critical").length;
  const billingCount = health.filter((h) => h.billing_risk).length;
  const cancelCount = health.filter((h) => h.cancellation_intent).length;
  const setupCount = health.filter((h) => h.setup_risk).length;
  const avgScore = total ? Math.round(health.reduce((s, h) => s + h.health_score, 0) / total) : 0;

  // Billing recovery KPIs (last 30 days)
  const since30 = Date.now() - 30 * 24 * 3600 * 1000;
  const recentBilling = billing.filter((b) => new Date(b.occurred_at).getTime() >= since30);
  const failed30 = recentBilling.filter((b) => b.event_type === "invoice_payment_failed").length;
  const recovered30 = recentBilling.filter((b) => b.event_type === "payment_recovered" || b.event_type === "invoice_payment_succeeded").length;
  const recoveryRate = failed30 > 0 ? Math.round((recovered30 / failed30) * 100) : null;
  const unresolved = recentBilling.filter((b) => b.event_type === "invoice_payment_failed" && b.status !== "recovered").length;

  // Cancellation analytics
  const cf30 = cancellations.filter((c) => new Date(c.created_at).getTime() >= since30);
  const cfReasons = cf30.reduce<Record<string, number>>((acc, c) => { acc[c.reason] = (acc[c.reason] || 0) + 1; return acc; }, {});
  const cfOutcomes = cf30.reduce<Record<string, number>>((acc, c) => { acc[c.outcome] = (acc[c.outcome] || 0) + 1; return acc; }, {});
  const saveRate = cf30.length > 0
    ? Math.round((((cfOutcomes.saved || 0) + (cfOutcomes.paused || 0) + (cfOutcomes.downgraded || 0)) / cf30.length) * 100)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Retention</h2>
          <p className="text-sm text-muted-foreground">Lifecycle health, churn risk, and communication flows.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="at-risk">At Risk</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
          <TabsTrigger value="billing">Billing Recovery</TabsTrigger>
          <TabsTrigger value="cancellations">Cancellations</TabsTrigger>
          <TabsTrigger value="flows">Flows</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Kpi icon={Users} label="Total Accounts" value={String(total)} />
            <Kpi icon={Heart} label="Avg Health" value={`${avgScore}`} />
            <Kpi icon={AlertTriangle} label="At Risk" value={String(atRisk)} tone={atRisk > 0 ? "warn" : undefined} />
            <Kpi icon={TrendingDown} label="Billing Risk" value={String(billingCount)} tone={billingCount > 0 ? "warn" : undefined} />
            <Kpi icon={Activity} label="Setup Risk" value={String(setupCount)} />
            <Kpi icon={Workflow} label="Cancel Intent" value={String(cancelCount)} tone={cancelCount > 0 ? "warn" : undefined} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lifecycle distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(
                  health.reduce<Record<string, number>>((acc, h) => {
                    acc[h.lifecycle_stage] = (acc[h.lifecycle_stage] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([stage, count]) => (
                  <div key={stage} className="rounded border border-border bg-card p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{stage.replace(/_/g, " ")}</div>
                    <div className="text-xl font-bold text-foreground">{count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AT RISK */}
        <TabsContent value="at-risk">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Accounts at Risk ({atRisk})</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCsv(
                `accounts-at-risk-${new Date().toISOString().slice(0,10)}.csv`,
                health
                  .filter((h) => h.risk_level === "high" || h.risk_level === "critical" || h.billing_risk || h.cancellation_intent)
                  .map((h) => ({
                    account: orgs[h.org_id] || h.org_id,
                    health_score: h.health_score,
                    risk_level: h.risk_level,
                    lifecycle_stage: h.lifecycle_stage,
                    primary_reason: h.churn_risk_reasons[0]?.label || "",
                    last_login_at: h.last_login_at || "",
                    last_data_received_at: h.last_data_received_at || "",
                  })),
              )} disabled={atRisk === 0}>
                <Download className="h-3.5 w-3.5 mr-1.5" />CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    <TableHead>Primary Reason</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Last Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health
                    .filter((h) => h.risk_level === "high" || h.risk_level === "critical" || h.billing_risk || h.cancellation_intent)
                    .map((h) => (
                      <TableRow key={h.org_id}>
                        <TableCell className="font-medium">{orgs[h.org_id] || h.org_id.slice(0, 8)}</TableCell>
                        <TableCell><span className="font-mono">{h.health_score}</span></TableCell>
                        <TableCell><Badge variant={riskTone[h.risk_level]}>{h.risk_level}</Badge></TableCell>
                        <TableCell className="text-xs">{h.lifecycle_stage.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-xs">{h.churn_risk_reasons[0]?.label || "—"}</TableCell>
                        <TableCell className="text-xs">{h.last_login_at ? new Date(h.last_login_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-xs">{h.last_data_received_at ? new Date(h.last_data_received_at).toLocaleDateString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  {atRisk === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                        No accounts currently at risk. 🎉
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BILLING RECOVERY */}
        <TabsContent value="billing" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi icon={CreditCard} label="Failed (30d)" value={String(failed30)} tone={failed30 > 0 ? "warn" : undefined} />
            <Kpi icon={Heart} label="Recovered (30d)" value={String(recovered30)} />
            <Kpi icon={Activity} label="Recovery Rate" value={recoveryRate === null ? "—" : `${recoveryRate}%`} />
            <Kpi icon={AlertTriangle} label="Unresolved" value={String(unresolved)} tone={unresolved > 0 ? "warn" : undefined} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent billing events</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.slice(0, 50).map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">{new Date(b.occurred_at).toLocaleString()}</TableCell>
                      <TableCell className="font-medium text-xs">{b.org_id ? (orgs[b.org_id] || b.org_id.slice(0, 8)) : "—"}</TableCell>
                      <TableCell className="text-xs"><Badge variant={b.event_type === "invoice_payment_failed" ? "destructive" : "secondary"}>{b.event_type.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell className="text-xs">{b.status || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{b.amount != null ? `${(b.amount / 100).toFixed(2)} ${(b.currency || "").toUpperCase()}` : "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{b.stripe_invoice_id?.slice(0, 14) || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {billing.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No billing events recorded yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CANCELLATIONS */}
        <TabsContent value="cancellations" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi icon={XCircle} label="Cancellations (30d)" value={String(cf30.length)} />
            <Kpi icon={Heart} label="Save Rate" value={saveRate === null ? "—" : `${saveRate}%`} />
            <Kpi icon={Activity} label="Paused" value={String(cfOutcomes.paused || 0)} />
            <Kpi icon={Workflow} label="Downgraded" value={String(cfOutcomes.downgraded || 0)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Reasons (30d)</CardTitle></CardHeader>
              <CardContent>
                {Object.keys(cfReasons).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cancellation feedback yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(cfReasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                      <li key={reason} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{reason.replace(/_/g, " ")}</span>
                        <Badge variant="outline">{count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Outcomes (30d)</CardTitle></CardHeader>
              <CardContent>
                {Object.keys(cfOutcomes).length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(cfOutcomes).sort((a, b) => b[1] - a[1]).map(([outcome, count]) => (
                      <li key={outcome} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{outcome}</span>
                        <Badge variant={outcome === "canceled" ? "destructive" : outcome === "saved" || outcome === "paused" || outcome === "downgraded" ? "secondary" : "outline"}>{count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Recent cancellations</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Offer</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancellations.slice(0, 50).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{new Date(c.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-medium text-xs">{orgs[c.org_id] || c.org_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs capitalize">{c.reason.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">{c.selected_offer || "—"}</TableCell>
                      <TableCell className="text-xs"><Badge variant={c.outcome === "canceled" ? "destructive" : "secondary"}>{c.outcome}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{c.reason_detail || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {cancellations.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No cancellation feedback recorded yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FLOWS */}
        <TabsContent value="flows">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Communication Flows ({flows.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flow</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flows.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{f.trigger_type}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[420px]">{f.description}</TableCell>
                      <TableCell>
                        <Switch checked={f.is_active} onCheckedChange={(v) => toggleFlow(f, v)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className={`text-lg font-bold ${tone === "warn" ? "text-destructive" : "text-foreground"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
