import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type ActiveGrant = {
  id: string;
  org_id: string;
  expires_at: string;
};

/**
 * Helper hook used inside admin-only views (customer detail sheets,
 * impersonation flows, etc.). When the targeted org has an active
 * dashboard access grant, every meaningful admin action should call
 * `logAction()` so the customer can later see what we did under that
 * consent window.
 *
 * Safe to use even when there's no active grant — `logAction` becomes
 * a no-op so callers don't need to branch.
 */
export function useSupportAccessAudit(orgId: string | null | undefined) {
  const { user } = useAuth();
  const [activeGrant, setActiveGrant] = useState<ActiveGrant | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch + cache the current active grant for this org. We re-check on
  // window focus so revocations made elsewhere are picked up quickly.
  const refresh = useCallback(async () => {
    if (!orgId) {
      setActiveGrant(null);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("dashboard_access_grants")
      .select("id, org_id, expires_at")
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveGrant(data ?? null);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const logAction = useCallback(
    async (
      action: string,
      opts?: {
        resourceType?: string;
        resourceId?: string;
        metadata?: Record<string, unknown>;
      },
    ) => {
      if (!activeGrant || !user?.id || !orgId) return;
      try {
        await supabase.from("dashboard_access_audit_log").insert({
          grant_id: activeGrant.id,
          org_id: orgId,
          admin_user_id: user.id,
          action,
          resource_type: opts?.resourceType ?? null,
          resource_id: opts?.resourceId ?? null,
          metadata: (opts?.metadata ?? {}) as never,
        });
      } catch {
        // Audit logging is best-effort — never block the admin's action.
      }
    },
    [activeGrant, orgId, user?.id],
  );

  return {
    activeGrant,
    hasActiveGrant: !!activeGrant,
    loading,
    logAction,
    refresh,
  };
}
