import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format } from "date-fns";
import { toast } from "sonner";
import { Search, ShieldCheck } from "lucide-react";

type Finding = {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  recommended_fix: string | null;
  status: "open" | "resolved" | "ignored";
  source: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const SEVERITY_VARIANT: Record<string, any> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export function SecurityFindingsTab() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Finding | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["security_findings", orgId, severity, status, search],
    queryFn: async (): Promise<Finding[]> => {
      if (!orgId) return [];
      let q = supabase.from("security_findings").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
      if (severity !== "all") q = q.eq("severity", severity);
      if (status !== "all") q = q.eq("status", status);
      if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%,type.ilike.%${search}%`);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data ?? []) as Finding[];
    },
    enabled: !!orgId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: "open" | "resolved" | "ignored" }) => {
      const patch: any = { status: newStatus };
      if (newStatus === "resolved") {
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = user?.id;
      } else {
        patch.resolved_at = null;
        patch.resolved_by = null;
      }
      const { error } = await supabase.from("security_findings").update(patch).eq("id", id);
      if (error) throw error;
      // Audit log
      await supabase.from("security_audit_log").insert({
        org_id: orgId,
        user_id: user?.id,
        actor_type: "admin",
        event_type: newStatus === "resolved" ? "finding_resolved" : newStatus === "ignored" ? "finding_ignored" : "finding_reopened",
        severity: "info",
        metadata: { finding_id: id },
      });
    },
    onSuccess: () => {
      toast.success("Finding updated");
      qc.invalidateQueries({ queryKey: ["security_findings", orgId] });
      qc.invalidateQueries({ queryKey: ["security_score", orgId] });
      qc.invalidateQueries({ queryKey: ["security_attention", orgId] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search findings…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <ShieldCheck className="h-10 w-10 text-success mx-auto" />
              <div className="font-medium">No findings match these filters</div>
              <div className="text-sm text-muted-foreground">Findings appear automatically when checks detect risk, or you can resolve open items here.</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((f) => (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => setSelected(f)}>
                    <TableCell><Badge variant={SEVERITY_VARIANT[f.severity]} className="uppercase text-xs">{f.severity}</Badge></TableCell>
                    <TableCell className="text-sm">{f.type}</TableCell>
                    <TableCell className="font-medium text-sm">{f.title}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{f.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.source ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(f.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell><Button variant="ghost" size="sm">View</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={SEVERITY_VARIANT[selected.severity]} className="uppercase text-xs">{selected.severity}</Badge>
                  <Badge variant="outline" className="text-xs capitalize">{selected.status}</Badge>
                </div>
                <SheetTitle className="text-left">{selected.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4 text-sm">
                <Section label="Type">{selected.type}</Section>
                <Section label="Description">{selected.description}</Section>
                {selected.recommended_fix && <Section label="Recommended fix">{selected.recommended_fix}</Section>}
                {selected.source && <Section label="Source">{selected.source}</Section>}
                <Section label="Created">{format(new Date(selected.created_at), "PPpp")}</Section>
                <Section label="Updated">{format(new Date(selected.updated_at), "PPpp")}</Section>
                {selected.resolved_at && <Section label="Resolved">{format(new Date(selected.resolved_at), "PPpp")}</Section>}
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <Section label="Metadata">
                    <pre className="bg-muted/50 rounded p-2 text-xs overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
                  </Section>
                )}
                <div className="flex gap-2 pt-4 border-t">
                  {selected.status !== "resolved" && (
                    <Button size="sm" onClick={() => updateStatus.mutate({ id: selected.id, newStatus: "resolved" })} disabled={updateStatus.isPending}>
                      Mark resolved
                    </Button>
                  )}
                  {selected.status !== "ignored" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selected.id, newStatus: "ignored" })} disabled={updateStatus.isPending}>
                      Ignore
                    </Button>
                  )}
                  {selected.status !== "open" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selected.id, newStatus: "open" })} disabled={updateStatus.isPending}>
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
