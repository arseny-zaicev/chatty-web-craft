import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { InlineRateEditor } from "@/components/admin/InlineRateEditor";

const ROLES = ["provider", "referral", "manager"] as const;

async function setOwnership(args: {
  whatsapp_number_id: string;
  partner_id: string | null;
  role?: string;
  rate_usd?: number;
}) {
  const { error } = await supabase.rpc("set_number_ownership" as any, {
    p_whatsapp_number_id: args.whatsapp_number_id,
    p_partner_id: args.partner_id,
    p_role: args.role ?? "provider",
    p_rate_usd: args.rate_usd ?? 0,
    p_notes: null,
  });
  if (error) throw error;
}

export default function NumberOwnership() {
  const qc = useQueryClient();
  const qk = ["admin", "ownership-global"];

  const { data, isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const [{ data: nums }, { data: own }, { data: partners }, { data: workspaces }] = await Promise.all([
        supabase.from("whatsapp_numbers").select("id, phone_number, display_name, status, workspace_id, business_manager_id"),
        supabase.from("number_ownership").select("*").is("effective_to", null),
        supabase.from("partners").select("id, name, default_payout_rate_usd"),
        supabase.from("workspaces").select("id, name"),
      ]);
      return {
        numbers: (nums ?? []) as any[],
        own: (own ?? []) as any[],
        partners: (partners ?? []) as any[],
        workspaces: (workspaces ?? []) as any[],
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk });

  const ownByNum = useMemo(() => {
    const m = new Map<string, any>();
    (data?.own ?? []).forEach((o: any) => m.set(o.whatsapp_number_id, o));
    return m;
  }, [data]);
  const partnerById = useMemo(() => {
    const m = new Map<string, any>();
    (data?.partners ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [data]);
  const wsById = useMemo(() => {
    const m = new Map<string, string>();
    (data?.workspaces ?? []).forEach((w: any) => m.set(w.id, w.name));
    return m;
  }, [data]);

  const unassigned = useMemo(
    () => (data?.numbers ?? []).filter(n => !ownByNum.has(n.id)),
    [data, ownByNum],
  );
  const assigned = useMemo(
    () => (data?.numbers ?? []).filter(n => ownByNum.has(n.id)),
    [data, ownByNum],
  );

  const [tab, setTab] = useState<"unassigned" | "assigned">("unassigned");
  const [search, setSearch] = useState("");

  const filteredUnassigned = useMemo(() => {
    if (!search.trim()) return unassigned;
    const t = search.toLowerCase();
    return unassigned.filter(n =>
      String(n.phone_number).toLowerCase().includes(t)
      || String(n.display_name || "").toLowerCase().includes(t));
  }, [unassigned, search]);

  const filteredAssigned = useMemo(() => {
    if (!search.trim()) return assigned;
    const t = search.toLowerCase();
    return assigned.filter(n => {
      const o = ownByNum.get(n.id);
      const p = o ? partnerById.get(o.partner_id) : null;
      return String(n.phone_number).toLowerCase().includes(t)
        || String(n.display_name || "").toLowerCase().includes(t)
        || String(p?.name || "").toLowerCase().includes(t);
    });
  }, [assigned, search, ownByNum, partnerById]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Admin</Button></Link>
          <h1 className="font-display text-2xl">Number ownership</h1>
          <Badge variant="outline" className="ml-2">canonical truth layer</Badge>
          <span className="text-sm text-muted-foreground ml-auto">
            {data?.numbers?.length ?? 0} numbers · {unassigned.length} unassigned
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Who gets paid for what</CardTitle>
            <p className="text-xs text-muted-foreground">
              This is the table payouts read from (<code>number_ownership</code>). Each row is per-number, with its own rate, effective at a point in time. History is preserved automatically when you change anything.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <Input
                placeholder="Search phone, name, partner…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="max-w-md"
              />
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="unassigned">
                  Unassigned <Badge variant="secondary" className="ml-2">{unassigned.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="assigned">
                  Assigned <Badge variant="secondary" className="ml-2">{assigned.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="unassigned" className="pt-4">
                <UnassignedView
                  numbers={filteredUnassigned}
                  partners={data?.partners ?? []}
                  wsById={wsById}
                  onChanged={invalidate}
                />
              </TabsContent>

              <TabsContent value="assigned" className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Display</TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Since</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-6">Loading…</TableCell></TableRow>}
                    {!isLoading && !filteredAssigned.length && (
                      <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nothing here</TableCell></TableRow>
                    )}
                    {filteredAssigned.map(n => {
                      const o = ownByNum.get(n.id);
                      const p = partnerById.get(o.partner_id);
                      return (
                        <TableRow key={n.id}>
                          <TableCell className="font-mono text-xs">+{n.phone_number}</TableCell>
                          <TableCell className="text-xs">{n.display_name || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{wsById.get(n.workspace_id) || "—"}</TableCell>
                          <TableCell>
                            <Link to={`/admin/partners/${o.partner_id}`} className="hover:underline font-medium">
                              {p?.name || o.partner_id.slice(0, 8)}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={o.role}
                              onValueChange={async (v) => {
                                try {
                                  await setOwnership({
                                    whatsapp_number_id: n.id,
                                    partner_id: o.partner_id,
                                    role: v,
                                    rate_usd: Number(o.rate_usd),
                                  });
                                  toast.success("Role updated");
                                  invalidate();
                                } catch (e: any) { toast.error(e?.message || "Failed"); }
                              }}
                            >
                              <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <InlineRateEditor
                              value={Number(o.rate_usd)}
                              onSave={async (next) => {
                                try {
                                  await setOwnership({
                                    whatsapp_number_id: n.id,
                                    partner_id: o.partner_id,
                                    role: o.role,
                                    rate_usd: next,
                                  });
                                  toast.success("Rate updated");
                                  invalidate();
                                } catch (e: any) { toast.error(e?.message || "Failed"); }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(o.effective_from), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <ReassignButton
                              numberId={n.id}
                              currentPartnerId={o.partner_id}
                              currentRole={o.role}
                              currentRate={Number(o.rate_usd)}
                              partners={data?.partners ?? []}
                              onDone={invalidate}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UnassignedView({
  numbers, partners, wsById, onChanged,
}: {
  numbers: any[];
  partners: any[];
  wsById: Map<string, string>;
  onChanged: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const allChecked = numbers.length > 0 && picked.length === numbers.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">{picked.length} selected</div>
        <BulkAssignDialog
          numberIds={picked}
          partners={partners}
          onDone={() => { setPicked([]); onChanged(); }}
        />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(v) => setPicked(v ? numbers.map(n => n.id) : [])}
                />
              </TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Display</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!numbers.length && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">All numbers are assigned. 🎉</TableCell></TableRow>
            )}
            {numbers.map(n => (
              <TableRow key={n.id}>
                <TableCell>
                  <Checkbox
                    checked={picked.includes(n.id)}
                    onCheckedChange={() => setPicked(p => p.includes(n.id) ? p.filter(x => x !== n.id) : [...p, n.id])}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">+{n.phone_number}</TableCell>
                <TableCell className="text-xs">{n.display_name || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{wsById.get(n.workspace_id) || "—"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{n.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BulkAssignDialog({
  numberIds, partners, onDone,
}: { numberIds: string[]; partners: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<string>("");
  const [role, setRole] = useState("provider");
  const [rate, setRate] = useState("0.005");

  const partner = partners.find(p => p.id === partnerId);

  const save = useMutation({
    mutationFn: async () => {
      if (!partnerId) throw new Error("Pick a partner");
      const r = Number(rate);
      for (const nid of numberIds) {
        await setOwnership({ whatsapp_number_id: nid, partner_id: partnerId, role, rate_usd: r });
      }
    },
    onSuccess: () => {
      toast.success(`${numberIds.length} number(s) assigned to ${partner?.name}`);
      setOpen(false); setPartnerId(""); onDone();
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!numberIds.length}>
          <Plus className="w-4 h-4 mr-1" />Assign {numberIds.length} to partner
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign {numberIds.length} number(s)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Partner</label>
            <Select value={partnerId} onValueChange={(v) => {
              setPartnerId(v);
              const p = partners.find(pp => pp.id === v);
              if (p?.default_payout_rate_usd) setRate(String(p.default_payout_rate_usd));
            }}>
              <SelectTrigger><SelectValue placeholder="Pick partner" /></SelectTrigger>
              <SelectContent>
                {partners.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="text-muted-foreground text-xs">(default ${Number(p.default_payout_rate_usd ?? 0).toFixed(4)})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !partnerId}>
            {save.isPending ? "Saving…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignButton({
  numberId, currentPartnerId, currentRole, currentRate, partners, onDone,
}: {
  numberId: string;
  currentPartnerId: string;
  currentRole: string;
  currentRate: number;
  partners: any[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<string>(currentPartnerId);
  const [role, setRole] = useState(currentRole);
  const [rate, setRate] = useState(String(currentRate));

  const save = useMutation({
    mutationFn: async () => {
      if (!partnerId) {
        await setOwnership({ whatsapp_number_id: numberId, partner_id: null });
      } else {
        await setOwnership({
          whatsapp_number_id: numberId,
          partner_id: partnerId,
          role,
          rate_usd: Number(rate),
        });
      }
    },
    onSuccess: () => { toast.success("Updated"); setOpen(false); onDone(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-xs">Reassign</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reassign / unassign number</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Partner</label>
            <Select value={partnerId || "__none__"} onValueChange={(v) => {
              setPartnerId(v === "__none__" ? "" : v);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Unassign —</SelectItem>
                {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {partnerId && (
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
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
