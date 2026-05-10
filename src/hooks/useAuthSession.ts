import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/** Subscribes to Supabase auth and exposes the current session.
 *  Use this instead of re-implementing getSession + onAuthStateChange in pages. */
export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      setLoaded(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, userId: session?.user.id ?? null, email: session?.user.email ?? null, loaded };
}

/** Redirect to `redirectTo` when there is no session. Returns the current userId. */
export function useRequireAuth(redirectTo: string = "/admin-auth") {
  const navigate = useNavigate();
  const { session, userId, loaded } = useAuthSession();
  useEffect(() => {
    if (loaded && !session) navigate(redirectTo);
  }, [loaded, session, navigate, redirectTo]);
  return userId;
}

export async function signOutAndRedirect(navigate: ReturnType<typeof useNavigate>, to: string = "/admin-auth") {
  await supabase.auth.signOut();
  navigate(to, { replace: true });
}
