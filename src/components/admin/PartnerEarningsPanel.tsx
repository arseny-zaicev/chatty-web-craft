import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, subDays } from "date-fns";

type Row = {
  day: string;
  whatsapp_number_id: string;
  delivered: number;
  rate_usd: number;
  role: string;
  earned_usd: number;
};

const fmtUsd = (n: number) =>
  `$${(Math.round(n * 10000) / 10000).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

export function PartnerEarningsPanel({ partnerId }: { partnerId: string }) {
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "partner-earnings", partnerId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("partner_earnings_breakdown" as any, {
        p_partner_id: partnerId, p_from: from, p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const numberIds = useMemo(
    () => Array.from(new Set((rows ?? []).map(r => r.whatsapp_number_id))),
    [rows],
  );
  const { data: nums } = useQuery({
    queryKey: ["admin", "earnings-nums", numberIds.join(",")],
    enabled: numberIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name")
        .in("id", numberIds);
      const m = new Map<string, any>();
      (data ?? []).forEach((n: any) => m.set(n.id, n));
      return m;
    },
  });

  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      delivered: list.reduce((s, r) => s + Number(r.delivered || 0), 0),
      earned: list.reduce((s, r) => s + Number(r.earned_usd || 0), 0),
      numbers: new Set(list.map(r => r.whatsapp_number_id)).size,
      days: new Set(list.map(r => r.day)).size,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Live earnings (truth layer)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 items-end flex-wrap mb-4">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To (inclusive)</label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Delivered" value={totals.delivered.toLocaleString()} />
            <Stat label="Earned" value={fmtUsd(totals.earned)} accent />
            <Stat label="Active numbers" value={String(totals.numbers)} />
            <Stat label="Days w/ delivery" value={String(totals.days)} />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6">Loading…</TableCell></TableRow>
                )}
                {!isLoading && !rows?.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No delivered events for this partner in selected range
                  </TableCell></TableRow>
                )}
                {(rows ?? []).map((r, i) => {
                  const n = nums?.get(r.whatsapp_number_id);
                  return (
                    <TableRow key={`${r.day}-${r.whatsapp_number_id}-${i}`}>
                      <TableCell className="whitespace-nowrap">{r.day}</TableCell>
                      <TableCell className="font-mono text-xs">
                        +{n?.phone_number || r.whatsapp_number_id.slice(0, 8)}
                        {n?.display_name && <span className="text-muted-foreground ml-2">{n.display_name}</span>}
                      </TableCell>
                      <TableCell className="text-xs">{r.role}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.delivered}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(r.rate_usd).toFixed(4)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtUsd(Number(r.earned_usd))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${accent ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
