import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type Event = "INSERT" | "UPDATE" | "DELETE" | "*";

type Options = {
  channel: string;
  table: string;
  event?: Event;
  filter?: string;
  schema?: string;
  enabled?: boolean;
};

/** Centralized realtime subscription helper to remove channel boilerplate. */
export function useRealtimeTable<T extends Record<string, any>>(
  opts: Options,
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
  deps: React.DependencyList = [],
) {
  const { channel, table, event = "*", filter, schema = "public", enabled = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(channel)
      .on(
        // @ts-expect-error supabase types are loose for postgres_changes
        "postgres_changes",
        { event, schema, table, ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<T>) => onChange(payload),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, table, event, filter, schema, enabled, ...deps]);
}
