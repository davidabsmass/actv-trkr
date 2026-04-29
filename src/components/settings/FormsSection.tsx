import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useForms } from "@/hooks/use-dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Archive, ArchiveRestore, PowerOff, EyeOff, Eye, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

function useFormFields(orgId: string | null) {
  return useQuery({
    queryKey: ["form_fields_summary", orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const { data, error } = await supabase
        .from("lead_fields_flat")
        .select("field_key, field_label, lead_id")
        .eq("org_id", orgId);
      if (error) throw error;
      const leadIds = [...new Set(data?.map((d) => d.lead_id) ?? [])];
      if (leadIds.length === 0) return {};
      const { data: leads } = await supabase
        .from("leads").select("id, form_id").in("id", leadIds.slice(0, 500));
      const leadFormMap: Record<string, string> = {};
      leads?.forEach((l) => { leadFormMap[l.id] = l.form_id; });
      const skipKeys = new Set(["data", "submission", "field_labels", "field_types"]);
      const formFields: Record<string, string[]> = {};
      data?.forEach((row) => {
        if (skipKeys.has(row.field_key)) return;
        const formId = leadFormMap[row.lead_id];
        if (!formId) return;
        if (!formFields[formId]) formFields[formId] = [];
        const label = row.field_label || row.field_key;
        if (!formFields[formId].includes(label)) formFields[formId].push(label);
      });
      return formFields;
    },
    enabled: !!orgId,
  });
}

type Tab = "active" | "inactive" | "not_monitored" | "archived";

const REASON_LABELS: Record<string, string> = {
  page_removed: "Page removed",
  not_a_form: "Not a real form",
  intentional: "Intentionally hidden",
  other: "Not monitored",
};

export default function FormsSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const { data: forms, isLoading } = useForms(orgId);
  const queryClient = useQueryClient();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const { data: formFields } = useFormFields(orgId);

  const activeForms = forms?.filter((f: any) => !f.archived && f.is_active !== false && !f.health_check_disabled) ?? [];
  const inactiveForms = forms?.filter((f: any) => !f.archived && f.is_active === false) ?? [];
  const notMonitoredForms = forms?.filter((f: any) => !f.archived && f.health_check_disabled) ?? [];
  const archivedForms = forms?.filter((f: any) => f.archived) ?? [];

  const displayedForms =
    tab === "active" ? activeForms
      : tab === "inactive" ? inactiveForms
      : tab === "not_monitored" ? notMonitoredForms
      : archivedForms;

  const toggleArchive = async (formId: string, currentlyArchived: boolean) => {
    setTogglingId(formId);
    try {
      const { error } = await supabase.from("forms").update({ archived: !currentlyArchived }).eq("id", formId);
      if (error) throw error;
      toast({
        title: currentlyArchived ? t("settings.formRestored") : t("settings.formArchived"),
        description: currentlyArchived ? t("settings.formRestoredDesc") : t("settings.formArchivedDesc"),
      });
      queryClient.invalidateQueries({ queryKey: ["forms", orgId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("settings.error"), description: err?.message });
    } finally {
      setTogglingId(null);
    }
  };

  const resumeMonitoring = async (formId: string) => {
    setTogglingId(formId);
    try {
      const { error } = await supabase
        .from("forms")
        .update({
          health_check_disabled: false,
          health_check_disabled_reason: null,
          health_check_disabled_at: null,
          health_check_disabled_by: null,
        })
        .eq("id", formId);
      if (error) throw error;
      toast({ title: "Monitoring resumed", description: "We'll check this form on the next probe cycle." });
      queryClient.invalidateQueries({ queryKey: ["forms", orgId] });
      queryClient.invalidateQueries({ queryKey: ["form_health", orgId] });
      queryClient.invalidateQueries({ queryKey: ["unhealthy_forms", orgId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("settings.error"), description: err?.message });
    } finally {
      setTogglingId(null);
    }
  };

  const stopMonitoring = async (formId: string) => {
    setTogglingId(formId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("forms")
        .update({
          health_check_disabled: true,
          health_check_disabled_reason: "page_removed",
          health_check_disabled_at: new Date().toISOString(),
          health_check_disabled_by: user?.id ?? null,
        })
        .eq("id", formId);
      if (error) throw error;
      // Clear the existing health-check row so the dashboard banner clears immediately.
      await supabase
        .from("form_health_checks")
        .update({ is_rendered: true, last_failure_reason: null })
        .eq("form_id", formId);
      toast({ title: "Monitoring stopped", description: "This form is hidden from health alerts. Resume from the 'Not monitored' tab anytime." });
      queryClient.invalidateQueries({ queryKey: ["forms", orgId] });
      queryClient.invalidateQueries({ queryKey: ["form_health", orgId] });
      queryClient.invalidateQueries({ queryKey: ["unhealthy_forms", orgId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("settings.error"), description: err?.message });
    } finally {
      setTogglingId(null);
    }
  };

  const TabButton = ({ value, label, count }: { value: Tab; label: string; count: number }) => (
    <button
      onClick={() => setTab(value)}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        tab === value
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
    >
      {label} <span className="opacity-60">({count})</span>
    </button>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.discoveredForms")}</h3>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <TabButton value="active" label={t("settings.tabActive", { defaultValue: "Active" })} count={activeForms.length} />
          <TabButton value="inactive" label={t("settings.tabInactive", { defaultValue: "Inactive" })} count={inactiveForms.length} />
          <TabButton value="not_monitored" label="Not monitored" count={notMonitoredForms.length} />
          <TabButton value="archived" label={t("settings.tabArchived", { defaultValue: "Archived" })} count={archivedForms.length} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {tab === "inactive"
          ? t("settings.inactiveFormsDesc", { defaultValue: "These forms are disabled or deleted in WordPress. They auto-restore here when re-enabled." })
          : tab === "not_monitored"
            ? "These forms still exist, but you've told us to stop checking whether they render. Resume monitoring anytime."
            : t("settings.formsAutoDesc")}
      </p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("settings.loadingKeys")}</p>
      ) : displayedForms.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {tab === "archived"
            ? t("settings.noArchivedFormsSettings")
            : tab === "inactive"
              ? t("settings.noInactiveForms", { defaultValue: "No inactive forms — everything in WordPress is enabled." })
              : tab === "not_monitored"
                ? "Nothing here. All your forms are being monitored for rendering issues."
                : t("settings.noActiveFormsSettings")}
        </p>
      ) : (
        <div className="space-y-3">
          {displayedForms.map((form: any) => (
            <div key={form.id} className="flex items-start gap-3 group">
              <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${form.is_active === false ? "text-warning" : form.health_check_disabled ? "text-muted-foreground" : "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{form.name}</p>
                  {form.is_active === false && !form.archived && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase font-semibold rounded bg-warning/10 text-warning border border-warning/30">
                      <PowerOff className="h-2.5 w-2.5" /> Disabled in WP
                    </span>
                  )}
                  {form.health_check_disabled && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase font-semibold rounded bg-muted text-muted-foreground border border-border">
                      <EyeOff className="h-2.5 w-2.5" />
                      {REASON_LABELS[form.health_check_disabled_reason as string] || REASON_LABELS.other}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {formFields?.[form.id]?.length
                    ? formFields[form.id].slice(0, 5).join(" · ") +
                      (formFields[form.id].length > 5 ? ` ${t("settings.moreFields", { count: formFields[form.id].length - 5 })}` : "")
                    : t("settings.noEntriesYet")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!form.archived && (
                  <button
                    onClick={() => navigate(`/leads?formId=${form.id}&export=1`)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Export entries from this form"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export entries</span>
                  </button>
                )}
                {form.health_check_disabled && !form.archived && (
                  <button
                    onClick={() => resumeMonitoring(form.id)}
                    disabled={togglingId === form.id}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    title="Resume monitoring"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Resume</span>
                  </button>
                )}
                {!form.health_check_disabled && !form.archived && (
                  <button
                    onClick={() => stopMonitoring(form.id)}
                    disabled={togglingId === form.id}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    title="Stop checking whether this form renders"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>Stop monitoring</span>
                  </button>
                )}
                <button
                  onClick={() => toggleArchive(form.id, form.archived)}
                  disabled={togglingId === form.id}
                  className="flex items-center gap-1 p-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                  title={form.archived ? "Restore" : "Archive"}
                >
                  {form.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
