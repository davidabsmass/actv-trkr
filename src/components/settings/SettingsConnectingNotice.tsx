import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, Loader2 } from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";

/**
 * Onboarding-aware notice shown on the Settings page during the first
 * connection window. Tells brand-new users explicitly that:
 *   1. The Dashboard tab is intentionally locked until the first signal
 *      arrives from their WordPress plugin.
 *   2. The wait is normal and usually 1–3 minutes (sometimes up to 15).
 *   3. They don't need to do anything else after pasting their license key.
 *
 * Visibility rules:
 *   - Only shown during the first 24h after the org was created.
 *   - Hidden once we receive the first heartbeat (a site exists with
 *     `last_heartbeat_at` set), because at that point the user can already
 *     click Dashboard.
 *   - Always rendered above the tabs so it's the first thing the user sees
 *     on the page they're stuck on.
 */
export function SettingsConnectingNotice() {
  const { orgId, orgCreatedAt } = useOrg();

  const ageMs = orgCreatedAt ? Date.now() - new Date(orgCreatedAt).getTime() : 0;
  const isFresh = orgCreatedAt && !Number.isNaN(ageMs) && ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;

  const { data: connectionState } = useQuery({
    queryKey: ["settings-connecting-state", orgId],
    queryFn: async () => {
      if (!orgId) return { hasSite: false, hasHeartbeat: false };
      const { data } = await supabase
        .from("sites")
        .select("id, last_heartbeat_at")
        .eq("org_id", orgId)
        .limit(5);
      const hasSite = (data?.length ?? 0) > 0;
      const hasHeartbeat = (data ?? []).some((s) => !!s.last_heartbeat_at);
      return { hasSite, hasHeartbeat };
    },
    enabled: !!orgId && !!isFresh,
    refetchInterval: 5000,
  });

  if (!isFresh) return null;
  // Once we've received a heartbeat, the dashboard is unlocked — no need
  // to keep nagging the user with this notice.
  if (connectionState?.hasHeartbeat) return null;

  const hasSite = connectionState?.hasSite ?? false;

  return (
    <div className="mb-5 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5 flex items-start gap-3 animate-slide-up">
      <div className="mt-0.5 flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
        {hasSite ? (
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
        ) : (
          <Clock className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-semibold text-foreground">
          {hasSite
            ? "We're connecting your website — give us a few minutes"
            : "Almost there — finish setup, then give us a few minutes"}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {hasSite ? (
            <>
              Your WordPress plugin is talking to us. The first full sync —
              forms, traffic, SEO and monitoring — usually takes{" "}
              <strong className="text-foreground">1–3 minutes</strong> and can occasionally
              run up to <strong className="text-foreground">15 minutes</strong> on slower
              hosts. The <strong className="text-foreground">Dashboard</strong> tab will
              unlock automatically as soon as your first signal arrives — you don't need
              to refresh.
            </>
          ) : (
            <>
              Once you've installed the plugin and pasted your license key, it usually
              takes <strong className="text-foreground">1–3 minutes</strong> for the first
              signal to arrive (sometimes up to 15 on slower hosts). The{" "}
              <strong className="text-foreground">Dashboard</strong> tab will unlock
              automatically — you don't need to refresh or click anything else.
            </>
          )}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span>You can safely close this tab — we'll keep listening in the background.</span>
        </div>
      </div>
    </div>
  );
}
