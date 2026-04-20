import { useMemo, useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Archive, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Banner shown at top of every dashboard page when the active org's
 * lifecycle status is `grace_period` or `archived`. Tracking is paused;
 * the user can reactivate via the smart-reactivate flow (Stripe portal
 * if a recoverable sub exists, otherwise fresh checkout).
 *
 * billing_exempt orgs never see this banner — they're permanently active.
 */
export function LifecycleBanner() {
  const { orgs, orgId } = useOrg();
  const [busy, setBusy] = useState(false);

  const org = useMemo(
    () => (orgs as any[]).find((o) => o.id === orgId) ?? null,
    [orgs, orgId]
  );

  if (!org) return null;
  if (org.billing_exempt === true) return null;
  if (org.status !== "grace_period" && org.status !== "archived") return null;

  const isGrace = org.status === "grace_period";
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

  const graceEnd = fmt(org.grace_period_ends_at);
  const archivedAt = fmt(org.archived_at);

  const handleReactivate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("smart-reactivate", { body: {} });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url as string;
      } else {
        throw new Error("No reactivation URL returned");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not start reactivation");
      setBusy(false);
    }
  };

  return (
    <div
      className={`mb-4 rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isGrace
          ? "border-warning/40 bg-warning/10 text-warning-foreground"
          : "border-destructive/40 bg-destructive/10 text-destructive-foreground"
      }`}
      role="alert"
    >
      <div className="flex items-start gap-3 min-w-0">
        {isGrace ? (
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        ) : (
          <Archive className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {isGrace
              ? "Your subscription is inactive — tracking is paused"
              : "Your account is archived — tracking is paused"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isGrace
              ? `Your data is safe${graceEnd ? ` until ${graceEnd}` : ""}. Reactivate to resume tracking.`
              : `Your data is preserved${archivedAt ? ` since ${archivedAt}` : ""}. Reactivate to restore access and resume tracking.`}
          </p>
        </div>
      </div>
      <Button onClick={handleReactivate} disabled={busy} size="sm" className="shrink-0">
        {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
        Reactivate subscription
      </Button>
    </div>
  );
}
