import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;

    // Force a hard logout when the underlying auth.users row no longer exists
    // (e.g. admin deleted the user while they were logged in). Without this the
    // app loops between protected routes and "/" because the JWT is still in
    // localStorage but every /user call returns 403 user_not_found.
    const forceHardLogout = async (reason: string) => {
      try { await supabase.auth.signOut({ scope: "local" }); } catch {}
      try {
        // Belt-and-braces: nuke any leftover sb-* tokens
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") || k === "supabase.auth.token")
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
      queryClient.clear();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
        window.location.replace(`/auth?reason=${encodeURIComponent(reason)}`);
      }
    };

    const RECOVERY_FLAG = "pw_recovery_in_progress";
    const RECOVERY_TS_KEY = "pw_recovery_started_at";
    const RECOVERY_TTL_MS = 30 * 60 * 1000;
    const isResetPasswordRoute = () => typeof window !== "undefined" && window.location.pathname.startsWith("/reset-password");
    const isRecoveryFlow = () => {
      try {
        const sessionFlag = sessionStorage.getItem(RECOVERY_FLAG) === "1";
        const localFlag = localStorage.getItem(RECOVERY_FLAG) === "1";
        const startedAt = Number(localStorage.getItem(RECOVERY_TS_KEY) || "0");
        const isFresh = startedAt > 0 && Date.now() - startedAt < RECOVERY_TTL_MS;
        if (localFlag && !isFresh) {
          localStorage.removeItem(RECOVERY_FLAG);
          localStorage.removeItem(RECOVERY_TS_KEY);
          return sessionFlag;
        }
        return sessionFlag || (localFlag && isFresh);
      } catch {
        return false;
      }
    };
    const discardRecoverySession = async () => {
      try { await supabase.auth.signOut({ scope: "local" }); } catch {}
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") || k === "supabase.auth.token")
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
      queryClient.clear();
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      // User row was deleted server-side — refresh attempt failed.
      if (event === "TOKEN_REFRESHED" && !nextSession) {
        forceHardLogout("session_expired");
        return;
      }
      if (event === "USER_DELETED" as any) {
        forceHardLogout("account_removed");
        return;
      }

      // Password recovery sessions must NEVER be treated as a normal login.
      // Supabase fires SIGNED_IN the moment the recovery token is consumed;
      // if we accept it, every tab/window on this browser is silently logged
      // in. ResetPassword.tsx sets the flag for the duration of the flow.
      if (event === "PASSWORD_RECOVERY" || (isRecoveryFlow() && event === "SIGNED_IN")) {
        if (!isResetPasswordRoute()) {
          void discardRecoverySession();
          setSession(null);
        }
        setLoading(false);
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        setSession(nextSession);
        if (event === "SIGNED_IN" && nextSession) {
          supabase.functions.invoke("log-login").catch(() => {});
          supabase.rpc("mark_invite_accepted").catch(() => {});
        }
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        queryClient.clear();
      } else {
        setSession(nextSession);
      }

      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!isMounted) return;

      // Recovery flow: do not surface the recovery session to the rest of
      // the app. ResetPassword owns the lifecycle and will sign out at the
      // end (or on unmount).
      if (initialSession && isRecoveryFlow()) {
        if (!isResetPasswordRoute()) {
          await discardRecoverySession();
        }
        setSession(null);
        setLoading(false);
        return;
      }

      // If we have a session token, verify the user still exists. If the row
      // was deleted, getUser() returns a user_not_found / 403 error and we
      // must purge the stale token before any protected route renders.
      if (initialSession) {
        const { data: userData, error } = await supabase.auth.getUser();
        if (!isMounted) return;
        const errMsg = (error as any)?.message?.toLowerCase?.() ?? "";
        const errStatus = (error as any)?.status;
        if (error && (errStatus === 403 || errStatus === 404 || errMsg.includes("user_not_found") || errMsg.includes("user from sub claim"))) {
          await forceHardLogout("account_removed");
          return;
        }
        if (!userData?.user) {
          await forceHardLogout("session_expired");
          return;
        }
      }

      setSession(initialSession);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async (redirectTo = "/auth") => {
    await supabase.auth.signOut();
    window.location.href = redirectTo;
  };

  return { session, loading, signOut, user: session?.user };
}
