import { useState, useEffect } from "react";
import { useOrg } from "@/hooks/use-org";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useForms } from "@/hooks/use-dashboard-data";
import {
  useGoals, useCreateGoal, useUpdateGoal, useDeleteGoal,
  GOAL_TYPES, type ConversionGoal, type GoalType,
} from "@/hooks/use-goals";
import { Target, Plus, Trash2, Power, TrendingUp, Edit2, X } from "lucide-react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

/* ─── Inline help per goal type ─── */
const GOAL_HELP: Record<string, { title: string; steps: string[]; example: string }> = {
  form_submission: {
    title: "Track when a visitor submits a form",
    steps: [
      "Choose a specific form or select \"All Forms\" to track every submission.",
      "Forms are auto-discovered by the plugin — run Sync Forms in WordPress if yours isn't listed.",
      "Each submission counts as one conversion, even if the same visitor submits twice.",
    ],
    example: "Example: Track all \"Request Appointment\" form submissions as a lead conversion worth $150.",
  },
  cta_click: {
    title: "Track clicks on buttons or call-to-action links",
    steps: [
      "Text contains — matches the visible button label (case-insensitive). e.g. \"Book Now\", \"Get Started\".",
      "Href contains — matches the link destination. e.g. \"calendly.com\", \"/schedule\".",
      "Page filter (optional) — only count clicks on a specific page. e.g. \"/services\".",
      "Fill in at least one of Text or Href. Both can be used together for tighter matching.",
    ],
    example: "Example: Track clicks on any button labeled \"Book Online\" that links to calendly.com.",
  },
  tel_click: {
    title: "Track phone number link clicks (tel: links)",
    steps: [
      "Toggle \"All phone clicks\" to track every tel: link click site-wide.",
      "Or enter a partial number to narrow it down — e.g. \"555\" to only track your main line.",
      "The plugin automatically detects tel: links; no extra code needed.",
    ],
    example: "Example: Track clicks on your main office number containing \"770\" as a phone lead.",
  },
  mailto_click: {
    title: "Track email link clicks (mailto: links)",
    steps: [
      "Toggle \"All email clicks\" to track every mailto: link click site-wide.",
      "Or enter a partial address to narrow it — e.g. \"info@\" to only track your main inbox.",
      "Works with any standard mailto: link on your site.",
    ],
    example: "Example: Track clicks on \"info@yourcompany.com\" as an email inquiry conversion.",
  },
  outbound_click: {
    title: "Track clicks that leave your website",
    steps: [
      "Toggle \"All outbound clicks\" to count every external link click.",
      "Or enter a domain/URL fragment to track a specific destination — e.g. \"calendly.com\".",
      "Useful for tracking referrals to booking platforms, partner sites, or review pages.",
    ],
    example: "Example: Track clicks going to \"g.page\" (Google review link) as a review conversion.",
  },
  page_visit: {
    title: "Track when a visitor lands on a specific page",
    steps: [
      "URL contains — fires when the page path includes this text. e.g. \"/thank-you\".",
      "URL exact — fires only on an exact path match. e.g. \"/contact/success\".",
      "Use one or both fields. \"Contains\" is more forgiving; \"Exact\" is stricter.",
      "Great for thank-you pages, confirmation pages, or high-intent landing pages.",
    ],
    example: "Example: Track visits to \"/thank-you\" as proof a form or purchase completed.",
  },
  custom_event: {
    title: "Track a custom JavaScript event you fire from your site",
    steps: [
      "Enter the exact event name your code dispatches — e.g. \"signup_complete\".",
      "Fire it from your site with: window.actvTrkr.track(\"signup_complete\", { plan: \"pro\" })",
      "The optional second argument is metadata (object) — kept under 4KB.",
      "Requires the ACTV TRKR plugin v1.20.0+ on your site.",
      "This is for advanced use when none of the built-in types cover your scenario.",
    ],
    example: "Example: Track a \"video_watched_75pct\" event to measure video engagement.",
  },
};

function GoalHelpBox({ goalType }: { goalType: GoalType }) {
  const help = GOAL_HELP[goalType];
  if (!help) return null;
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 mb-3">
      <div className="flex items-start gap-2 mb-2">
        <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-xs font-medium text-foreground">{help.title}</p>
      </div>
      <ul className="space-y-1 ml-5 list-disc">
        {help.steps.map((step, i) => (
          <li key={i} className="text-xs text-muted-foreground leading-relaxed">{step}</li>
        ))}
      </ul>
      <p className="text-[11px] text-primary/70 mt-2 italic">{help.example}</p>
    </div>
  );
}

/* ─── Goal Type Config Fields ─── */
function TrackingRuleFields({
  goalType, rules, onChange, forms,
}: {
  goalType: GoalType;
  rules: Record<string, any>;
  onChange: (r: Record<string, any>) => void;
  forms: any[];
}) {
  const { t } = useTranslation();
  const set = (key: string, val: any) => onChange({ ...rules, [key]: val });

  switch (goalType) {
    case "form_submission":
      return (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("goals.selectForm")}</label>
          <Select value={rules.form_id || "all"} onValueChange={(v) => set("form_id", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("goals.allForms")}</SelectItem>
              {forms.map((f: any) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "cta_click":
      return (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.textContains")}</label>
            <Input value={rules.text_contains || ""} onChange={(e) => set("text_contains", e.target.value)} placeholder='e.g. "Book Online"' className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.hrefContains")}</label>
            <Input value={rules.href_contains || ""} onChange={(e) => set("href_contains", e.target.value)} placeholder="e.g. calendly.com" className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.pageFilter")}</label>
            <Input value={rules.page_path_contains || ""} onChange={(e) => set("page_path_contains", e.target.value)} placeholder="e.g. /doctors (optional)" className="h-8 text-sm" />
          </div>
        </div>
      );

    case "tel_click":
    case "mailto_click":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch checked={rules.match === "all"} onCheckedChange={(v) => onChange(v ? { match: "all" } : {})} />
            <span className="text-xs text-muted-foreground">
              {goalType === "tel_click" ? t("goals.rule.allPhoneClicks") : t("goals.rule.allEmailClicks")}
            </span>
          </div>
          {rules.match !== "all" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.hrefContains")}</label>
              <Input value={rules.href_contains || ""} onChange={(e) => set("href_contains", e.target.value)} placeholder={goalType === "tel_click" ? "e.g. 555" : "e.g. info@"} className="h-8 text-sm" />
            </div>
          )}
        </div>
      );

    case "outbound_click":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch checked={rules.match === "all"} onCheckedChange={(v) => onChange(v ? { match: "all" } : {})} />
            <span className="text-xs text-muted-foreground">{t("goals.rule.allOutbound")}</span>
          </div>
          {rules.match !== "all" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.urlContains")}</label>
              <Input value={rules.href_contains || ""} onChange={(e) => set("href_contains", e.target.value)} placeholder="e.g. calendly.com" className="h-8 text-sm" />
            </div>
          )}
        </div>
      );

    case "page_visit":
      return (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.urlContains")}</label>
            <Input value={rules.url_contains || ""} onChange={(e) => set("url_contains", e.target.value)} placeholder="e.g. /thank-you" className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.urlExact")}</label>
            <Input value={rules.url_exact || ""} onChange={(e) => set("url_exact", e.target.value)} placeholder="e.g. /contact/success" className="h-8 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">{t("goals.rule.urlNote")}</p>
        </div>
      );

    case "custom_event":
      return (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("goals.rule.eventName")}</label>
          <Input value={rules.event_name || ""} onChange={(e) => set("event_name", e.target.value)} placeholder="e.g. signup_complete" className="h-8 text-sm" />
        </div>
      );

    default:
      return null;
  }
}

/* ─── Create Goal Dialog ─── */
export function CreateGoalDialog({ orgId, forms, triggerLabel, triggerVariant, triggerClassName }: { orgId: string; forms: any[]; triggerLabel?: string; triggerVariant?: "default" | "outline" | "ghost" | "secondary"; triggerClassName?: string }) {
  const { t } = useTranslation();
  const createGoal = useCreateGoal(orgId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("cta_click");
  const [rules, setRules] = useState<Record<string, any>>({});
  const [isConversion, setIsConversion] = useState(true);
  const [conversionValue, setConversionValue] = useState("");

  const reset = () => {
    setName(""); setDescription(""); setGoalType("cta_click");
    setRules({}); setIsConversion(true); setConversionValue("");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createGoal.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        goal_type: goalType,
        tracking_rules: rules,
        is_conversion: isConversion,
        conversion_value: conversionValue ? parseFloat(conversionValue) : null,
      });
      toast.success(t("goals.created"));
      reset();
      setOpen(false);
    } catch {
      toast.error(t("goals.createError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant ?? "default"} className={triggerClassName}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {triggerLabel ?? t("goals.createGoal")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("goals.createGoal")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Goal Type */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.goalType")}</label>
            <Select value={goalType} onValueChange={(v) => { setGoalType(v as GoalType); setRules({}); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((gt) => (
                  <SelectItem key={gt.value} value={gt.value}>
                    <span className="mr-2">{gt.icon}</span> {t(gt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tracking Rules */}
          <div className="border border-border rounded-lg p-3 bg-muted/30">
            <p className="text-xs font-medium text-foreground mb-2">{t("goals.trackingRules")}</p>
            <GoalHelpBox goalType={goalType} />
            <TrackingRuleFields goalType={goalType} rules={rules} onChange={setRules} forms={forms} />
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.goalName")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goals.namePlaceholder")} />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.goalDescription")}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("goals.descriptionPlaceholder")} rows={2} />
          </div>

          {/* Conversion toggle */}
          <div className="flex items-center justify-between border border-border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t("goals.markAsConversion")}</p>
              <p className="text-xs text-muted-foreground">{t("goals.conversionHelp")}</p>
            </div>
            <Switch checked={isConversion} onCheckedChange={setIsConversion} />
          </div>

          {/* Conversion value */}
          {isConversion && (
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.conversionValueLabel")}</label>
              <Input type="number" value={conversionValue} onChange={(e) => setConversionValue(e.target.value)} placeholder="0.00" className="w-32" />
              <p className="text-xs text-muted-foreground mt-1">{t("goals.conversionValueHelp")}</p>
            </div>
          )}

          <Button onClick={handleCreate} disabled={!name.trim() || createGoal.isPending} className="w-full">
            {createGoal.isPending ? t("common.saving") : t("goals.createGoal")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Goal Dialog ─── */
function EditGoalDialog({ goal, orgId, forms, autoOpen, onAutoOpenConsumed }: { goal: ConversionGoal; orgId: string; forms: any[]; autoOpen?: boolean; onAutoOpenConsumed?: () => void }) {
  const { t } = useTranslation();
  const updateGoal = useUpdateGoal(orgId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(goal.name);
  const [description, setDescription] = useState(goal.description || "");
  const [goalType, setGoalType] = useState<GoalType>(goal.goal_type as GoalType);
  const [rules, setRules] = useState<Record<string, any>>(goal.tracking_rules || {});
  const [isConversion, setIsConversion] = useState(goal.is_conversion);
  const [conversionValue, setConversionValue] = useState(goal.conversion_value?.toString() || "");

  useEffect(() => {
    if (autoOpen && !open) {
      setName(goal.name);
      setDescription(goal.description || "");
      setGoalType(goal.goal_type as GoalType);
      setRules(goal.tracking_rules || {});
      setIsConversion(goal.is_conversion);
      setConversionValue(goal.conversion_value?.toString() || "");
      setOpen(true);
      onAutoOpenConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const handleOpen = (v: boolean) => {
    if (v) {
      setName(goal.name);
      setDescription(goal.description || "");
      setGoalType(goal.goal_type as GoalType);
      setRules(goal.tracking_rules || {});
      setIsConversion(goal.is_conversion);
      setConversionValue(goal.conversion_value?.toString() || "");
    }
    setOpen(v);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        name: name.trim(),
        description: description.trim(),
        goal_type: goalType,
        tracking_rules: rules,
        is_conversion: isConversion,
        conversion_value: conversionValue ? parseFloat(conversionValue) : null,
      });
      toast.success(t("goals.updated", "Goal updated"));
      setOpen(false);
    } catch {
      toast.error(t("goals.updateError", "Failed to update goal"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title={t("common.edit", "Edit")}>
          <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("goals.editGoal", "Edit Goal")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.goalType")}</label>
            <Select value={goalType} onValueChange={(v) => { setGoalType(v as GoalType); setRules({}); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((gt) => (
                  <SelectItem key={gt.value} value={gt.value}>
                    <span className="mr-2">{gt.icon}</span> {t(gt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border border-border rounded-lg p-3 bg-muted/30">
            <p className="text-xs font-medium text-foreground mb-2">{t("goals.trackingRules")}</p>
            <GoalHelpBox goalType={goalType} />
            <TrackingRuleFields goalType={goalType} rules={rules} onChange={setRules} forms={forms} />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.goalName")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goals.namePlaceholder")} />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.goalDescription")}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("goals.descriptionPlaceholder")} rows={2} />
          </div>

          <div className="flex items-center justify-between border border-border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t("goals.markAsConversion")}</p>
              <p className="text-xs text-muted-foreground">{t("goals.conversionHelp")}</p>
            </div>
            <Switch checked={isConversion} onCheckedChange={setIsConversion} />
          </div>

          {isConversion && (
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">{t("goals.conversionValueLabel")}</label>
              <Input type="number" value={conversionValue} onChange={(e) => setConversionValue(e.target.value)} placeholder="0.00" className="w-32" />
              <p className="text-xs text-muted-foreground mt-1">{t("goals.conversionValueHelp")}</p>
            </div>
          )}

          <Button onClick={handleSave} disabled={!name.trim() || updateGoal.isPending} className="w-full">
            {updateGoal.isPending ? t("common.saving") : t("common.save", "Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Goal Card ─── */
function GoalCard({ goal, orgId, forms, autoOpen, onAutoOpenConsumed }: { goal: ConversionGoal; orgId: string; forms: any[]; autoOpen?: boolean; onAutoOpenConsumed?: () => void }) {
  const { t } = useTranslation();
  const updateGoal = useUpdateGoal(orgId);
  const deleteGoal = useDeleteGoal(orgId);
  const typeInfo = GOAL_TYPES.find((gt) => gt.value === goal.goal_type);

  const rulesText = () => {
    const r = goal.tracking_rules || {};
    const parts: string[] = [];
    if (r.text_contains) parts.push(`text ≈ "${r.text_contains}"`);
    if (r.href_contains) parts.push(`href ≈ "${r.href_contains}"`);
    if (r.url_contains) parts.push(`URL ≈ "${r.url_contains}"`);
    if (r.url_exact) parts.push(`URL = "${r.url_exact}"`);
    if (r.page_path_contains) parts.push(`page ≈ "${r.page_path_contains}"`);
    if (r.event_name) parts.push(`event = "${r.event_name}"`);
    if (r.form_id === "all") parts.push("all forms");
    if (r.form_id && r.form_id !== "all") parts.push(`form: ${r.form_id.slice(0, 8)}…`);
    if (r.match === "all") parts.push("all");
    return parts.join(" · ") || "—";
  };

  return (
    <div id={`goal-${goal.id}`} className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${autoOpen ? "ring-2 ring-primary" : ""} ${goal.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-lg flex-shrink-0">{typeInfo?.icon || "🎯"}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{goal.name}</span>
            {goal.is_conversion ? (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">Conversion</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Informational</Badge>
            )}
            {!goal.is_active && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {t(typeInfo?.labelKey || "goals.type.ctaClick")} · {rulesText()}
          </p>
          {goal.description && (
            <p className="text-xs text-muted-foreground/70 truncate">{goal.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 ml-3 flex-shrink-0">
        <EditGoalDialog goal={goal} orgId={orgId} forms={forms} autoOpen={autoOpen} onAutoOpenConsumed={onAutoOpenConsumed} />
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          title={goal.is_active ? t("goals.deactivate") : t("goals.activate")}
          onClick={() => updateGoal.mutate({ id: goal.id, is_active: !goal.is_active })}
        >
          <Power className={`h-3.5 w-3.5 ${goal.is_active ? "text-success" : "text-muted-foreground"}`} />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => {
            deleteGoal.mutate(goal.id, {
              onSuccess: () => toast.success(t("goals.deleted")),
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function GoalsSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const { data: goals = [], isLoading } = useGoals(orgId);
  const { data: forms = [] } = useForms(orgId);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusGoalId = searchParams.get("goal");

  const activeGoals = goals.filter((g) => g.is_active);
  const conversionGoals = goals.filter((g) => g.is_conversion && g.is_active);

  // Scroll the focused goal into view once goals load
  useEffect(() => {
    if (!focusGoalId || isLoading) return;
    const el = document.getElementById(`goal-${focusGoalId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusGoalId, isLoading]);

  const clearFocus = () => {
    if (!focusGoalId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("goal");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="glass-card p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {t("goals.title")}
        </h3>
        {orgId && <CreateGoalDialog orgId={orgId} forms={forms} />}
      </div>
      <p className="text-xs text-muted-foreground mb-1">{t("goals.description")}</p>
      <p className="text-xs text-muted-foreground mb-4">
        {t("goals.cvrExplanation")}
      </p>

      {/* Stats */}
      <div className="flex gap-4 mb-4">
        <div className="text-center">
          <span className="text-lg font-bold font-mono-data text-foreground">{goals.length}</span>
          <p className="text-xs text-muted-foreground">{t("goals.totalGoals")}</p>
        </div>
        <div className="text-center">
          <span className="text-lg font-bold font-mono-data text-success">{activeGoals.length}</span>
          <p className="text-xs text-muted-foreground">{t("goals.active")}</p>
        </div>
        <div className="text-center">
          <span className="text-lg font-bold font-mono-data text-primary">{conversionGoals.length}</span>
          <p className="text-xs text-muted-foreground">{t("goals.conversionsLabel")}</p>
        </div>
      </div>

      {/* Goals list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t("goals.empty")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("goals.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              orgId={orgId!}
              forms={forms}
              autoOpen={focusGoalId === g.id}
              onAutoOpenConsumed={clearFocus}
            />
          ))}
        </div>
      )}
    </div>
  );
}
