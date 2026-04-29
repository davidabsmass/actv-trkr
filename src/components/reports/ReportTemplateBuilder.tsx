import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical, Save, RotateCcw, ChevronDown, ChevronRight,
  Sparkles, Target, Globe, BarChart3, Users, Lightbulb,
  Activity, Shield, FormInput, Loader2, Check, Plus, Trash2, Copy,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const ACTIVE_TEMPLATE_KEY = (orgId: string) => `actv:activeReportTemplateId:${orgId}`;

// ── Default section definitions ──

export interface SectionMetric {
  key: string;
  label: string;
  enabled: boolean;
}

export interface ReportSection {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
  expanded?: boolean;
  metrics: SectionMetric[];
}

const DEFAULT_SECTIONS: ReportSection[] = [
  {
    key: "aiInsights", label: "AI Insights", icon: "sparkles", enabled: true,
    metrics: [
      { key: "insights_list", label: "Insight Cards", enabled: true },
    ],
  },
  {
    key: "executiveSummary", label: "Executive Summary", icon: "target", enabled: true,
    metrics: [
      { key: "leads", label: "Leads", enabled: true },
      { key: "sessions", label: "Sessions", enabled: true },
      { key: "pageviews", label: "Pageviews", enabled: true },
      { key: "cvr", label: "Action Rate", enabled: true },
      { key: "weightedLeads", label: "Weighted Leads", enabled: true },
      { key: "goal", label: "Goal Progress", enabled: true },
      { key: "keyWin", label: "Key Win", enabled: true },
      { key: "keyRisk", label: "Key Risk", enabled: true },
    ],
  },
  {
    key: "siteHealth", label: "Site Health & Uptime", icon: "shield", enabled: true,
    metrics: [
      { key: "uptime", label: "Uptime %", enabled: true },
      { key: "downtime", label: "Downtime Minutes", enabled: true },
      { key: "incidents", label: "Incidents", enabled: true },
      { key: "brokenLinks", label: "Broken Links", enabled: true },
      { key: "ssl", label: "SSL & Domain", enabled: true },
    ],
  },
  {
    key: "formHealth", label: "Form Health", icon: "formInput", enabled: true,
    metrics: [
      { key: "totalSubmissions", label: "Total Submissions", enabled: true },
      { key: "failures", label: "Failures", enabled: true },
      { key: "failureRate", label: "Failure Rate", enabled: true },
    ],
  },
  {
    key: "goalConversions", label: "Key Actions", icon: "target", enabled: true,
    metrics: [
      { key: "goalsList", label: "Key Actions Table", enabled: true },
    ],
  },
  {
    key: "growthEngine", label: "Growth Engine", icon: "globe", enabled: true,
    metrics: [
      { key: "trafficBySource", label: "Traffic by Source", enabled: true },
      { key: "topLandingPages", label: "Top Landing Pages", enabled: true },
    ],
  },
  {
    key: "conversionIntelligence", label: "Conversion Intelligence", icon: "barChart", enabled: true,
    metrics: [
      { key: "leadsByForm", label: "Leads by Form Table", enabled: true },
      { key: "topConvertingPages", label: "Top Converting Pages", enabled: true },
      { key: "leadSources", label: "Lead Sources", enabled: true },
    ],
  },
  {
    key: "userExperience", label: "User Experience Signals", icon: "users", enabled: true,
    metrics: [
      { key: "deviceBreakdown", label: "Device Breakdown", enabled: true },
      { key: "geoBreakdown", label: "Geography", enabled: true },
      { key: "topPages", label: "Top Pages", enabled: true },
      { key: "referrerBreakdown", label: "Referrers", enabled: true },
    ],
  },
  {
    key: "actionPlan", label: "Action Plan & Forecast", icon: "lightbulb", enabled: true,
    metrics: [
      { key: "forecast", label: "Lead Forecast", enabled: true },
      { key: "recommendations", label: "Recommendations", enabled: true },
      { key: "contentOpportunities", label: "Content Opportunities", enabled: true },
    ],
  },
];

const ICON_MAP: Record<string, React.ElementType> = {
  sparkles: Sparkles, target: Target, globe: Globe, barChart: BarChart3,
  users: Users, lightbulb: Lightbulb, activity: Activity, shield: Shield, formInput: FormInput,
};

export default function ReportTemplateBuilder() {
  const { orgId } = useOrg();
  const { session } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  // Translation lookup for section/metric labels
  const labelMap: Record<string, string> = useMemo(() => ({
    "aiInsights": t("reports.aiInsights"),
    "insights_list": t("reports.insightCards"),
    "executiveSummary": t("reports.executiveSummary"),
    "leads": t("reports.leads"),
    "sessions": t("reports.sessions"),
    "pageviews": t("dashboard.pageviews"),
    "cvr": t("reports.cvr"),
    "weightedLeads": t("reports.weightedLeads"),
    "goal": t("reports.goalProgress"),
    "keyWin": t("reports.keyWin"),
    "keyRisk": t("reports.keyRisk"),
    "siteHealth": t("reports.siteHealth"),
    "uptime": t("reports.uptimePercent"),
    "downtime": t("reports.downtimeMinutes"),
    "incidents": t("reports.incidents"),
    "brokenLinks": t("reports.brokenLinks"),
    "ssl": t("reports.sslDomain"),
    "formHealth": t("reports.formHealth"),
    "totalSubmissions": t("reports.totalSubmissions"),
    "failures": t("reports.failures"),
    "failureRate": t("reports.failureRate"),
    "growthEngine": t("reports.growthEngine"),
    "trafficBySource": t("reports.trafficBySource"),
    "topLandingPages": t("reports.topLandingPages"),
    "conversionIntelligence": t("reports.conversionIntelligence"),
    "leadsByForm": t("reports.leadsByFormTable"),
    "topConvertingPages": t("reports.topConvertingPages"),
    "leadSources": t("reports.leadSources"),
    "userExperience": t("reports.userExperience"),
    "deviceBreakdown": t("reports.deviceBreakdown"),
    "geoBreakdown": t("reports.geography"),
    "topPages": t("reports.topPages"),
    "referrerBreakdown": t("reports.referrers"),
    "actionPlan": t("reports.actionPlan"),
    "forecast": t("reports.leadForecast"),
    "recommendations": t("reports.recommendations"),
    "contentOpportunities": t("reports.contentOpportunities"),
  }), [t]);

  const getLabel = (key: string, fallback: string) => labelMap[key] || fallback;

  const { data: templates, isLoading } = useQuery({
    queryKey: ["report_custom_templates_list", orgId, userId],
    queryFn: async () => {
      if (!orgId || !userId) return [] as any[];
      const { data } = await supabase
        .from("report_custom_templates" as any)
        .select("*")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!orgId && !!userId,
  });

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [sections, setSections] = useState<ReportSection[]>(DEFAULT_SECTIONS);
  const [templateName, setTemplateName] = useState("My Report Template");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Pick which template to load when templates list changes
  useEffect(() => {
    if (!templates || !orgId) return;
    if (templates.length === 0) {
      setActiveTemplateId(null);
      setSections(DEFAULT_SECTIONS);
      setTemplateName("My Report Template");
      setHasChanges(false);
      return;
    }
    const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_TEMPLATE_KEY(orgId)) : null;
    const target = templates.find((t: any) => t.id === stored) || templates[templates.length - 1];
    loadTemplate(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, orgId]);

  function loadTemplate(tpl: any) {
    if (!tpl) return;
    setActiveTemplateId(tpl.id);
    if (orgId) localStorage.setItem(ACTIVE_TEMPLATE_KEY(orgId), tpl.id);
    const config = tpl.sections_config;
    if (Array.isArray(config) && config.length > 0) {
      const merged = config.map((s: ReportSection) => {
        const def = DEFAULT_SECTIONS.find((d) => d.key === s.key);
        return {
          ...s,
          metrics: s.metrics.map((m) => ({
            ...m,
            label: def?.metrics.find((dm) => dm.key === m.key)?.label || m.label,
          })),
        };
      });
      DEFAULT_SECTIONS.forEach((d) => {
        if (!merged.find((m: any) => m.key === d.key)) merged.push(d);
      });
      setSections(merged);
    } else {
      setSections(DEFAULT_SECTIONS);
    }
    setTemplateName(tpl.name || "My Report Template");
    setHasChanges(false);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !userId) throw new Error("Not authenticated");
      const cleanSections = sections.map(({ expanded, ...s }) => s);
      if (activeTemplateId) {
        const { error } = await supabase
          .from("report_custom_templates" as any)
          .update({ sections_config: cleanSections, name: templateName, updated_at: new Date().toISOString() } as any)
          .eq("id", activeTemplateId);
        if (error) throw error;
        return activeTemplateId;
      } else {
        const { data, error } = await supabase
          .from("report_custom_templates" as any)
          .insert({ user_id: userId, org_id: orgId, name: templateName, sections_config: cleanSections } as any)
          .select("id")
          .single();
        if (error) throw error;
        return (data as any).id as string;
      }
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["report_custom_templates_list"] });
      queryClient.invalidateQueries({ queryKey: ["report_custom_template"] });
      if (id && orgId) {
        setActiveTemplateId(id);
        localStorage.setItem(ACTIVE_TEMPLATE_KEY(orgId), id);
      }
      toast.success(t("reports.templateSaved"));
      setHasChanges(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  });

  const saveAsNewMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !userId) throw new Error("Not authenticated");
      const cleanSections = sections.map(({ expanded, ...s }) => s);
      // Ensure unique name (user_id, org_id, name) is unique constraint
      let candidateName = templateName?.trim() || "Untitled template";
      const existing = new Set((templates || []).map((t: any) => t.name));
      if (existing.has(candidateName)) {
        let i = 2;
        while (existing.has(`${candidateName} (${i})`)) i++;
        candidateName = `${candidateName} (${i})`;
      }
      const { data, error } = await supabase
        .from("report_custom_templates" as any)
        .insert({ user_id: userId, org_id: orgId, name: candidateName, sections_config: cleanSections } as any)
        .select("id, name")
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["report_custom_templates_list"] });
      if (orgId) {
        setActiveTemplateId(row.id);
        setTemplateName(row.name);
        localStorage.setItem(ACTIVE_TEMPLATE_KEY(orgId), row.id);
      }
      toast.success(`Saved as "${row.name}"`);
      setHasChanges(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to save copy"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!activeTemplateId) return;
      const { error } = await supabase.from("report_custom_templates" as any).delete().eq("id", activeTemplateId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (orgId) localStorage.removeItem(ACTIVE_TEMPLATE_KEY(orgId));
      setActiveTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ["report_custom_templates_list"] });
      queryClient.invalidateQueries({ queryKey: ["report_custom_template"] });
      toast.success("Template deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  });

  const newTemplate = () => {
    setActiveTemplateId(null);
    setSections(DEFAULT_SECTIONS);
    setTemplateName("New template");
    setHasChanges(true);
    if (orgId) localStorage.removeItem(ACTIVE_TEMPLATE_KEY(orgId));
  };

  const toggleSection = (key: string) => {
    setSections((prev) => prev.map((s) => s.key === key ? { ...s, enabled: !s.enabled } : s));
    setHasChanges(true);
  };

  const toggleMetric = (sectionKey: string, metricKey: string) => {
    setSections((prev) => prev.map((s) =>
      s.key === sectionKey
        ? { ...s, metrics: s.metrics.map((m) => m.key === metricKey ? { ...m, enabled: !m.enabled } : m) }
        : s
    ));
    setHasChanges(true);
  };

  const resetToDefaults = () => {
    setSections(DEFAULT_SECTIONS);
    setTemplateName("My Report Template");
    setHasChanges(true);
  };

  // Drag and drop
  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(idx);
    setHasChanges(true);
  };
  const handleDragEnd = () => setDragIndex(null);

  const enabledCount = sections.filter((s) => s.enabled).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {t("reports.reportTemplate")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("reports.customizeDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefaults} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> {t("reports.resetDefaults")}
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !hasChanges} className="gap-1.5">
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t("reports.saveTemplate")}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs font-medium text-muted-foreground">{t("reports.templateName")}</label>
          <Input
            value={templateName}
            onChange={(e) => { setTemplateName(e.target.value); setHasChanges(true); }}
            className="max-w-xs h-8 text-sm"
          />
          <Badge variant="secondary" className="text-xs ml-auto">
            {t("reports.sectionsEnabled", { enabled: enabledCount, total: sections.length })}
          </Badge>
        </div>
      </div>

      {/* Sections list */}
      <div className="space-y-2">
        {sections.map((section, idx) => {
          const IconComp = ICON_MAP[section.icon] || BarChart3;
          const isExpanded = expandedSection === section.key;
          const enabledMetrics = section.metrics.filter((m) => m.enabled).length;

          return (
            <div
              key={section.key}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`rounded-lg border bg-card transition-all ${
                dragIndex === idx ? "border-primary shadow-md opacity-75" : "border-border"
              } ${!section.enabled ? "opacity-60" : ""}`}
            >
              {/* Section header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="cursor-grab text-muted-foreground hover:text-foreground transition-colors">
                  <GripVertical className="h-4 w-4" />
                </div>
                <Switch
                  checked={section.enabled}
                  onCheckedChange={() => toggleSection(section.key)}
                  className="data-[state=checked]:bg-primary"
                />
                <IconComp className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground flex-1">{getLabel(section.key, section.label)}</span>
                <Badge variant="outline" className="text-xs">
                  {enabledMetrics}/{section.metrics.length}
                </Badge>
                <button
                  onClick={() => setExpandedSection(isExpanded ? null : section.key)}
                  className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>

              {/* Metrics */}
              {isExpanded && (
                <div className="border-t border-border px-4 py-3 bg-secondary/30">
                  <p className="text-xs text-muted-foreground mb-3">{t("reports.toggleMetrics")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {section.metrics.map((metric) => (
                      <label
                        key={metric.key}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-all ${
                          metric.enabled
                            ? "border-primary/30 bg-primary/5"
                            : "border-border bg-card"
                        } ${!section.enabled ? "pointer-events-none" : ""}`}
                      >
                        <Switch
                          checked={metric.enabled && section.enabled}
                          onCheckedChange={() => toggleMetric(section.key, metric.key)}
                          disabled={!section.enabled}
                          className="data-[state=checked]:bg-primary scale-90"
                        />
                        <span className="text-sm text-foreground">{getLabel(metric.key, metric.label)}</span>
                        {metric.enabled && section.enabled && (
                          <Check className="h-3.5 w-3.5 text-primary ml-auto" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground text-center">
        {t("reports.changesApply")}
      </p>
    </div>
  );
}
