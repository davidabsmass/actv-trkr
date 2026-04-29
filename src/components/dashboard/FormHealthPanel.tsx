import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { CheckCircle2, AlertTriangle, XCircle, Clock, EyeOff, MoreHorizontal, RefreshCw, FileX, Trash2, Archive } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

type FormHealth = {
  id: string;
  name: string;
  status: "healthy" | "low_activity" | "errors" | "no_activity" | "not_rendered" | "embedded";
  detail: string;
};

type DisableReason = "page_removed" | "not_a_form" | "intentional";

export function FormHealthPanel({ orgId }: { orgId: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: healthData, isLoading } = useQuery({
    queryKey: ["form_health", orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const now = new Date();
      const thirtyDaysAgo = format(subDays(now, 30), "yyyy-MM-dd");
      const sevenDaysAgo = format(subDays(now, 7), "yyyy-MM-dd");

      // Get active forms (not archived, active in WP, and not user-disabled from monitoring)
      const { data: forms } = await supabase
        .from("forms").select("id, name, health_check_disabled")
        .eq("org_id", orgId).eq("archived", false).neq("is_active", false);
      if (!forms || forms.length === 0) return [];

      const monitoredForms = forms.filter((f: any) => !f.health_check_disabled);
      if (monitoredForms.length === 0) return [];

      // Get form health checks (liveness probes)
      const { data: healthChecks } = await supabase
        .from("form_health_checks")
        .select("form_id, is_rendered, last_checked_at, page_url, last_http_status, last_failure_reason")
        .eq("org_id", orgId);

      const healthCheckMap: Record<string, { is_rendered: boolean; last_checked_at: string; page_url: string | null; last_http_status: number | null; last_failure_reason: string | null }> = {};
      (healthChecks || []).forEach((h: any) => {
        healthCheckMap[h.form_id] = h;
      });

      // Get 30-day submission counts per form
      const { data: leads30d } = await supabase
        .from("leads").select("form_id, submitted_at")
        .eq("org_id", orgId)
        .gte("submitted_at", `${thirtyDaysAgo}T00:00:00Z`);

      // Get 7-day submission counts per form
      const { data: leads7d } = await supabase
        .from("leads").select("form_id")
        .eq("org_id", orgId)
        .gte("submitted_at", `${sevenDaysAgo}T00:00:00Z`);

      // Get recent errors
      const { data: errors } = await supabase
        .from("form_submission_logs").select("form_id")
        .eq("org_id", orgId).eq("status", "fail")
        .gte("occurred_at", `${sevenDaysAgo}T00:00:00Z`);

      const leads30Map: Record<string, number> = {};
      const leads7Map: Record<string, number> = {};
      const errorMap: Record<string, number> = {};

      (leads30d || []).forEach(l => { leads30Map[l.form_id] = (leads30Map[l.form_id] || 0) + 1; });
      (leads7d || []).forEach(l => { leads7Map[l.form_id] = (leads7Map[l.form_id] || 0) + 1; });
      (errors || []).forEach(e => { if (e.form_id) errorMap[e.form_id] = (errorMap[e.form_id] || 0) + 1; });

      return monitoredForms.map((form: any): FormHealth => {
        const count30 = leads30Map[form.id] || 0;
        const count7 = leads7Map[form.id] || 0;
        const errCount = errorMap[form.id] || 0;
        const baseline7 = Math.round(count30 / 4.3);
        const probe = healthCheckMap[form.id];

        if (probe && !probe.is_rendered) {
          const status = probe.last_http_status;
          // Page loads fine (2xx) but no form markup detected — almost always
          // a third-party embed (Constant Contact, HubSpot, Mailchimp, etc.)
          // we can't see from server-side HTML. Surface as informational.
          if (status && status >= 200 && status < 300) {
            return {
              id: form.id,
              name: form.name,
              status: "embedded",
              detail: "Looks like a third-party embed (e.g. Constant Contact). No action needed.",
            };
          }
          const reason = probe.last_failure_reason
            || (status === 404 || status === 410
              ? `Page removed (HTTP ${status})`
              : status && status >= 500
                ? `Server error (HTTP ${status})`
                : t("formHealth.notDetected", { date: format(new Date(probe.last_checked_at), "MMM d, HH:mm") }));
          return { id: form.id, name: form.name, status: "not_rendered", detail: reason };
        }
        if (errCount > 0) {
          return { id: form.id, name: form.name, status: "errors", detail: t("formHealth.errorsThisWeek", { count: errCount }) };
        }
        if (count30 === 0) {
          return { id: form.id, name: form.name, status: "no_activity", detail: t("formHealth.noSubmissions30d") };
        }
        if (baseline7 > 0 && count7 < baseline7 * 0.5) {
          return { id: form.id, name: form.name, status: "low_activity", detail: t("formHealth.vsExpected", { actual: count7, expected: baseline7 }) };
        }
        return { id: form.id, name: form.name, status: "healthy", detail: t("formHealth.submissionsThisWeek", { count: count7 }) };
      });
    },
    enabled: !!orgId,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["form_health", orgId] });
    queryClient.invalidateQueries({ queryKey: ["unhealthy_forms", orgId] });
    queryClient.invalidateQueries({ queryKey: ["forms", orgId] });
  };

  const disableMonitoring = async (formId: string, reason: DisableReason, copy: string) => {
    setPendingId(formId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("forms")
        .update({
          health_check_disabled: true,
          health_check_disabled_reason: reason,
          health_check_disabled_at: new Date().toISOString(),
          health_check_disabled_by: user?.id ?? null,
        })
        .eq("id", formId);
      if (error) throw error;

      // Also clear the existing health-check row so it stops counting elsewhere.
      await supabase
        .from("form_health_checks")
        .update({ is_rendered: true, last_failure_reason: null })
        .eq("form_id", formId);

      toast({ title: copy, description: "You can re-enable monitoring from Settings → Forms." });
      refreshAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't update form", description: err?.message });
    } finally {
      setPendingId(null);
    }
  };

  const archiveForm = async (formId: string) => {
    setPendingId(formId);
    try {
      const { error } = await supabase.from("forms").update({ archived: true }).eq("id", formId);
      if (error) throw error;
      toast({ title: "Form archived", description: "Hidden from all views. Restore from Settings → Forms → Archived." });
      refreshAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't archive form", description: err?.message });
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading || !healthData || healthData.length === 0) return null;

  const statusConfig = {
    healthy: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: t("dashboard.formHealthHealthy") },
    low_activity: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: t("dashboard.formHealthLowActivity") },
    errors: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: t("dashboard.formHealthErrors") },
    no_activity: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: t("dashboard.formHealthNoActivity") },
    not_rendered: { icon: EyeOff, color: "text-destructive", bg: "bg-destructive/10", label: t("dashboard.formHealthNotFound") },
    embedded: { icon: CheckCircle2, color: "text-muted-foreground", bg: "bg-muted", label: "Embedded" },
  };

  const hasNotRendered = healthData.some((f) => f.status === "not_rendered");

  return (
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-semibold text-foreground mb-3">{t("dashboard.formHealth")}</h3>
      <div className="space-y-2">
        {healthData.map((form) => {
          const cfg = statusConfig[form.status];
          const Icon = cfg.icon;
          const isNotRendered = form.status === "not_rendered";

          const rowInner = (
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-1.5 rounded-md ${cfg.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{form.name}</p>
                  <p className="text-xs text-muted-foreground">{form.detail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs uppercase font-semibold tracking-wider ${cfg.color}`}>
                  {cfg.label}
                </span>
                {isNotRendered && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      onClick={(e) => e.preventDefault()}
                      disabled={pendingId === form.id}
                      className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Resolve options"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel className="text-xs">Why isn't this rendering?</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          disableMonitoring(form.id, "page_removed", "Stopped monitoring — page removed");
                        }}
                      >
                        <FileX className="h-3.5 w-3.5 mr-2" />
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">The page was removed</span>
                          <span className="text-[10px] text-muted-foreground">Stop checking this form</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          disableMonitoring(form.id, "not_a_form", "Stopped monitoring — not a real form");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">This isn't a real form</span>
                          <span className="text-[10px] text-muted-foreground">Probably a third-party widget</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          refreshAll();
                          toast({ title: "Re-checking…", description: "Status will update on the next probe cycle." });
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-2" />
                        <span className="text-xs">Re-check now</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          archiveForm(form.id);
                        }}
                      >
                        <Archive className="h-3.5 w-3.5 mr-2" />
                        <span className="text-xs">Archive form (hide everywhere)</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          );

          return (
            <Link
              key={form.id}
              to={`/forms?selected=${form.id}`}
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
            >
              {rowInner}
            </Link>
          );
        })}
      </div>
      {hasNotRendered && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {t("dashboard.formNotRenderingHint", "Form not rendering? Use the menu on the right to mark it as removed or not a real form.")}
          </span>
          <Link to="/forms/troubleshooting" className="text-primary hover:underline whitespace-nowrap font-medium">
            {t("dashboard.howToFix", "How to fix")} →
          </Link>
        </div>
      )}
    </div>
  );
}
