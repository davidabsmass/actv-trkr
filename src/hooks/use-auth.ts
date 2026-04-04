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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        setSession(nextSession);
        if (event === "SIGNED_IN" && nextSession) {
          supabase.functions.invoke("log-login").catch(() => {});
        }
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        queryClient.clear();
      } else {
        setSession(nextSession);
      }

      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) return;
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
