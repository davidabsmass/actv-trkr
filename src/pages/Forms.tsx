import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useForms } from "@/hooks/use-dashboard-data";
import { format, subDays, startOfDay } from "date-fns";
import { Search, ChevronRight, ArrowLeft, FileText, BarChart3, Settings2, Download, CalendarIcon, Archive, ArchiveRestore, AlertCircle, RefreshCw, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { FormLeaderboard } from "@/components/dashboard/FormLeaderboard";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-info/10 text-info border-info/20",
  qualified: "bg-success/10 text-success border-success/20",
  converted: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

const categoryColors: Record<string, string> = {
  lead: "text-primary border-primary/20",
  newsletter: "text-info border-info/20",
  survey: "text-warning border-warning/20",
  other: "text-muted-foreground border-border",
};

const weightLabels: Record<string, string> = {
  "0": "Excluded (0×)",
  "0.25": "Low (0.25×)",
  "0.5": "Half (0.5×)",
  "0.75": "Medium (0.75×)",
  "1": "Full (1×)",
};

/* ─── Summary Row ─── */
function FormsSummary({ orgId, days }: { orgId: string | null; days: number }) {
  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  const { data: totalSubmissions } = useQuery({
    queryKey: ["total_submissions", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count, error } = await supabase
        .from("leads").select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .neq("status", "trashed")
        .gte("submitted_at", `${startDate}T00:00:00Z`)
        .lte("submitted_at", `${endDate}T23:59:59.999Z`);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!orgId,
  });

  const { data: failureCount } = useQuery({
    queryKey: ["form_failures", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count, error } = await supabase
        .from("form_submission_logs").select("*", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "fail")
        .gte("occurred_at", `${startDate}T00:00:00Z`)
        .lte("occurred_at", `${endDate}T23:59:59.999Z`);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!orgId,
  });

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="glass-card p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Total Submissions</p>
        <p className="text-2xl font-bold font-mono-data text-foreground">{totalSubmissions ?? "—"}</p>
        <p className="text-xs text-muted-foreground">Last {days} days</p>
      </div>
      <div className="glass-card p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Failures</p>
          {(failureCount ?? 0) > 0 && <AlertCircle className="h-3 w-3 text-destructive" />}
        </div>
        <p className={`text-2xl font-bold font-mono-data ${(failureCount ?? 0) > 0 ? "text-destructive" : "text-foreground"}`}>
          {failureCount ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground">Last {days} days</p>
      </div>
    </div>
  );
}

export default function Forms() {
  const { orgId, orgName } = useOrg();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: forms, isLoading: formsLoading } = useForms(orgId);
  const selectedFormId = searchParams.get("selected") || null;
  const setSelectedFormId = (id: string | null) => {
    if (id) {
      setSearchParams({ selected: id }, { replace: true });
    } else {
      searchParams.delete("selected");
      setSearchParams(searchParams, { replace: true });
    }
  };
  const [showArchived, setShowArchived] = useState(false);
  const [days, setDays] = useState(30);

  const endDate = format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = format(subDays(startOfDay(new Date()), days), "yyyy-MM-dd");

  const { data: realtimeData } = useRealtimeDashboard(orgId, startDate, endDate);

  const { data: leadsData } = useQuery({
    queryKey: ["leads_for_forms_page", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("form_id, submitted_at, source, session_id")
        .eq("org_id", orgId)
        .gte("submitted_at", `${startDate}T00:00:00Z`)
        .lte("submitted_at", `${endDate}T23:59:59.999Z`);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Query device data from pageviews joined via session_id from leads
  const { data: deviceData } = useQuery({
    queryKey: ["form_device_splits", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId || !leadsData || leadsData.length === 0) return {};
      // Get unique session_ids from leads, grouped by form_id
      const formSessions: Record<string, Set<string>> = {};
      leadsData.forEach((l) => {
        if (l.session_id) {
          if (!formSessions[l.form_id]) formSessions[l.form_id] = new Set();
          formSessions[l.form_id].add(l.session_id);
        }
      });

      const allSessionIds = [...new Set(leadsData.map((l) => l.session_id).filter(Boolean))] as string[];
      if (allSessionIds.length === 0) return {};

      // Query pageviews for these sessions to get device info
      const { data: pvData, error } = await supabase
        .from("pageviews")
        .select("session_id, device")
        .eq("org_id", orgId)
        .in("session_id", allSessionIds.slice(0, 500));
      if (error) throw error;

      // Build session -> device map (use first pageview's device per session)
      const sessionDevice: Record<string, string> = {};
      (pvData || []).forEach((pv) => {
        if (pv.session_id && pv.device && !sessionDevice[pv.session_id]) {
          sessionDevice[pv.session_id] = pv.device;
        }
      });

      // Aggregate per form
      const result: Record<string, { desktop: number; mobile: number; tablet: number }> = {};
      Object.entries(formSessions).forEach(([formId, sessions]) => {
        const counts = { desktop: 0, mobile: 0, tablet: 0 };
        sessions.forEach((sid) => {
          const d = sessionDevice[sid] || "desktop";
          if (d === "mobile") counts.mobile++;
          else if (d === "tablet") counts.tablet++;
          else counts.desktop++;
        });
        result[formId] = counts;
      });
      return result;
    },
    enabled: !!orgId && !!leadsData && leadsData.length > 0,
  });

  const selectedForm = forms?.find((f) => f.id === selectedFormId);
  const activeForms = forms?.filter((f) => !f.archived) || [];
  const archivedForms = forms?.filter((f) => f.archived) || [];
  const displayedForms = showArchived ? archivedForms : activeForms;

  const { data: leadCounts } = useQuery({
    queryKey: ["lead_counts_by_form_entries", orgId],
    queryFn: async () => {
      if (!orgId || !forms) return {};
      const counts: Record<string, number> = {};
      for (const form of forms) {
        const { count, error } = await supabase
          .from("leads").select("*", { count: "exact", head: true })
          .eq("org_id", orgId).eq("form_id", form.id).neq("status", "trashed");
        if (!error) counts[form.id] = count || 0;
      }
      return counts;
    },
    enabled: !!orgId && !!forms && forms.length > 0,
  });

  if (selectedForm) {
    return (
      <FormDetail
        form={selectedForm}
        orgId={orgId}
        leadCount={leadCounts?.[selectedForm.id] ?? 0}
        onBack={() => setSelectedFormId(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Forms</h1>
          <p className="text-sm text-muted-foreground">Lead submissions for {orgName}</p>
        </div>
        <DateRangeSelector selectedDays={days} onDaysChange={setDays} />
      </div>

      {/* Summary Row */}
      <FormsSummary orgId={orgId} days={days} />

      {/* Form Leaderboard */}
      {forms && forms.length > 0 && (
        <div className="mb-4">
          <FormLeaderboard forms={forms} leads={leadsData || []} sessions={realtimeData?.totalSessions || 0} deviceData={deviceData} />
        </div>
      )}

      {/* Form List */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Forms</h3>
          {archivedForms.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowArchived(!showArchived)}>
              <Archive className="h-3.5 w-3.5" />
              {showArchived ? "Show Active" : `Archived (${archivedForms.length})`}
            </Button>
          )}
        </div>
        {formsLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading forms…</div>
        ) : displayedForms.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {showArchived
              ? "No archived forms."
              : !forms || forms.length === 0
                ? "No forms synced yet. Forms are discovered automatically from your WordPress plugin, or you can trigger a manual sync from the ACTV TRKR settings page in WordPress."
                : "All forms are archived. Click \"Archived\" above to view them."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayedForms.map((form) => (
              <button
                key={form.id}
                onClick={() => setSelectedFormId(form.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <FileText className={`h-4 w-4 flex-shrink-0 ${form.archived ? "text-muted-foreground" : "text-primary"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${form.archived ? "text-muted-foreground" : "text-foreground"}`}>{form.name}</p>
                      <Badge variant="outline" className={`text-[9px] uppercase ${categoryColors[form.form_category] || categoryColors.other}`}>
                        {form.form_category}
                      </Badge>
                      {form.archived && (
                        <Badge variant="outline" className="text-[9px] uppercase text-muted-foreground border-border">Archived</Badge>
                      )}
                      {form.lead_weight < 1 && (
                        <span className="text-[10px] text-muted-foreground font-mono-data">{form.lead_weight}×</span>
                      )}
                    </div>
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

/* ─── Form Detail (with Sync button) ─── */
function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  // Parse header — handle quoted fields
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/^\uFEFF/, ""));
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (vals[i] !== undefined) obj[h] = vals[i]; });
    return obj;
  });
}

function FormDetail({ form, orgId, leadCount, onBack }: { form: any; orgId: string | null; leadCount: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleSync = async () => {
    if (!orgId || !form.site_id) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("trigger-site-sync", {
        body: { site_id: form.site_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Sync complete — ${data?.wp_result?.result?.synced ?? 0} form(s) synced`);
      queryClient.invalidateQueries({ queryKey: ["leads_by_form"] });
      queryClient.invalidateQueries({ queryKey: ["lead_counts_by_form_entries"] });
      queryClient.invalidateQueries({ queryKey: ["forms"] });
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset input

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (parsed.length === 0) { toast.error("No rows found in CSV"); return; }

      // Find the date column (usually "Date Time" or similar)
      const dateCol = Object.keys(parsed[0]).find(k =>
        k.toLowerCase().includes("date") || k.toLowerCase().includes("time")
      );
      const idCol = Object.keys(parsed[0]).find(k =>
        k.toLowerCase().includes("submission id") || k.toLowerCase() === "id" || k.toLowerCase().includes("entry id")
      );

      // Skip metadata columns from the field data
      const skipCols = new Set([dateCol, idCol, "Submission ID", "Entry ID"].filter(Boolean) as string[]);

      const rows = parsed.map((row, i) => {
        const fields: Record<string, string> = {};
        Object.entries(row).forEach(([key, val]) => {
          if (!skipCols.has(key) && val && val.trim()) fields[key] = val;
        });
        return {
          fields,
          submitted_at: dateCol && row[dateCol] ? new Date(row[dateCol]).toISOString() : null,
          external_entry_id: idCol && row[idCol] ? `csv_${row[idCol]}` : `csv_import_${i}`,
        };
      }).filter(r => r.submitted_at);

      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("import-csv-entries", {
        body: { form_id: form.id, rows },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Imported ${data.imported} entries (${data.skipped} skipped/duplicates)`);
      queryClient.invalidateQueries({ queryKey: ["leads_by_form"] });
      queryClient.invalidateQueries({ queryKey: ["lead_counts_by_form_entries"] });
      queryClient.invalidateQueries({ queryKey: ["total_submissions"] });
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Forms
      </button>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{form.name}</h1>
          <Badge variant="outline" className={`text-[10px] uppercase ${categoryColors[form.form_category] || categoryColors.other}`}>
            {form.form_category}
          </Badge>
          {form.lead_weight < 1 && (
            <span className="text-xs text-muted-foreground font-mono-data">{form.lead_weight}× weight</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 relative" disabled={importing}>
            <Upload className={`h-3.5 w-3.5 ${importing ? "animate-pulse" : ""}`} />
            {importing ? "Importing…" : "Import Form Entries"}
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvImport}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={importing}
            />
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Entries"}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {form.provider} · {leadCount ?? "—"} total leads
      </p>

      <Tabs defaultValue="entries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entries" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Entries
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entries">
          <FormEntries orgId={orgId} formId={form.id} />
        </TabsContent>
        <TabsContent value="analytics">
          <FormAnalytics orgId={orgId} formId={form.id} />
        </TabsContent>
        <TabsContent value="settings">
          <FormSettings form={form} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Settings Tab ─── */
function FormSettings({ form }: { form: any }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(form.form_category || "lead");
  const [weight, setWeight] = useState([form.lead_weight ?? 1]);
  const [estimatedValue, setEstimatedValue] = useState<string>(String(form.estimated_value ?? 0));

  const updateForm = useMutation({
    mutationFn: async () => {
      const parsedValue = parseFloat(estimatedValue) || 0;
      const { error } = await supabase
        .from("forms")
        .update({ form_category: category, lead_weight: weight[0], estimated_value: parsedValue })
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast.success("Form settings saved");
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  });

  const closestLabel = () => {
    const w = weight[0];
    const closest = Object.keys(weightLabels)
      .map(Number)
      .reduce((prev, curr) => Math.abs(curr - w) < Math.abs(prev - w) ? curr : prev);
    return weightLabels[String(closest)] || `${w}×`;
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Form Category</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Categorize this form so you can differentiate lead types in your dashboard.
        </p>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lead">Lead (Contact, Quote, etc.)</SelectItem>
            <SelectItem value="newsletter">Newsletter Signup</SelectItem>
            <SelectItem value="survey">Survey / Feedback</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Estimated Lead Value</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Set the estimated dollar value of each lead from this form. This is used to calculate ROI and revenue impact across your dashboard.
        </p>
        <div className="relative w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            min="0"
            step="1"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            className="pl-7"
            placeholder="0"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Lead Weight</h4>
        <p className="text-xs text-muted-foreground mb-4">
          Control how much this form contributes to your overall lead count and conversion rate.
          A weight of 1× means full contribution. Set to 0× to exclude entirely.
        </p>
        <div className="space-y-3">
          <Slider
            value={weight}
            onValueChange={setWeight}
            min={0} max={1} step={0.25}
            className="w-full"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Excluded</span>
            <span className="font-medium text-foreground">{closestLabel()}</span>
            <span>Full lead</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => updateForm.mutate()} disabled={updateForm.isPending}>
          {updateForm.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-2">Archive Form</h4>
        <p className="text-xs text-muted-foreground mb-4">
          {form.archived
            ? "This form is archived. It won't appear in dashboards or leaderboards. Unarchive it to restore."
            : "Archiving hides this form from your dashboard and leaderboards. Existing data is preserved."}
        </p>
        <Button
          variant={form.archived ? "outline" : "destructive"}
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const newVal = !form.archived;
            supabase.from("forms").update({ archived: newVal }).eq("id", form.id).then(({ error }) => {
              if (error) { toast.error(error.message); return; }
              queryClient.invalidateQueries({ queryKey: ["forms"] });
              toast.success(newVal ? "Form archived" : "Form restored");
            });
          }}
        >
          {form.archived ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive Form</> : <><Archive className="h-3.5 w-3.5" /> Archive Form</>}
        </Button>
      </div>
    </div>
  );
}

/* ─── Entries Tab ─── */
function FormEntries({ orgId, formId }: { orgId: string | null; formId: string }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showExport, setShowExport] = useState(false);

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["leads_by_form", orgId, formId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads").select("id, submitted_at, status, source, data, site_id")
        .eq("org_id", orgId).eq("form_id", formId).neq("status", "trashed")
        .order("submitted_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Get site domain to detect self-referral sources
  const siteId = leads?.[0]?.site_id;
  const { data: siteData } = useQuery({
    queryKey: ["site_domain", siteId],
    queryFn: async () => {
      if (!siteId) return null;
      const { data } = await supabase.from("sites").select("domain").eq("id", siteId).single();
      return data;
    },
    enabled: !!siteId,
  });

  const leadIds = (leads || []).map((l) => l.id);
  const SKIP_FIELD_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page"]);
  const SKIP_FIELD_KEYS = new Set(["data", "submission", "field_labels", "field_types", "field_keys", "hidden_field_names", "fields_holding_privacy_data"]);

  const { data: fieldsRaw } = useQuery({
    queryKey: ["lead_fields_flat", orgId, formId, leadIds.length],
    queryFn: async () => {
      if (!orgId || leadIds.length === 0) return [];
      const results: any[] = [];
      for (let i = 0; i < leadIds.length; i += 50) {
        const batch = leadIds.slice(i, i + 50);
        const { data, error } = await supabase
          .from("lead_fields_flat").select("lead_id, field_key, field_label, field_type, value_text")
          .eq("org_id", orgId).in("lead_id", batch);
        if (error) throw error;
        if (data) results.push(...data);
      }
      return results;
    },
    enabled: !!orgId && leadIds.length > 0,
  });

  const { fieldColumns, leadFieldMap } = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    const columnOrder = new Map<string, { key: string; label: string; count: number }>();

    const SKIP_TYPES_SET = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page"]);
    const SKIP_KEYS_SET = new Set(["data", "submission", "field_labels", "field_types", "field_keys", "hidden_field_names", "fields_holding_privacy_data"]);

    const leadsWithFlatFields = new Set<string>();

    if (fieldsRaw && fieldsRaw.length > 0) {
      for (const f of fieldsRaw) {
        if (SKIP_KEYS_SET.has(f.field_key)) continue;
        if (SKIP_TYPES_SET.has((f.field_type || "").toLowerCase())) continue;
        if (!f.value_text || f.value_text.trim() === "") continue;

        leadsWithFlatFields.add(f.lead_id);
        if (!map.has(f.lead_id)) map.set(f.lead_id, {});
        map.get(f.lead_id)![f.field_key] = f.value_text;
        if (!columnOrder.has(f.field_key)) {
          columnOrder.set(f.field_key, { key: f.field_key, label: f.field_label || f.field_key, count: 0 });
        }
        columnOrder.get(f.field_key)!.count++;
      }
    }

    if (leads) {
      for (const lead of leads) {
        if (leadsWithFlatFields.has(lead.id)) continue;
        if (!lead.data || !Array.isArray(lead.data)) continue;

        const dataEntry = (lead.data as any[]).find((d: any) => d.name === "data" || d.label === "data");
        const typesEntry = (lead.data as any[]).find((d: any) => d.name === "field_types" || d.label === "field_types");
        const labelsEntry = (lead.data as any[]).find((d: any) => d.name === "field_labels" || d.label === "field_labels");

        if (dataEntry?.value && typesEntry?.value) {
          const values = dataEntry.value.split(", ").map((v: string) => v.trim());
          const types = typesEntry.value.split(", ").map((t: string) => t.trim());
          const labels = labelsEntry?.value ? labelsEntry.value.split(", ").map((l: string) => l.trim()) : [];

          const fields: Record<string, string> = {};
          let valueIdx = 0;
          for (let i = 0; i < types.length; i++) {
            const type = types[i]?.toLowerCase();
            if (SKIP_TYPES_SET.has(type)) continue;
            const val = values[valueIdx] || "";
            valueIdx++;
            if (!val) continue;

            const label = labels[valueIdx - 1] || `Field ${i + 1}`;
            const key = `avada_${i}`;
            fields[key] = val;
            if (!columnOrder.has(key)) {
              columnOrder.set(key, { key, label: label || `Field ${i + 1}`, count: 0 });
            }
            columnOrder.get(key)!.count++;
          }
          if (Object.keys(fields).length > 0) map.set(lead.id, fields);
        } else {
          const fields: Record<string, string> = {};
          for (const d of lead.data as any[]) {
            if (!d.value || (typeof d.value === "string" && d.value.trim() === "")) continue;
            const name = d.name || d.label || "unknown";
            if (SKIP_KEYS_SET.has(name)) continue;
            if (SKIP_TYPES_SET.has((d.type || "").toLowerCase())) continue;

            const key = name;
            fields[key] = String(d.value);
            if (!columnOrder.has(key)) {
              columnOrder.set(key, { key, label: d.label || name, count: 0 });
            }
            columnOrder.get(key)!.count++;
          }
          if (Object.keys(fields).length > 0) map.set(lead.id, fields);
        }
      }
    }

    if (columnOrder.size === 0) return { fieldColumns: [], leadFieldMap: map };
    const cols = [...columnOrder.values()].sort((a, b) => b.count - a.count).slice(0, 6);
    return { fieldColumns: cols, leadFieldMap: map };
  }, [fieldsRaw, leads]);

  const filtered = (leads || []).filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fields = leadFieldMap.get(lead.id);
      const searchable = [lead.source, lead.status, ...(fields ? Object.values(fields) : [])].filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const statuses = [...new Set((leads || []).map((l) => l.status))].sort();

  const createExport = useMutation({
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const { data: inserted, error } = await supabase.from("export_jobs").insert({
        org_id: orgId,
        created_by: session.user.id,
        format: exportFormat,
        status: "queued",
        start_date: dateFrom ? format(dateFrom, "yyyy-MM-dd") : null,
        end_date: dateTo ? format(dateTo, "yyyy-MM-dd") : null,
        filters_json: { form_id: formId },
      }).select("id").single();
      if (error) throw error;

      const { error: fnError } = await supabase.functions.invoke("process-export", {
        body: { job_id: inserted.id },
      });
      if (fnError) throw new Error("Export processing failed");

      const { data: completedJob } = await supabase
        .from("export_jobs")
        .select("file_path, status, row_count")
        .eq("id", inserted.id)
        .single();

      return completedJob;
    },
    onSuccess: async (job) => {
      queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
      setShowExport(false);
      if (job?.file_path) {
        toast.success(`Export ready — ${job.row_count ?? 0} rows. Downloading…`);
        const { data, error } = await supabase.storage.from("exports").createSignedUrl(job.file_path, 60);
        if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank");
      } else if (job?.status === "succeeded") {
        toast.info("No leads found for the selected filters.");
      }
    },
    onError: (err: any) => toast.error(err.message || "Failed to create export"),
  });

  const dateLabel = dateFrom && dateTo
    ? `${format(dateFrom, "MMM d")} – ${format(dateTo, "MMM d")}`
    : dateFrom ? `From ${format(dateFrom, "MMM d")}` : dateTo ? `Until ${format(dateTo, "MMM d")}` : "All time";

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowExport(!showExport)}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {showExport && (
        <div className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Export Entries</h4>
          <div className="flex flex-wrap gap-3 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>Clear</Button>
            )}
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as "csv" | "xlsx")}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">XLSX</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => createExport.mutate()} disabled={createExport.isPending}>
              {createExport.isPending ? "Queuing…" : `Export ${dateLabel}`}
            </Button>
          </div>
        </div>
      )}
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
                      <TableCell className="text-sm">
                        {(!lead.source || lead.source === siteData?.domain) ? "direct" : lead.source}
                      </TableCell>
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
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => new Date());

  const startDate = dateFrom ? format(startOfDay(dateFrom), "yyyy-MM-dd") : format(subDays(startOfDay(new Date()), 30), "yyyy-MM-dd");
  const endDate = dateTo ? format(startOfDay(dateTo), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd");
  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);

  const { data: leads } = useQuery({
    queryKey: ["leads_analytics", orgId, formId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads").select("submitted_at, status, source")
        .eq("org_id", orgId).eq("form_id", formId).neq("status", "trashed")
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
    return {
      dailyData: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, dateLabel: format(new Date(date), "MMM d"), leads: count })),
      sourceData: Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count })),
      statusData: Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count })),
      totalLeads: leads.length,
    };
  }, [leads]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">to</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => { setDateFrom(subDays(new Date(), d)); setDateTo(new Date()); }}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: `${days} Day${days !== 1 ? "s" : ""}`, value: totalLeads, sub: "leads" },
          { label: "Daily Avg", value: days > 0 ? (totalLeads / days).toFixed(1) : "0", sub: "leads/day" },
          { label: "Top Source", value: sourceData[0]?.source || "—", sub: `${sourceData[0]?.count ?? 0} leads`, small: true },
          { label: "Sources", value: sourceData.length, sub: "unique" },
        ].map((kpi, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`font-bold font-mono-data text-foreground ${kpi.small ? "text-lg truncate" : "text-2xl"}`}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.sub}</p>
          </div>
        ))}
      </div>

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
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="leads" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#leadsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

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
                      <div className="h-full rounded-full bg-primary" style={{ width: `${totalLeads > 0 ? (s.count / totalLeads) * 100 : 0}%` }} />
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
                  <Badge variant="outline" className={`text-[10px] uppercase ${statusColors[s.status] || ""}`}>{s.status}</Badge>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-chart-2" style={{ width: `${totalLeads > 0 ? (s.count / totalLeads) * 100 : 0}%` }} />
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
