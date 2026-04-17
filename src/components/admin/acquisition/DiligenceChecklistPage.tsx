import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtNumber, fmtPct } from "@/lib/acquisition-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AcquisitionData } from "./useAcquisitionData";

export default function DiligenceChecklistPage({ data }: { data: AcquisitionData }) {
  const ready = data.checklist.filter((i) => i.readiness_status === "ready").length;
  const partial = data.checklist.filter((i) => i.readiness_status === "partial").length;
  const missing = data.checklist.filter((i) => i.readiness_status === "missing").length;
  const total = data.checklist.length || 1;
  const readinessScore = ((ready + partial * 0.5) / total) * 100;

  const grouped = data.checklist.reduce<Record<string, typeof data.checklist>>((acc, i) => {
    (acc[i.section_key] ||= []).push(i);
    return acc;
  }, {});

  const updateStatus = async (id: string, readiness_status: string) => {
    const { error } = await supabase.from("diligence_checklist_items").update({ readiness_status }).eq("id", id);
    if (error) return toast.error(error.message);
    await data.reload();
  };

  const updateUrl = async (id: string, linked_document_url: string) => {
    const { error } = await supabase.from("diligence_checklist_items").update({ linked_document_url: linked_document_url || null }).eq("id", id);
    if (error) return toast.error(error.message);
    await data.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Diligence Pack Readiness</h2>
        <p className="text-sm text-muted-foreground mt-1">What's ready, partial, or missing for buyer-side diligence.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AcqKpiCard label="Readiness Score" value={fmtPct(readinessScore)} icon={CheckCircle2} tone={readinessScore >= 70 ? "success" : readinessScore >= 40 ? "warning" : "danger"} />
        <AcqKpiCard label="Ready" value={fmtNumber(ready)} icon={CheckCircle2} tone="success" />
        <AcqKpiCard label="Partial" value={fmtNumber(partial)} icon={AlertTriangle} tone="warning" />
        <AcqKpiCard label="Missing" value={fmtNumber(missing)} icon={XCircle} tone="danger" />
      </div>

      {Object.entries(grouped).map(([section, items]) => (
        <Card key={section}>
          <CardHeader><CardTitle className="text-base capitalize">{section.replace(/_/g, " ")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Document URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs">
                      {i.item_name}
                      {i.notes && <div className="text-muted-foreground">{i.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <Select value={i.readiness_status} onValueChange={(v) => updateStatus(i.id, v)}>
                        <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="missing">Missing</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="ready">Ready</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={i.linked_document_url ?? ""}
                        placeholder="https://…"
                        className="h-7 text-xs"
                        onBlur={(e) => {
                          if ((e.target.value || null) !== i.linked_document_url) {
                            updateUrl(i.id, e.target.value);
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
