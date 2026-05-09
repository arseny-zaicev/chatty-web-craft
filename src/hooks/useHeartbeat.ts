import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Pings `record_heartbeat` once on mount and every minute while the tab is visible.
 * Drives the per-user "active minutes" metric shown to managers in Team & client access.
 */
export function useHeartbeat() {
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const ping = async () => {
      if (document.visibilityState !== "visible") return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      await supabase.rpc("record_heartbeat");
    };

    ping();
    timer = window.setInterval(ping, 60_000);

    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
