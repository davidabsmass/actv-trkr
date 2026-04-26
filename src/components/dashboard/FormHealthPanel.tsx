import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { CheckCircle2, AlertTriangle, XCircle, Clock, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

type FormHealth = {
  id: string;
  name: string;
  status: "healthy" | "low_activity" | "errors" | "no_activity" | "not_rendered";
  detail: string;
};

export function FormHealthPanel({ orgId }: { orgId: string | null }) {
  const { t } = useTranslation();

  const { data: healthData, isLoading } = useQuery({
    queryKey: ["form_health", orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const now = new Date();
      const thirtyDaysAgo = format(subDays(now, 30), "yyyy-MM-dd");
      const sevenDaysAgo = format(subDays(now, 7), "yyyy-MM-dd");

      // Get active forms (not archived AND active in WordPress)
      const { data: forms } = await supabase
        .from("forms").select("id, name")
        .eq("org_id", orgId).eq("archived", false).neq("is_active", false);
      if (!forms || forms.length === 0) return [];

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

      return forms.map((form): FormHealth => {
        const count30 = leads30Map[form.id] || 0;
        const count7 = leads7Map[form.id] || 0;
        const errCount = errorMap[form.id] || 0;
        const baseline7 = Math.round(count30 / 4.3);
        const probe = healthCheckMap[form.id];

        // Liveness probe failure takes highest priority
        if (probe && !probe.is_rendered) {
          const reason = probe.last_failure_reason
            || (probe.last_http_status === 404 || probe.last_http_status === 410
              ? `Page not found (HTTP ${probe.last_http_status})`
              : probe.last_http_status && probe.last_http_status >= 500
                ? `Server error (HTTP ${probe.last_http_status})`
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

  if (isLoading || !healthData || healthData.length === 0) return null;

  const statusConfig = {
    healthy: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: t("dashboard.formHealthHealthy") },
    low_activity: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: t("dashboard.formHealthLowActivity") },
    errors: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: t("dashboard.formHealthErrors") },
    no_activity: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: t("dashboard.formHealthNoActivity") },
    not_rendered: { icon: EyeOff, color: "text-destructive", bg: "bg-destructive/10", label: t("dashboard.formHealthNotFound") },
  };

  const hasNotRendered = healthData.some((f) => f.status === "not_rendered");

  return (
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-semibold text-foreground mb-3">{t("dashboard.formHealth")}</h3>
      <div className="space-y-2">
        {healthData.map((form) => {
          const cfg = statusConfig[form.status];
          const Icon = cfg.icon;
          return (
            <Link
              key={form.id}
              to={`/forms?selected=${form.id}`}
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-1.5 rounded-md ${cfg.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{form.name}</p>
                  <p className="text-xs text-muted-foreground">{form.detail}</p>
                </div>
              </div>
              <span className={`text-xs uppercase font-semibold tracking-wider ${cfg.color}`}>
                {cfg.label}
              </span>
            </Link>
          );
        })}
      </div>
      {hasNotRendered && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {t("dashboard.formNotRenderingHint", "Form not rendering? Check that the page is published and the form is embedded.")}
          </span>
          <Link to="/forms/troubleshooting" className="text-primary hover:underline whitespace-nowrap font-medium">
            {t("dashboard.howToFix", "How to fix")} →
          </Link>
        </div>
      )}
    </div>
  );
}
