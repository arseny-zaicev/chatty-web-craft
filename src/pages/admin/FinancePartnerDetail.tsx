import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";

const fmtUsd = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
  s === "paid" ? "default" : s === "approved" ? "secondary" : s === "void" ? "destructive" : "outline";

export default function FinancePartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: partner } = useQuery({
    queryKey: ["finance", "partner", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: numbers } = useQuery({
    queryKey: ["finance", "partner-numbers", id],
    queryFn: async () => {
      const { data: ownerships } = await supabase.from("number_ownership")
        .select("*").eq("partner_id", id!).order("effective_from", { ascending: false });
      const numIds = Array.from(new Set((ownerships || []).map((o: any) => o.whatsapp_number_id)));
      const { data: nums } = numIds.length
        ? await supabase.from("whatsapp_numbers").select("id, phone_number, display_name, label, status").in("id", numIds)
        : { data: [] as any[] };
      const numMap = new Map((nums || []).map((n: any) => [n.id, n]));
      return (ownerships || []).map((o: any) => ({ ...o, number: numMap.get(o.whatsapp_number_id) }));
    },
    enabled: !!id,
  });

  const { data: rates } = useQuery({
    queryKey: ["finance", "partner-rates", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_rates")
        .select("*").eq("partner_id", id!).order("effective_from", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const { data: runs } = useQuery({
    queryKey: ["finance", "partner-runs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payout_runs")
        .select("*").eq("partner_id", id!).order("period_from", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const { data: allNumbers } = useQuery({
    queryKey: ["finance", "all-numbers"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_numbers")
        .select("id, phone_number, display_name, label, status").order("phone_number");
      return data as any[] || [];
    },
  });

  const [defaultRate, setDefaultRate] = useState<string>("");
  const setRate = useMutation({
    mutationFn: async () => {
      const v = Number(defaultRate);
      if (!isFinite(v)) throw new Error("Invalid number");
      const now = new Date().toISOString();
      // End previous default rate if any
      await supabase.from("partner_rates")
        .update({ effective_to: now })
        .eq("partner_id", id!).eq("scope", "default").is("effective_to", null);
      const { error } = await supabase.from("partner_rates").insert({
        partner_id: id!, scope: "default", rate_usd: v, effective_from: now,
      });
      if (error) throw error;
      // Also update partners.default_payout_rate_usd cache
      await supabase.from("partners").update({ default_payout_rate_usd: v }).eq("id", id!);
    },
    onSuccess: () => {
      toast.success("Default rate updated");
      setDefaultRate("");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Assign number ownership
  const [pickNumber, setPickNumber] = useState("");
  const assignNumber = useMutation({
    mutationFn: async () => {
      if (!pickNumber) throw new Error("Pick a number");
      // Route through canonical RPC so the attribution guard trigger runs,
      // history is preserved, and structured referrer linkage stays consistent
      // with FleetRegistry onboarding.
      const { error } = await supabase.rpc("set_number_ownership" as any, {
        p_whatsapp_number_id: pickNumber,
        p_partner_id: id!,
        p_role: "provider",
        p_rate_usd: Number(partner?.default_payout_rate_usd ?? 0),
        p_notes: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Number assigned");
      setPickNumber("");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Generate payout run
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_payout_run" as any, {
        _partner_id: id!, _from: from, _to: to,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (runId) => {
      toast.success("Draft run generated");
      qc.invalidateQueries({ queryKey: ["finance"] });
      window.location.assign(`/admin/finance/runs/${runId}`);
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!partner) return <div className="p-6"><Loader2 className="animate-spin w-5 h-5" /></div>;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/admin/finance/partners"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Partners</Button></Link>
          <h1 className="font-display text-2xl">{partner.name}</h1>
          <Badge variant={partner.status === "active" ? "default" : "secondary"}>{partner.status}</Badge>
          <span className="text-sm text-muted-foreground ml-auto">
            Partner rate: ${Number(partner.default_payout_rate_usd || 0).toFixed(4)} {partner.currency}
          </span>
        </div>

        <Tabs defaultValue="runs">
          <TabsList>
            <TabsTrigger value="runs">Payout runs</TabsTrigger>
            <TabsTrigger value="generate">Generate run</TabsTrigger>
            <TabsTrigger value="numbers">Numbers</TabsTrigger>
            <TabsTrigger value="rates">Rate history</TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>All runs</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Period</TableHead><TableHead>Status</TableHead>
                    <TableHead>Delivered</TableHead><TableHead>Partner payout</TableHead>
                    <TableHead>Our margin</TableHead><TableHead>Generated</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(runs || []).map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.period_from} → {r.period_to}</TableCell>
                        <TableCell><Badge variant={statusVariant(r.status)}>{r.status}</Badge></TableCell>
                        <TableCell>{r.totals_delivered}</TableCell>
                        <TableCell>{fmtUsd(Number(r.total_payout_usd))}</TableCell>
                        <TableCell>{fmtUsd(Number(r.margin_usd))}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{format(new Date(r.generated_at), "MMM d HH:mm")}</TableCell>
                        <TableCell>
                          <Link to={`/admin/finance/runs/${r.id}`}><Button size="sm" variant="ghost">Open</Button></Link>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!runs?.length && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No runs yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="generate" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>Generate draft payout run</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3 items-end">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">From</label>
                    <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">To (inclusive)</label>
                    <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
                  </div>
                  <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                    {generate.isPending ? "Generating…" : "Generate"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Creates a draft run by aggregating delivered events on this partner's owned numbers in the period.
                  Rates are pinned to the moment of each event.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="numbers" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>Assign a number</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Select value={pickNumber} onValueChange={setPickNumber}>
                    <SelectTrigger className="w-[400px]"><SelectValue placeholder="Pick a number…" /></SelectTrigger>
                    <SelectContent>
                      {(allNumbers || []).map(n => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.display_name || n.label || n.phone_number} ({n.phone_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => assignNumber.mutate()} disabled={assignNumber.isPending || !pickNumber}>
                    <Plus className="w-4 h-4 mr-1" />Assign
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Ownership history</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Number</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(numbers || []).map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell>{o.number?.display_name || o.number?.phone_number || o.whatsapp_number_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">{format(new Date(o.effective_from), "yyyy-MM-dd HH:mm")}</TableCell>
                        <TableCell className="text-xs">{o.effective_to ? format(new Date(o.effective_to), "yyyy-MM-dd HH:mm") : <Badge>current</Badge>}</TableCell>
                      </TableRow>
                    ))}
                    {!numbers?.length && <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No numbers assigned yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rates" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>Set new default rate</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2 items-end">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">New rate ($/delivered)</label>
                    <Input type="number" step="0.0001" value={defaultRate} onChange={e => setDefaultRate(e.target.value)} placeholder="0.0150" />
                  </div>
                  <Button onClick={() => setRate.mutate()} disabled={setRate.isPending || !defaultRate}>Apply</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Closes the current default rate at "now" and opens a new one. Past payouts keep their original rate.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Rate history</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Scope</TableHead><TableHead>Rate</TableHead>
                    <TableHead>From</TableHead><TableHead>To</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(rates || []).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.scope}</TableCell>
                        <TableCell>${Number(r.rate_usd).toFixed(4)}</TableCell>
                        <TableCell className="text-xs">{format(new Date(r.effective_from), "yyyy-MM-dd HH:mm")}</TableCell>
                        <TableCell className="text-xs">{r.effective_to ? format(new Date(r.effective_to), "yyyy-MM-dd HH:mm") : <Badge>current</Badge>}</TableCell>
                      </TableRow>
                    ))}
                    {!rates?.length && <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Using partner default rate</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
