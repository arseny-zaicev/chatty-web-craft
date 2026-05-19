import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { fetchPartnerMetrics } from "@/lib/metrics";
import { getAttribution } from "@/lib/numberAttribution";

type Partner = {
  id: string; name: string; contact_email: string | null; kind: string;
  cadence: string; default_payout_rate_usd: number; currency: string; status: string;
  referrer_partner_id: string | null; referral_rate_usd: number;
};

export default function Partners() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [refFilter, setRefFilter] = useState("all");

  const { data: partners, isLoading } = useQuery({
    queryKey: ["admin", "partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("*").order("name");
      if (error) throw error;
      return data as Partner[];
    },
  });

  // Aggregations: # BMs, # numbers, unpaid USD per partner
  const { data: agg } = useQuery({
    queryKey: ["admin", "partners", "agg"],
    queryFn: async () => {
      const [{ data: assigns }, { data: runs }] = await Promise.all([
        supabase.from("bm_partner_assignments")
          .select("partner_id, business_manager_id, effective_to"),
        supabase.from("payout_runs")
          .select("partner_id, status, total_payout_usd"),
      ]);
      const bmsByPartner = new Map<string, Set<string>>();
      (assigns || []).forEach((a: any) => {
        if (a.effective_to) return;
        if (!bmsByPartner.has(a.partner_id)) bmsByPartner.set(a.partner_id, new Set());
        bmsByPartner.get(a.partner_id)!.add(a.business_manager_id);
      });
      // Numbers per BM
      const allBmIds = Array.from(new Set((assigns || []).filter((a: any) => !a.effective_to).map((a: any) => a.business_manager_id)));
      const { data: nums } = allBmIds.length
        ? await supabase.from("whatsapp_numbers").select("id, business_manager_id").in("business_manager_id", allBmIds)
        : { data: [] as any[] };
      const numsPerBm = new Map<string, number>();
      (nums || []).forEach((n: any) => numsPerBm.set(n.business_manager_id, (numsPerBm.get(n.business_manager_id) || 0) + 1));

      const unpaidByPartner = new Map<string, number>();
      (runs || []).forEach((r: any) => {
        if (r.status === "draft" || r.status === "approved") {
          unpaidByPartner.set(r.partner_id, (unpaidByPartner.get(r.partner_id) || 0) + Number(r.total_payout_usd || 0));
        }
      });
      return { bmsByPartner, numsPerBm, unpaidByPartner };
    },
  });

  const partnerIds = useMemo(() => (partners || []).map(p => p.id), [partners]);
  const { data: partnerMetrics } = useQuery({
    queryKey: ["admin", "partners", "metrics", partnerIds],
    enabled: partnerIds.length > 0,
    queryFn: () => fetchPartnerMetrics(partnerIds),
  });

  // Referral attribution coming from whatsapp_numbers (Provided by / Ref / Own).
  const { data: numberAttr } = useQuery({
    queryKey: ["admin", "partners", "number-attribution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_numbers")
        .select("id, provided_by, assigned_ref");
      if (error) throw error;
      let own = 0;
      const byRef = new Map<string, number>();
      (data || []).forEach((n: any) => {
        const a = getAttribution(n);
        if (a.kind === "own") own++;
        else byRef.set(a.ref.toLowerCase(), (byRef.get(a.ref.toLowerCase()) || 0) + 1);
      });
      return { own, byRef };
    },
  });

  const rows = useMemo(() => {
    return (partners || []).filter((p) => {
      if (refFilter === "with" && !p.referrer_partner_id) return false;
      if (refFilter === "without" && p.referrer_partner_id) return false;
      if (q && !`${p.name} ${p.contact_email || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [partners, refFilter, q]);
  const partnerName = (id: string | null) => id ? (partners || []).find(p => p.id === id)?.name || "?" : null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Admin</Button></Link>
            <h1 className="font-display text-2xl">Partners</h1>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />New partner</Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name or email" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={refFilter} onValueChange={setRefFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All partners</SelectItem>
              <SelectItem value="with">With manager</SelectItem>
              <SelectItem value="without">Without manager</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {numberAttr && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Number sources (from Fleet)</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[11px]">Own: {numberAttr.own}</Badge>
              {Array.from(numberAttr.byRef.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([ref, count]) => (
                  <Badge key={ref} variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                    via {ref}: {count}
                  </Badge>
                ))}
              {numberAttr.byRef.size === 0 && <span className="text-muted-foreground">No referred numbers yet.</span>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>All partners</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>BMs</TableHead>
                  <TableHead>Numbers</TableHead>
                  <TableHead>Referred #</TableHead>
                  <TableHead>Delivered / Sent today</TableHead>
                  <TableHead>Delivered / Sent all-time</TableHead>
                  <TableHead>Partner rate</TableHead>
                  <TableHead>Manager rate</TableHead>
                  <TableHead>Unpaid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map(p => {
                    const bms = agg?.bmsByPartner.get(p.id);
                    const bmIds = bms ? Array.from(bms) : [];
                    const numCount = bmIds.reduce((s, id) => s + (agg?.numsPerBm.get(id) || 0), 0);
                    const referredCount = numberAttr?.byRef.get(p.name.toLowerCase()) || 0;
                    const unpaid = agg?.unpaidByPartner.get(p.id) || 0;
                    const refName = partnerName(p.referrer_partner_id);
                    const pm = partnerMetrics?.get(p.id);
                    return (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40">
                        <TableCell className="font-medium">
                          <Link to={`/admin/partners/${p.id}`} className="hover:underline">{p.name}</Link>
                          {p.contact_email && <div className="text-xs text-muted-foreground">{p.contact_email}</div>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {refName ? <Badge variant="outline">{refName}</Badge> : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>{bms?.size || 0}</TableCell>
                        <TableCell>{numCount}</TableCell>
                        <TableCell className="tabular-nums">
                          {referredCount > 0
                            ? <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">{referredCount}</Badge>
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">{(pm?.delivered_today ?? 0).toLocaleString()}</span>
                          <span className="text-muted-foreground"> / {(pm?.sent_today ?? 0).toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">{(pm?.delivered_alltime ?? 0).toLocaleString()}</span>
                          <span> / {(pm?.sent_alltime ?? 0).toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">${Number(p.default_payout_rate_usd).toFixed(4)}</TableCell>
                        <TableCell className="font-mono text-xs">{p.referral_rate_usd > 0 ? `$${Number(p.referral_rate_usd).toFixed(4)}` : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className={unpaid > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                          ${unpaid.toFixed(2)}
                        </TableCell>
                        <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                        <TableCell>
                          <Link to={`/admin/partners/${p.id}`}>
                            <Button variant="ghost" size="sm">Open</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!rows.length && (
                    <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No partners.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <NewPartnerDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "partners"] })} />
    </div>
  );
}

function NewPartnerDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [rate, setRate] = useState("0");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("partners").insert({
        name: name.trim(),
        contact_email: email.trim() || null,
        kind: "provider", cadence,
        default_payout_rate_usd: Number(rate) || 0,
        payment_notes: notes.trim() || null,
        created_by: u.user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Partner created");
      onCreated(); onOpenChange(false);
      setName(""); setEmail(""); setRate("0"); setNotes(""); setCadence("weekly");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New partner</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Nitish" /></Field>
          <Field label="Contact email"><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="partner@example.com" /></Field>
          <Field label="Report cadence">
            <Select value={cadence} onValueChange={setCadence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Default provider rate $/delivered">
            <Input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} />
          </Field>
          <Field label="Payment notes"><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Wise, IBAN, etc." /></Field>
          <p className="text-xs text-muted-foreground">Если этого партнёра кто-то привёл — задай реферрера и ставку в Settings после создания.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
);
