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
import { Shield, AlertTriangle, FileText, Plus } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtNumber, severityTone } from "@/lib/acquisition-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AcquisitionData } from "./useAcquisitionData";

export default function SecurityCompliancePage({ data }: { data: AcquisitionData }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", severity: "medium", summary: "" });

  const openIncidents = data.incidents.filter((i) => i.status !== "resolved" && i.status !== "closed");
  const criticalIncidents = openIncidents.filter((i) => i.severity === "critical" || i.severity === "high");

  const docsByType = data.documents.reduce<Record<string, typeof data.documents>>((acc, d) => {
    (acc[d.document_type] ||= []).push(d);
    return acc;
  }, {});

  const docsReady = data.documents.filter((d) => d.status === "ready").length;
  const docsPartial = data.documents.filter((d) => d.status === "partial").length;
  const docsMissing = data.documents.filter((d) => d.status === "missing").length;

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required");
      return;
    }
    const { error } = await supabase.from("security_incidents").insert({ title: form.title.trim(), severity: form.severity, summary: form.summary || null });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Incident logged");
    setOpen(false);
    setForm({ title: "", severity: "medium", summary: "" });
    await data.reload();
  };

  const updateDocStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("operational_documents").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await data.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Security, Compliance &amp; Risk</h2>
        <p className="text-sm text-muted-foreground mt-1">Operational maturity, incident posture, and compliance readiness.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <AcqKpiCard label="Open Incidents" value={fmtNumber(openIncidents.length)} icon={AlertTriangle} tone={openIncidents.length > 0 ? "warning" : "success"} />
        <AcqKpiCard label="Critical / High" value={fmtNumber(criticalIncidents.length)} icon={Shield} tone={criticalIncidents.length > 0 ? "danger" : "success"} />
        <AcqKpiCard label="Docs Ready" value={fmtNumber(docsReady)} icon={FileText} tone="success" />
        <AcqKpiCard label="Docs Partial" value={fmtNumber(docsPartial)} icon={FileText} tone="warning" />
        <AcqKpiCard label="Docs Missing" value={fmtNumber(docsMissing)} icon={FileText} tone={docsMissing > 0 ? "danger" : "default"} />
        <AcqKpiCard label="Vendors Tracked" value={fmtNumber(data.vendors.length)} icon={Shield} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Security Incident Log</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" />Log Incident</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Security Incident</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div>
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Summary</Label><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {data.incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents logged. Use "Log Incident" to record any security event.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Identified</TableHead>
                  <TableHead>Resolved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.incidents.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs">{i.title}</TableCell>
                    <TableCell><Badge variant={statusTone(i.severity) === "danger" ? "destructive" : "outline"}>{i.severity}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{i.status}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(i.identified_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs">{i.resolved_at ? new Date(i.resolved_at).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Operational Documents</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(docsByType).map(([type, items]) => (
            <div key={type}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{type}</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Update</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{d.title}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "ready" ? "default" : d.status === "partial" ? "secondary" : "destructive"}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={d.status} onValueChange={(v) => updateDocStatus(d.id, v)}>
                          <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="missing">Missing</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="ready">Ready</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
