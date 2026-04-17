import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Play, Bell, Settings as SettingsIcon } from "lucide-react";

interface AnomalyRule {
  id: string;
  rule_key: string;
  rule_name: string;
  description: string | null;
  metric_category: string;
  threshold_value: number | null;
  threshold_operator: string;
  severity: string;
  is_active: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
}

interface Anomaly {
  id: string;
  rule_key: string;
  severity: string;
  title: string;
  description: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  delta_pct: number | null;
  context: Record<string, unknown>;
  status: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  detected_at: string;
}

const severityColor = (s: string) => {
  if (s === "critical") return "bg-destructive text-destructive-foreground";
  if (s === "high") return "bg-orange-500 text-white";
  if (s === "medium") return "bg-yellow-500 text-white";
  return "bg-muted text-muted-foreground";
};

export default function AnomalyAlertsPanel() {
  const [rules, setRules] = useState<AnomalyRule[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState<AnomalyRule | null>(null);
  const [resolving, setResolving] = useState<Anomaly | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const [rulesRes, anomaliesRes] = await Promise.all([
      supabase.from("acquisition_anomaly_rules").select("*").order("severity", { ascending: false }),
      supabase.from("acquisition_anomalies").select("*").order("detected_at", { ascending: false }).limit(100),
    ]);
    if (rulesRes.data) setRules(rulesRes.data as AnomalyRule[]);
    if (anomaliesRes.data) setAnomalies(anomaliesRes.data as unknown as Anomaly[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runDetection = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("detect-acquisition-anomalies");
      if (error) throw error;
      const result = data as { anomalies_detected: number; anomalies_inserted: number };
      toast.success(`Detection complete: ${result.anomalies_inserted} new anomalies (${result.anomalies_detected} evaluated)`);
      await load();
    } catch (e) {
      toast.error(`Detection failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const toggleRule = async (rule: AnomalyRule, field: "is_active" | "notify_email" | "notify_in_app", value: boolean) => {
    const { error } = await supabase.from("acquisition_anomaly_rules").update({ [field]: value }).eq("id", rule.id);
    if (error) toast.error(error.message);
    else { setRules(rs => rs.map(r => r.id === rule.id ? { ...r, [field]: value } : r)); }
  };

  const saveRule = async () => {
    if (!editing) return;
    const { error } = await supabase.from("acquisition_anomaly_rules").update({
      rule_name: editing.rule_name,
      description: editing.description,
      threshold_value: editing.threshold_value,
      threshold_operator: editing.threshold_operator,
      severity: editing.severity,
    }).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rule updated");
    setEditing(null);
    load();
  };

  const acknowledge = async (a: Anomaly) => {
    const { error } = await supabase.from("acquisition_anomalies").update({
      status: "acknowledged", acknowledged_at: new Date().toISOString(),
    }).eq("id", a.id);
    if (error) toast.error(error.message);
    else { toast.success("Acknowledged"); load(); }
  };

  const resolve = async () => {
    if (!resolving) return;
    const { error } = await supabase.from("acquisition_anomalies").update({
      status: "resolved", resolved_at: new Date().toISOString(), resolution_notes: resolutionNotes,
    }).eq("id", resolving.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Resolved");
    setResolving(null);
    setResolutionNotes("");
    load();
  };

  const openCount = anomalies.filter(a => a.status === "open").length;
  const criticalCount = anomalies.filter(a => a.status === "open" && a.severity === "critical").length;

  if (loading) {
    return <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Open Alerts</div>
          <div className="text-2xl font-bold">{openCount}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Critical</div>
          <div className="text-2xl font-bold text-destructive">{criticalCount}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Active Rules</div>
          <div className="text-2xl font-bold">{rules.filter(r => r.is_active).length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Run Detection</div>
            <div className="text-xs">Manual trigger</div>
          </div>
          <Button size="sm" onClick={runDetection} disabled={running}>
            <Play className="w-3 h-3 mr-1" />{running ? "Running..." : "Run"}
          </Button>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts"><Bell className="w-3 h-3 mr-1" />Alerts</TabsTrigger>
          <TabsTrigger value="rules"><SettingsIcon className="w-3 h-3 mr-1" />Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Detected Anomalies</CardTitle></CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                  No anomalies detected. All systems healthy.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Detected</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.map(a => (
                      <TableRow key={a.id}>
                        <TableCell><Badge className={severityColor(a.severity)}>{a.severity}</Badge></TableCell>
                        <TableCell>
                          <div className="font-medium">{a.title}</div>
                          {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(a.detected_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={a.status === "open" ? "destructive" : a.status === "acknowledged" ? "secondary" : "outline"}>
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {a.status === "open" && (
                            <Button size="sm" variant="ghost" onClick={() => acknowledge(a)}>Ack</Button>
                          )}
                          {a.status !== "resolved" && (
                            <Button size="sm" variant="ghost" onClick={() => { setResolving(a); setResolutionNotes(""); }}>Resolve</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Detection Rules</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{r.rule_name}</div>
                        <div className="text-xs text-muted-foreground">{r.description}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.threshold_operator} {r.threshold_value}</TableCell>
                      <TableCell><Badge className={severityColor(r.severity)}>{r.severity}</Badge></TableCell>
                      <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => toggleRule(r, "is_active", v)} /></TableCell>
                      <TableCell><Switch checked={r.notify_email} onCheckedChange={(v) => toggleRule(r, "notify_email", v)} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r })}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Rule</DialogTitle><DialogDescription>Adjust threshold and severity.</DialogDescription></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.rule_name} onChange={(e) => setEditing({ ...editing, rule_name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Operator</Label>
                  <Select value={editing.threshold_operator} onValueChange={(v) => setEditing({ ...editing, threshold_operator: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">{">"}</SelectItem>
                      <SelectItem value=">=">{">="}</SelectItem>
                      <SelectItem value="<">{"<"}</SelectItem>
                      <SelectItem value="<=">{"<="}</SelectItem>
                      <SelectItem value="=">{"="}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Threshold</Label><Input type="number" value={editing.threshold_value ?? ""} onChange={(e) => setEditing({ ...editing, threshold_value: parseFloat(e.target.value) })} /></div>
                <div>
                  <Label>Severity</Label>
                  <Select value={editing.severity} onValueChange={(v) => setEditing({ ...editing, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveRule}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Anomaly</DialogTitle><DialogDescription>Add resolution notes for the audit trail.</DialogDescription></DialogHeader>
          <Textarea placeholder="What was done to resolve this?" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button onClick={resolve}>Mark Resolved</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
