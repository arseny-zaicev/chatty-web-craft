import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Clears the React Query cache whenever the authenticated user changes
 * (sign-out, or a different user signing in). Prevents the previous user's
 * cached data (workspace, pipeline, conversations, etc.) from being shown
 * to the next user before the first refetch completes.
 */
export default function AuthCacheReset() {
  const queryClient = useQueryClient();
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      lastUserIdRef.current = session?.user?.id ?? null;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;
      const prev = lastUserIdRef.current;

      if (event === "INITIAL_SESSION") {
        lastUserIdRef.current = nextUserId;
        return;
      }

      const userChanged = prev !== undefined && prev !== nextUserId;
      if (event === "SIGNED_OUT" || userChanged) {
        queryClient.cancelQueries();
        queryClient.clear();
      }
      lastUserIdRef.current = nextUserId;
    });

    return () => { subscription.unsubscribe(); };
  }, [queryClient]);

  return null;
}
