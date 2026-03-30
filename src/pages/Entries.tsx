import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useForms } from "@/hooks/use-dashboard-data";
import { format, subDays, startOfDay } from "date-fns";
import { Search, ChevronRight, ArrowLeft, FileText, BarChart3, Settings2, Download, CalendarIcon, Archive, ArchiveRestore } from "lucide-react";
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

export default function Entries() {
  const { orgId, orgName } = useOrg();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: forms, isLoading: formsLoading } = useForms(orgId);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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
      <div>
        <button
          onClick={() => setSelectedFormId(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Forms
        </button>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">{selectedForm.name}</h1>
          <Badge variant="outline" className={`text-xs uppercase ${categoryColors[selectedForm.form_category] || categoryColors.other}`}>
            {selectedForm.form_category}
          </Badge>
          {selectedForm.lead_weight < 1 && (
            <span className="text-xs text-muted-foreground font-mono-data">{selectedForm.lead_weight}× weight</span>
          )}
        </div>
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
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Settings
            </TabsTrigger>
          </TabsList>
          <TabsContent value="entries">
            <FormEntries orgId={orgId} formId={selectedForm.id} />
          </TabsContent>
          <TabsContent value="analytics">
            <FormAnalytics orgId={orgId} formId={selectedForm.id} />
          </TabsContent>
          <TabsContent value="settings">
            <FormSettings form={selectedForm} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-1">Entries</h1>
      <p className="text-sm text-muted-foreground mb-6">Lead submissions for {orgName}</p>

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
              ? t("forms.noArchivedForms")
              : !forms || forms.length === 0
                ? `${t("forms.noFormsYet")} ${t("forms.noFormsSyncedDesc")}`
                : t("forms.allFormsArchived")}
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
                      <Badge variant="outline" className={`text-xs uppercase ${categoryColors[form.form_category] || categoryColors.other}`}>
                        {form.form_category}
                      </Badge>
                      {form.archived && (
                        <Badge variant="outline" className="text-xs uppercase text-muted-foreground border-border">Archived</Badge>
                      )}
                      {form.lead_weight < 1 && (
                        <span className="text-xs text-muted-foreground font-mono-data">{form.lead_weight}×</span>
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
          Set the estimated dollar value of each lead from this form. Used for lead scoring and weighted reporting.
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
  
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showExport, setShowExport] = useState(false);

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["leads_by_form", orgId, formId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leads").select("id, submitted_at, status, source, data")
        .eq("org_id", orgId).eq("form_id", formId).neq("status", "trashed")
        .order("submitted_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
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

    const SKIP_TYPES_SET = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page", "consent", "checkbox"]);
    const SKIP_KEYS_SET = new Set(["data", "submission", "field_labels", "field_types", "field_keys", "hidden_field_names", "fields_holding_privacy_data"]);

    const isNumericLike = (value: string | null | undefined) => {
      const v = (value || "").trim();
      return v !== "" && /^\d+(\.\d+)?$/.test(v);
    };

    const isPlaceholderLabel = (value: string | null | undefined) => {
      const v = (value || "").trim();
      return /^field\s+\d+$/i.test(v);
    };

    const inferLabelFromValue = (value: string): string | null => {
      const v = value.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Email";
      if (/^[\+]?[\d\s\-\(\)\.]{7,}$/.test(v)) return "Phone";
      if (/^\d{4,5}(-\d{4})?$/.test(v)) return "Zip Code";
      const US_STATES = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]);
      if (US_STATES.has(v.toUpperCase()) || /^[A-Z][a-z]+ ?[A-Z]?[a-z]*$/.test(v) && v.length < 20 && /island|hampshire|carolina|dakota|virginia|jersey|mexico|york/i.test(v)) return "State";
      return null;
    };

    const normalizeKey = (value: string) =>
      value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

    const getExistingKeyByLabel = (label: string) => {
      const normalized = label.trim().toLowerCase();
      if (!normalized) return null;
      for (const col of columnOrder.values()) {
        if (col.label.trim().toLowerCase() === normalized) return col.key;
      }
      return null;
    };

    // Track which lead IDs have flat field data
    const leadsWithFlatFields = new Set<string>();
    const numericOnlyFields: typeof fieldsRaw = [];
    let hasAnyRealLabel = false;

    if (fieldsRaw && fieldsRaw.length > 0) {
      for (const f of fieldsRaw) {
        const rawKey = (f.field_key || "").trim();
        const rawLabel = (f.field_label || "").trim();

        if (!rawKey || SKIP_KEYS_SET.has(rawKey)) continue;
        if (SKIP_TYPES_SET.has((f.field_type || "").toLowerCase())) continue;
        if (!f.value_text || f.value_text.trim() === "") continue;

        // Skip raw numeric field IDs (e.g. "28", "29", "28.3") unless they have a real descriptive label
        const hasRealLabel =
          !!rawLabel &&
          !isNumericLike(rawLabel) &&
          !isPlaceholderLabel(rawLabel) &&
          rawLabel !== rawKey;

        if (isNumericLike(rawKey) && !hasRealLabel) {
          numericOnlyFields.push(f);
          continue;
        }
        hasAnyRealLabel = true;

        const label = hasRealLabel ? rawLabel : rawKey;
        const existingKey = getExistingKeyByLabel(label);
        // For numeric keys with real labels, use a normalized label-based key to merge with JSONB fallback columns
        const key = existingKey || (isNumericLike(rawKey) ? normalizeKey(label) || `field_${rawKey}` : rawKey);

        leadsWithFlatFields.add(f.lead_id);
        if (!map.has(f.lead_id)) map.set(f.lead_id, {});
        map.get(f.lead_id)![key] = f.value_text;
        if (!columnOrder.has(key)) {
          columnOrder.set(key, { key, label, count: 0 });
        }
        columnOrder.get(key)!.count++;
      }

      // Process numeric-only fields: if real-labeled columns already exist, map by sorted position;
      // otherwise use the heuristic inference fallback
      if (numericOnlyFields.length > 0) {
        if (hasAnyRealLabel && columnOrder.size > 0) {
          // Map numeric keys to existing columns by sorted position
          const existingCols = [...columnOrder.values()];
          const sortedNumKeys = [...new Set(numericOnlyFields.map(f => f.field_key.trim()))].sort((a, b) => Number(a) - Number(b));
          const keyToCol = new Map<string, { key: string; label: string }>();
          for (let i = 0; i < sortedNumKeys.length && i < existingCols.length; i++) {
            keyToCol.set(sortedNumKeys[i], existingCols[i]);
          }
          for (const f of numericOnlyFields) {
            const col = keyToCol.get(f.field_key.trim());
            if (!col) continue;
            leadsWithFlatFields.add(f.lead_id);
            if (!map.has(f.lead_id)) map.set(f.lead_id, {});
            map.get(f.lead_id)![col.key] = f.value_text;
            columnOrder.get(col.key)!.count++;
          }
        } else {
          // No real labels exist at all — infer labels from values
          const keyToSample = new Map<string, string>();
          for (const f of numericOnlyFields) {
            if (!keyToSample.has(f.field_key)) keyToSample.set(f.field_key, f.value_text);
          }
          const sortedKeys = [...keyToSample.keys()].sort((a, b) => Number(a) - Number(b));
          const usedLabels = new Set<string>();
          const keyLabelMap = new Map<string, string>();
          for (const k of sortedKeys) {
            const sample = keyToSample.get(k) || "";
            let inferred = inferLabelFromValue(sample);
            if (inferred && usedLabels.has(inferred)) inferred = null;
            if (!inferred) {
              const idx = sortedKeys.indexOf(k);
              const fallbacks = ["Name", "Email", "Phone", "Company", "Details"];
              inferred = fallbacks[idx] && !usedLabels.has(fallbacks[idx]) ? fallbacks[idx] : `Field ${k}`;
            }
            usedLabels.add(inferred);
            keyLabelMap.set(k, inferred);
          }
          for (const f of numericOnlyFields) {
            const rawKey = f.field_key.trim();
            const label = keyLabelMap.get(rawKey) || `Field ${rawKey}`;
            const key = normalizeKey(label) || `field_${rawKey}`;
            leadsWithFlatFields.add(f.lead_id);
            if (!map.has(f.lead_id)) map.set(f.lead_id, {});
            map.get(f.lead_id)![key] = f.value_text;
            if (!columnOrder.has(key)) {
              columnOrder.set(key, { key, label, count: 0 });
            }
            columnOrder.get(key)!.count++;
          }
        }
      }
    }

    // Fallback: parse leads.data JSONB for leads without flat field records
    if (leads) {
      for (const lead of leads) {
        if (leadsWithFlatFields.has(lead.id)) continue;
        if (!lead.data) continue;

        // lead.data can be an object {external_entry_id, fields} or an array
        const dataObj = lead.data as any;
        const fieldsArray: any[] | null =
          Array.isArray(dataObj) ? dataObj :
          Array.isArray(dataObj?.fields) && dataObj.fields.length > 0 ? dataObj.fields :
          null;

        if (!fieldsArray || fieldsArray.length === 0) continue;

        // Check for Avada comma-separated "data" field
        const dataEntry = fieldsArray.find((d: any) => d.name === "data" || d.label === "data");
        const typesEntry = fieldsArray.find((d: any) => d.name === "field_types" || d.label === "field_types");

        if (dataEntry?.value && typesEntry?.value) {
          // Parse comma-separated Avada format
          const labelsEntry = fieldsArray.find((d: any) => d.name === "field_labels" || d.label === "field_labels");
          const values = dataEntry.value.split(", ").map((v: string) => v.trim());
          const types = typesEntry.value.split(", ").map((t: string) => t.trim());
          const labels = labelsEntry?.value ? labelsEntry.value.split(", ").map((l: string) => l.trim()) : [];

          const fields: Record<string, string> = {};
          const existingColumns = [...columnOrder.values()];
          let valueIdx = 0;

          for (let i = 0; i < types.length; i++) {
            const type = types[i]?.toLowerCase();
            if (SKIP_TYPES_SET.has(type)) continue;

            const val = values[valueIdx] || "";
            valueIdx++;
            if (!val) continue;

            const rawLabel = (labels[valueIdx - 1] || "").trim();
            const existingCol = existingColumns[i];
            const hasMeaningfulLabel =
              rawLabel !== "" &&
              !isNumericLike(rawLabel) &&
              !isPlaceholderLabel(rawLabel);

            const label = hasMeaningfulLabel
              ? rawLabel
              : (existingCol?.label || `Field ${i + 1}`);

            const existingKeyByLabel = getExistingKeyByLabel(label);
            const generatedKey = normalizeKey(label) || `field_${i}`;
            const key = existingKeyByLabel || existingCol?.key || `field_${generatedKey}`;

            fields[key] = val;
            if (!columnOrder.has(key)) {
              columnOrder.set(key, { key, label, count: 0 });
            }
            columnOrder.get(key)!.count++;
          }

          if (Object.keys(fields).length > 0) map.set(lead.id, fields);
        } else if (dataEntry?.value && !typesEntry) {
          // Single "data" field with comma-separated values, no types info
          // Parse as positional values and match to existing column keys
          const values = dataEntry.value.split(", ").map((v: string) => v.trim());
          const fields: Record<string, string> = {};
          const existingKeys = [...columnOrder.keys()];

          for (let i = 0; i < values.length; i++) {
            if (!values[i]) continue;
            const key = existingKeys[i] || `field_${i}`;
            fields[key] = values[i];
            if (!columnOrder.has(key)) {
              columnOrder.set(key, { key, label: `Field ${i + 1}`, count: 0 });
            }
            columnOrder.get(key)!.count++;
          }

          if (Object.keys(fields).length > 0) map.set(lead.id, fields);
        } else {
          // Standard format: each entry is a field with name/label/value
          const fields: Record<string, string> = {};

          for (const d of fieldsArray) {
            if (!d.value || (typeof d.value === "string" && d.value.trim() === "")) continue;

            const rawName = String(d.name || "").trim();
            const rawLabel = String(d.label || "").trim();
            const name = rawName || rawLabel || "unknown";

            if (SKIP_KEYS_SET.has(name)) continue;
            if (SKIP_TYPES_SET.has((d.type || "").toLowerCase())) continue;

            const hasMeaningfulLabel =
              !!rawLabel &&
              !isNumericLike(rawLabel) &&
              !isPlaceholderLabel(rawLabel);
            if (isNumericLike(name) && !hasMeaningfulLabel) continue;

            const label = hasMeaningfulLabel ? rawLabel : name;
            const existingKeyByLabel = getExistingKeyByLabel(label);
            const generatedKey = normalizeKey(label);
            const key = existingKeyByLabel || (isNumericLike(name) ? `field_${generatedKey || "unknown"}` : name);

            fields[key] = String(d.value);
            if (!columnOrder.has(key)) {
              columnOrder.set(key, { key, label, count: 0 });
            }
            columnOrder.get(key)!.count++;
          }

          if (Object.keys(fields).length > 0) map.set(lead.id, fields);
        }
      }
    }

    if (columnOrder.size === 0) return { fieldColumns: [], leadFieldMap: map };

    // Post-filter: remove columns with numeric-only keys/labels or generic "Field N" labels
    const isGenericColumn = (col: { key: string; label: string }) => {
      const k = col.key.trim();
      const l = col.label.trim();
      // Numeric-only key like "51", "52"
      if (/^\d+(\.\d+)?$/.test(k) && (/^\d+(\.\d+)?$/.test(l) || /^Field\s+\d+$/i.test(l))) return true;
      // Generic "field_N" key with "Field N" label
      if (/^field_\d+$/i.test(k) && /^Field\s+\d+$/i.test(l)) return true;
      if (isPlaceholderLabel(l)) return true;
      return false;
    };

    const finalCols = [...columnOrder.values()].filter(c => !isGenericColumn(c));

    // Also clean up leadFieldMap: remove entries for dropped column keys
    const keptKeys = new Set(finalCols.map(c => c.key));
    for (const [leadId, fields] of map.entries()) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (keptKeys.has(k)) cleaned[k] = v;
      }
      if (Object.keys(cleaned).length > 0) {
        map.set(leadId, cleaned);
      } else {
        map.delete(leadId);
      }
    }

    const cols = finalCols.sort((a, b) => b.count - a.count);
    return { fieldColumns: cols, leadFieldMap: map };
  }, [fieldsRaw, leads]);

  const filtered = (leads || []).filter((lead) => {
    const fields = leadFieldMap.get(lead.id);
    if (!fields || Object.keys(fields).length === 0) return false;

    if (search) {
      const q = search.toLowerCase();
      const searchable = [lead.source, ...Object.values(fields)].filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    return true;
  });

  const createExport = useMutation({
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const { data: inserted, error } = await supabase.from("export_jobs").insert({
        org_id: orgId,
        created_by: session.user.id,
        format: exportFormat,
        status: "queued",
      }).select("id").single();
      if (error) throw error;

      // Trigger the processor
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      fetch(`https://${projectId}.supabase.co/functions/v1/process-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ job_id: inserted.id }),
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
      toast.success(`${exportFormat.toUpperCase()} export queued — processing now`);
      setShowExport(false);
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
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"}{search ? " (filtered)" : ""}
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
      {/* Date range picker */}
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
            <p className={`font-bold font-mono-data text-foreground ${kpi.small ? "text-sm truncate" : "text-2xl"}`} title={typeof kpi.value === 'string' ? kpi.value : undefined}>{kpi.value}</p>
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
                  <Badge variant="outline" className={`text-xs uppercase ${statusColors[s.status] || ""}`}>{s.status}</Badge>
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
