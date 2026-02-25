import { useState, useMemo } from "react";
import { useOrg } from "@/hooks/use-org";
import { useForms } from "@/hooks/use-dashboard-data";
import { format, subDays, startOfDay } from "date-fns";
import { Search, ChevronRight, ArrowLeft, FileText, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from "recharts";

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

  const { data: leadCounts } = useQuery({
    queryKey: ["lead_counts_by_form_entries", orgId],
    queryFn: async () => {
      if (!orgId || !forms) return {};
      const counts: Record<string, number> = {};
      for (const form of forms) {
        const { count, error } = await supabase
          .from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).eq("form_id", form.id);
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

        <Tabs defaultValue="entries" className="space-y-4">
          <TabsList>
            <TabsTrigger value="entries" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Entries
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
          </TabsList>
          <TabsContent value="entries">
            <FormEntries orgId={orgId} formId={selectedForm.id} />
          </TabsContent>
          <TabsContent value="analytics">
            <FormAnalytics orgId={orgId} formId={selectedForm.id} />
          </TabsContent>
        </Tabs>
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

/* ─── Entries Tab ─── */
function FormEntries({ orgId, formId }: { orgId: string | null; formId: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Fetch leads for this form
  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["leads_by_form", orgId, formId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads").select("id, submitted_at, status, source")
        .eq("org_id", orgId).eq("form_id", formId)
        .order("submitted_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch field data for those leads
  const leadIds = (leads || []).map((l) => l.id);
  const { data: fieldsRaw } = useQuery({
    queryKey: ["lead_fields_flat", orgId, formId, leadIds.length],
    queryFn: async () => {
      if (!orgId || leadIds.length === 0) return [];
      // Fetch in batches of 50 to avoid URI length limits
      const results: any[] = [];
      for (let i = 0; i < leadIds.length; i += 50) {
        const batch = leadIds.slice(i, i + 50);
        const { data, error } = await supabase
          .from("lead_fields_flat").select("lead_id, field_key, field_label, value_text")
          .eq("org_id", orgId).in("lead_id", batch);
        if (error) throw error;
        if (data) results.push(...data);
      }
      return results;
    },
    enabled: !!orgId && leadIds.length > 0,
  });

  // Derive dynamic columns from field data
  const { fieldColumns, leadFieldMap } = useMemo(() => {
    if (!fieldsRaw || fieldsRaw.length === 0) return { fieldColumns: [], leadFieldMap: new Map() };

    // Build map: leadId -> { fieldKey: value }
    const map = new Map<string, Record<string, string>>();
    const columnOrder = new Map<string, { key: string; label: string; count: number }>();

    for (const f of fieldsRaw) {
      if (!map.has(f.lead_id)) map.set(f.lead_id, {});
      map.get(f.lead_id)![f.field_key] = f.value_text || "";

      if (!columnOrder.has(f.field_key)) {
        columnOrder.set(f.field_key, { key: f.field_key, label: f.field_label || f.field_key, count: 0 });
      }
      columnOrder.get(f.field_key)!.count++;
    }

    // Sort columns by frequency (most common first), take top 6
    const cols = [...columnOrder.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { fieldColumns: cols, leadFieldMap: map };
  }, [fieldsRaw]);

  const filtered = (leads || []).filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fields = leadFieldMap.get(lead.id);
      const searchable = [
        lead.source, lead.status,
        ...(fields ? Object.values(fields) : []),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

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
      </div>

      <div className="text-xs text-muted-foreground mb-3">
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"}{statusFilter !== "all" || search ? " (filtered)" : ""}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {leadsLoading ? (
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
                  {fieldColumns.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => {
                  const fields = leadFieldMap.get(lead.id) || {};
                  return (
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
                      {fieldColumns.map((col) => (
                        <TableCell key={col.key} className="text-sm max-w-[200px] truncate">
                          {fields[col.key] || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Analytics Tab ─── */
function FormAnalytics({ orgId, formId }: { orgId: string | null; formId: string }) {
  const days = 30;
  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  const { data: leads } = useQuery({
    queryKey: ["leads_analytics", orgId, formId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("submitted_at, status, source")
        .eq("org_id", orgId).eq("form_id", formId)
        .gte("submitted_at", `${startDate}T00:00:00Z`)
        .lte("submitted_at", `${endDate}T23:59:59.999Z`)
        .order("submitted_at");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { dailyData, sourceData, statusData, totalLeads } = useMemo(() => {
    if (!leads || leads.length === 0) return { dailyData: [], sourceData: [], statusData: [], totalLeads: 0 };

    const byDay: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const l of leads) {
      const day = format(new Date(l.submitted_at), "yyyy-MM-dd");
      byDay[day] = (byDay[day] || 0) + 1;

      const src = l.source || "direct";
      bySource[src] = (bySource[src] || 0) + 1;

      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    }

    const dailyData = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, dateLabel: format(new Date(date), "MMM d"), leads: count }));

    const sourceData = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));

    const statusData = Object.entries(byStatus)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count }));

    return { dailyData, sourceData, statusData, totalLeads: leads.length };
  }, [leads]);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Last {days} Days</p>
          <p className="text-2xl font-bold font-mono-data text-foreground">{totalLeads}</p>
          <p className="text-xs text-muted-foreground">leads</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Daily Avg</p>
          <p className="text-2xl font-bold font-mono-data text-foreground">
            {days > 0 ? (totalLeads / days).toFixed(1) : "0"}
          </p>
          <p className="text-xs text-muted-foreground">leads/day</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Top Source</p>
          <p className="text-lg font-semibold text-foreground truncate">
            {sourceData[0]?.source || "—"}
          </p>
          <p className="text-xs text-muted-foreground">{sourceData[0]?.count ?? 0} leads</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Sources</p>
          <p className="text-2xl font-bold font-mono-data text-foreground">{sourceData.length}</p>
          <p className="text-xs text-muted-foreground">unique</p>
        </div>
      </div>

      {/* Leads over time */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Leads Over Time</h4>
        {dailyData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No data for this period.</p>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
                    borderRadius: "8px", fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="leads" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#leadsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Source + Status breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">By Source</h4>
          {sourceData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data.</p>
          ) : (
            <div className="space-y-2">
              {sourceData.map((s) => (
                <div key={s.source} className="flex items-center justify-between">
                  <span className="text-sm text-foreground truncate max-w-[60%]">{s.source}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${totalLeads > 0 ? (s.count / totalLeads) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono-data text-muted-foreground w-8 text-right">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">By Status</h4>
          {statusData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data.</p>
          ) : (
            <div className="space-y-2">
              {statusData.map((s) => (
                <div key={s.status} className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-[10px] uppercase ${statusColors[s.status] || ""}`}>
                    {s.status}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-chart-2"
                        style={{ width: `${totalLeads > 0 ? (s.count / totalLeads) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono-data text-muted-foreground w-8 text-right">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
