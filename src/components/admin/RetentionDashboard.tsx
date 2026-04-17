import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, Heart, TrendingDown, Users, Workflow } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const [hRes, oRes, fRes] = await Promise.all([
      supabase.from("retention_account_health").select("*").order("health_score", { ascending: true }),
      supabase.from("orgs").select("id, name"),
      supabase.from("retention_flows").select("*").order("name"),
    ]);
    if (hRes.data) setHealth(hRes.data as any);
    if (oRes.data) setOrgs(Object.fromEntries((oRes.data as OrgRow[]).map((o) => [o.id, o.name])));
    if (fRes.data) setFlows(fRes.data as any);
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
  const billing = health.filter((h) => h.billing_risk).length;
  const cancel = health.filter((h) => h.cancellation_intent).length;
  const setup = health.filter((h) => h.setup_risk).length;
  const engagement = health.filter((h) => h.engagement_risk).length;
  const avgScore = total ? Math.round(health.reduce((s, h) => s + h.health_score, 0) / total) : 0;

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
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="at-risk">Accounts at Risk</TabsTrigger>
          <TabsTrigger value="flows">Communication Flows</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Kpi icon={Users} label="Total Accounts" value={String(total)} />
            <Kpi icon={Heart} label="Avg Health" value={`${avgScore}`} />
            <Kpi icon={AlertTriangle} label="At Risk" value={String(atRisk)} tone={atRisk > 0 ? "warn" : undefined} />
            <Kpi icon={TrendingDown} label="Billing Risk" value={String(billing)} tone={billing > 0 ? "warn" : undefined} />
            <Kpi icon={Activity} label="Setup Risk" value={String(setup)} />
            <Kpi icon={Workflow} label="Cancel Intent" value={String(cancel)} tone={cancel > 0 ? "warn" : undefined} />
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
            <CardHeader>
              <CardTitle className="text-base">Accounts at Risk ({atRisk})</CardTitle>
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
