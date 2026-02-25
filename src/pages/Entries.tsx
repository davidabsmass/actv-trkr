import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useLeads } from "@/hooks/use-dashboard-data";
import { format } from "date-fns";
import { Search, ChevronDown, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-info/10 text-info border-info/20",
  qualified: "bg-success/10 text-success border-success/20",
  converted: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Entries() {
  const { orgId, orgName } = useOrg();
  const { data: leads, isLoading } = useLeads(orgId, 200);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

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
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Entries</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Lead submissions for {orgName}
      </p>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="text-xs text-muted-foreground mb-3">
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"}{statusFilter !== "all" || sourceFilter !== "all" || search ? " (filtered)" : ""}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading entries…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {(leads || []).length === 0
              ? "No leads received yet. Once forms start submitting, entries will appear here."
              : "No entries match your filters."}
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
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {lead.page_path || "—"}
                    </TableCell>
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
    </div>
  );
}
