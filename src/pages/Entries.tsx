import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useLeads, useForms } from "@/hooks/use-dashboard-data";
import { format } from "date-fns";
import { Search, ChevronRight, ArrowLeft, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-info/10 text-info border-info/20",
  qualified: "bg-success/10 text-success border-success/20",
  converted: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Entries() {
  const { orgId, orgName } = useOrg();
  const { data: forms, isLoading: formsLoading } = useForms(orgId);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);

  const selectedForm = forms?.find((f) => f.id === selectedFormId);

  // Count leads per form
  const { data: leadCounts } = useQuery({
    queryKey: ["lead_counts_by_form_entries", orgId],
    queryFn: async () => {
      if (!orgId || !forms) return {};
      const counts: Record<string, number> = {};
      for (const form of forms) {
        const { count, error } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("form_id", form.id);
        if (!error) counts[form.id] = count || 0;
      }
      return counts;
    },
    enabled: !!orgId && !!forms && forms.length > 0,
  });

  if (selectedForm) {
    return (
      <div>
        <button
          onClick={() => setSelectedFormId(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Forms
        </button>
        <h1 className="text-2xl font-bold text-foreground mb-1">{selectedForm.name}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {selectedForm.provider} · {leadCounts?.[selectedForm.id] ?? "—"} total leads
        </p>
        <FormEntries orgId={orgId} formId={selectedForm.id} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Entries</h1>
      <p className="text-sm text-muted-foreground mb-6">Lead submissions for {orgName}</p>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Forms</h3>
        </div>
        {formsLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading forms…</div>
        ) : !forms || forms.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No forms connected yet. Forms will appear here once leads start coming in.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {forms.map((form) => (
              <button
                key={form.id}
                onClick={() => setSelectedFormId(form.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{form.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {form.provider} · {leadCounts?.[form.id] ?? "—"} leads
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormEntries({ orgId, formId }: { orgId: string | null; formId: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads_by_form", orgId, formId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("org_id", orgId)
        .eq("form_id", formId)
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const filtered = (leads || []).filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (sourceFilter !== "all" && (lead.source || "direct") !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const searchable = [
        lead.page_path, lead.source, lead.service, lead.location,
        lead.status, lead.utm_source, lead.utm_campaign,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const sources = [...new Set((leads || []).map((l) => l.source || "direct"))].sort();
  const statuses = [...new Set((leads || []).map((l) => l.status))].sort();

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground mb-3">
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"}{statusFilter !== "all" || sourceFilter !== "all" || search ? " (filtered)" : ""}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading entries…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {(leads || []).length === 0 ? "No leads for this form yet." : "No entries match your filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>UTM Campaign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(lead.submitted_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] uppercase ${statusColors[lead.status] || ""}`}>
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{lead.source || "direct"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{lead.page_path || "—"}</TableCell>
                    <TableCell className="text-sm">{lead.service || "—"}</TableCell>
                    <TableCell className="text-sm">{lead.location || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lead.utm_campaign || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
