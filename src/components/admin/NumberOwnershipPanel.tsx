import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, History, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { InlineRateEditor } from "./InlineRateEditor";
import { NumberBmPicker } from "./NumberBmPicker";

const ROLES = ["provider", "referral", "manager"] as const;

type Ownership = {
  id: string;
  whatsapp_number_id: string;
  partner_id: string;
  role: string;
  rate_usd: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  number?: { id: string; phone_number: string; display_name: string | null; workspace_id: string | null; business_manager_id: string | null };
};

async function setOwnership(args: {
  whatsapp_number_id: string;
  partner_id: string | null;
  role?: string;
  rate_usd?: number;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc("set_number_ownership" as any, {
    p_whatsapp_number_id: args.whatsapp_number_id,
    p_partner_id: args.partner_id,
    p_role: args.role ?? "provider",
    p_rate_usd: args.rate_usd ?? 0,
    p_notes: args.notes ?? null,
  });
  if (error) throw error;
}

export function NumberOwnershipPanel({
  partnerId,
  partnerDefaultRate,
}: {
  partnerId: string;
  partnerDefaultRate: number;
}) {
  const qc = useQueryClient();
  const qk = ["admin", "partner-ownership", partnerId];

  const { data: rows, isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("number_ownership")
        .select("*")
        .eq("partner_id", partnerId)
        .is("effective_to", null)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as any[];
      if (!list.length) return [] as Ownership[];
      const ids = list.map(r => r.whatsapp_number_id);
      const { data: nums } = await supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name, workspace_id, status, business_manager_id")
        .in("id", ids);
      const byId = new Map((nums ?? []).map((n: any) => [n.id, n]));
      return list.map(r => ({ ...r, number: byId.get(r.whatsapp_number_id) })) as Ownership[];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: qk });
    qc.invalidateQueries({ queryKey: ["admin", "ownership-global"] });
    qc.invalidateQueries({ queryKey: ["admin", "partner-earnings", partnerId] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Numbers (truth layer)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            This is what payouts read from. Rate and role are per-number, effective from the moment you save - history is preserved.
          </p>
        </div>
        <AssignNumbersDialog
          partnerId={partnerId}
          partnerDefaultRate={partnerDefaultRate}
          onDone={invalidateAll}
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>BM</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Rate $/delivered</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && !rows?.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  No numbers assigned to this partner. Use "+ Assign numbers" above.
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">+{r.number?.phone_number || "?"}</TableCell>
                <TableCell className="text-xs">{r.number?.display_name || "—"}</TableCell>
                <TableCell>
                  <Select
                    value={r.role}
                    onValueChange={async (v) => {
                      try {
                        await setOwnership({
                          whatsapp_number_id: r.whatsapp_number_id,
                          partner_id: partnerId,
                          role: v,
                          rate_usd: Number(r.rate_usd),
                          notes: r.notes,
                        });
                        toast.success("Role updated");
                        invalidateAll();
                      } catch (e: any) { toast.error(e?.message || "Failed"); }
                    }}
                  >
                    <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <InlineRateEditor
                    value={Number(r.rate_usd)}
                    onSave={async (next) => {
                      try {
                        await setOwnership({
                          whatsapp_number_id: r.whatsapp_number_id,
                          partner_id: partnerId,
                          role: r.role,
                          rate_usd: next,
                          notes: r.notes,
                        });
                        toast.success("Rate updated");
                        invalidateAll();
                      } catch (e: any) { toast.error(e?.message || "Failed"); }
                    }}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(r.effective_from), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <OwnershipHistoryButton numberId={r.whatsapp_number_id} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    title="Unassign from this partner"
                    onClick={async () => {
                      if (!confirm(`Unassign +${r.number?.phone_number} from this partner?`)) return;
                      try {
                        await setOwnership({
                          whatsapp_number_id: r.whatsapp_number_id,
                          partner_id: null,
                        });
                        toast.success("Unassigned");
                        invalidateAll();
                      } catch (e: any) { toast.error(e?.message || "Failed"); }
                    }}
                  >
                    <XIcon className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OwnershipHistoryButton({ numberId }: { numberId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "ownership-history", numberId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("number_ownership")
        .select("*, partners(name)")
        .eq("whatsapp_number_id", numberId)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Ownership history"><History className="w-4 h-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Ownership history</DialogTitle></DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-4">Loading…</TableCell></TableRow>}
            {(data ?? []).map((r: any) => (
              <TableRow key={r.id} className={r.effective_to ? "text-muted-foreground" : ""}>
                <TableCell>{r.partners?.name || r.partner_id.slice(0, 8)}</TableCell>
                <TableCell>{r.role}</TableCell>
                <TableCell className="tabular-nums">${Number(r.rate_usd).toFixed(4)}</TableCell>
                <TableCell className="text-xs">{format(new Date(r.effective_from), "yyyy-MM-dd HH:mm")}</TableCell>
                <TableCell className="text-xs">
                  {r.effective_to
                    ? format(new Date(r.effective_to), "yyyy-MM-dd HH:mm")
                    : <Badge variant="default">active</Badge>}
                </TableCell>
                <TableCell className="text-xs">{r.notes || "—"}</TableCell>
              </TableRow>
            ))}
            {!isLoading && !data?.length && (
              <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No history</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function AssignNumbersDialog({
  partnerId,
  partnerDefaultRate,
  onDone,
}: {
  partnerId: string;
  partnerDefaultRate: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState("provider");
  const [rate, setRate] = useState(String(partnerDefaultRate || 0.005));
  const [search, setSearch] = useState("");
  const [showAssigned, setShowAssigned] = useState(false);

  const { data: numbers } = useQuery({
    queryKey: ["admin", "ownership-pool", partnerId, showAssigned],
    enabled: open,
    queryFn: async () => {
      const { data: nums } = await supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name, status, workspace_id, business_manager_id")
        .order("display_name");
      const { data: own } = await supabase
        .from("number_ownership")
        .select("whatsapp_number_id, partner_id, partners(name)")
        .is("effective_to", null);
      const ownByNum = new Map<string, { partner_id: string; partner_name: string }>();
      (own ?? []).forEach((o: any) => ownByNum.set(o.whatsapp_number_id, {
        partner_id: o.partner_id, partner_name: o.partners?.name || "?",
      }));
      return (nums ?? []).map((n: any) => ({
        ...n,
        current_owner: ownByNum.get(n.id) ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    const list = numbers ?? [];
    return list
      .filter(n => !n.current_owner || n.current_owner.partner_id === partnerId || showAssigned)
      .filter(n => {
        if (!search.trim()) return true;
        const t = search.toLowerCase();
        return String(n.phone_number).toLowerCase().includes(t)
          || String(n.display_name || "").toLowerCase().includes(t);
      });
  }, [numbers, search, showAssigned, partnerId]);

  const reset = () => { setPicked([]); setSearch(""); setShowAssigned(false); };

  const save = useMutation({
    mutationFn: async () => {
      if (!picked.length) throw new Error("Pick at least one number");
      const r = Number(rate);
      if (!Number.isFinite(r) || r < 0) throw new Error("Bad rate");
      for (const nid of picked) {
        await setOwnership({
          whatsapp_number_id: nid,
          partner_id: partnerId,
          role,
          rate_usd: r,
        });
      }
    },
    onSuccess: () => {
      toast.success(`${picked.length} number(s) assigned`);
      setOpen(false); reset(); onDone();
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" />Assign numbers</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Assign numbers to partner</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rate $/delivered</label>
              <Input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search phone or name…" className="h-8 text-xs flex-1"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              <Checkbox checked={showAssigned} onCheckedChange={v => setShowAssigned(Boolean(v))} />
              Show numbers owned by other partners
            </label>
          </div>

          <div className="text-xs text-muted-foreground">{filtered.length} available · {picked.length} selected</div>
          <div className="max-h-64 overflow-y-auto border border-border rounded-md p-2 space-y-1">
            {!filtered.length && (
              <div className="text-xs text-muted-foreground py-3 text-center">No numbers match</div>
            )}
            {filtered.map(n => {
              const isOwnedByOther = n.current_owner && n.current_owner.partner_id !== partnerId;
              return (
                <label key={n.id} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-1 py-1 cursor-pointer">
                  <Checkbox
                    checked={picked.includes(n.id)}
                    onCheckedChange={() => setPicked(p => p.includes(n.id) ? p.filter(x => x !== n.id) : [...p, n.id])}
                  />
                  <span className="font-mono text-xs">+{n.phone_number}</span>
                  <span className="text-muted-foreground text-xs truncate flex-1">{n.display_name || ""}</span>
                  {isOwnedByOther && (
                    <Badge variant="outline" className="text-[10px] text-amber-600">
                      now: {n.current_owner!.partner_name}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">{n.status}</Badge>
                </label>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !picked.length}>
            {save.isPending ? "Saving…" : `Assign (${picked.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
