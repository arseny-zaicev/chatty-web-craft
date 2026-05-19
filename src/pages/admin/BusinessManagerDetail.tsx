import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Building2, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { getAttribution } from "@/lib/numberAttribution";

const STATUSES = ["warming", "active", "paused", "restricted", "blocked", "retired"] as const;

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "active") return "default";
  if (s === "warming") return "secondary";
  if (s === "restricted" || s === "blocked") return "destructive";
  return "outline";
};

type WhatsAppNumber = {
  id: string;
  phone_number: string;
  display_name: string | null;
  status: string;
  messaging_limit: string | null;
  business_manager_id: string | null;
  workspace_id: string | null;
  provided_by: string | null;
  assigned_ref: string | null;
};

const fetchBm = async (id: string) => {
  const { data: bm, error } = await supabase.from("business_managers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!bm) throw new Error("Not found");
  const [{ data: linked }, { data: pool }, { data: events }, { data: ws }] = await Promise.all([
    supabase.from("whatsapp_numbers").select("id, phone_number, display_name, status, messaging_limit, business_manager_id, workspace_id, provided_by, assigned_ref").eq("business_manager_id", id),
    supabase.from("whatsapp_numbers").select("id, phone_number, display_name, status, messaging_limit, business_manager_id, workspace_id, provided_by, assigned_ref").is("business_manager_id", null).order("display_name").limit(500),
    supabase.from("business_manager_warmup_events").select("*").eq("business_manager_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("workspaces").select("id, name").eq("id", bm.workspace_id).maybeSingle(),
  ]);
  return {
    bm,
    linked: (linked ?? []) as WhatsAppNumber[],
    pool: (pool ?? []) as WhatsAppNumber[],
    events: events ?? [],
    workspace: ws,
  };
};

const BusinessManagerDetail = () => {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["bm", id], queryFn: () => fetchBm(id), enabled: !!id });
  const [attachOpen, setAttachOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bm", id] });
    qc.invalidateQueries({ queryKey: ["business-managers"] });
  };

  const logEvent = async (event_type: string, payload: Record<string, unknown> = {}) => {
    if (!data) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("business_manager_warmup_events").insert({
      business_manager_id: id,
      workspace_id: data.bm.workspace_id,
      event_type,
      payload: payload as any,
      created_by: u.user?.id ?? null,
    } as any);
  };

  const updateBm = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("business_managers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success("Updated");
      const event_type = "status" in (vars as any) ? "status_changed" : "stage_advanced";
      logEvent(event_type, vars as Record<string, unknown>);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const attach = useMutation({
    mutationFn: async (numberId: string) => {
      const { error } = await supabase.from("whatsapp_numbers").update({ business_manager_id: id }).eq("id", numberId);
      if (error) throw error;
      await logEvent("number_added", { whatsapp_number_id: numberId });
    },
    onSuccess: () => { invalidate(); toast.success("Number attached"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const detach = useMutation({
    mutationFn: async (numberId: string) => {
      const { error } = await supabase.from("whatsapp_numbers").update({ business_manager_id: null }).eq("id", numberId);
      if (error) throw error;
      await logEvent("number_removed", { whatsapp_number_id: numberId });
    },
    onSuccess: () => { invalidate(); toast.success("Number detached"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!noteText.trim()) return;
      await logEvent("manual_note", { note: noteText.trim() });
    },
    onSuccess: () => { setNoteText(""); invalidate(); toast.success("Note added"); },
  });

  const stats = useMemo(() => {
    const nums = data?.linked ?? [];
    return {
      total: nums.length,
      active: nums.filter((n) => n.status === "active").length,
      restricted: nums.filter((n) => n.status === "restricted").length,
      blocked: nums.filter((n) => n.status === "banned" || n.status === "blocked").length,
    };
  }, [data?.linked]);

  const sourceBreakdown = useMemo(() => {
    const nums = data?.linked ?? [];
    let own = 0;
    const byRef = new Map<string, number>();
    for (const n of nums) {
      const a = getAttribution(n);
      if (a.kind === "own") own++;
      else byRef.set(a.ref, (byRef.get(a.ref) || 0) + 1);
    }
    const parts: string[] = [];
    if (own > 0) parts.push(`${own} Own`);
    for (const [ref, count] of byRef) parts.push(`${count} via ${ref}`);
    return parts.join(" · ");
  }, [data?.linked]);

  if (isLoading || !data) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const { bm } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/business-managers")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> All BMs
            </Button>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-lg font-semibold">{bm.name}</h1>
              <Badge variant={statusVariant(bm.status)}>{bm.status}</Badge>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{data.workspace?.name}</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Status</CardTitle></CardHeader>
            <CardContent>
              <Select value={bm.status} onValueChange={(v) => updateBm.mutate({ status: v, last_warmup_action_at: new Date().toISOString() })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Warmup stage</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={bm.warmup_stage ?? ""} placeholder="Day 7 / Week 2 / Ready" onChange={(e) => updateBm.mutate({ warmup_stage: e.target.value })} />
              <div className="text-xs text-muted-foreground">
                Started: {bm.warmup_started_at ? formatDistanceToNow(new Date(bm.warmup_started_at), { addSuffix: true }) : "—"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Daily cap</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input type="number" value={bm.daily_warmup_cap ?? ""} placeholder="e.g. 80" onChange={(e) => updateBm.mutate({ daily_warmup_cap: e.target.value ? Number(e.target.value) : null })} />
              <div className="text-xs text-muted-foreground">Sent today is shown in the BM list.</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ads launched before?</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Select value={(bm as any).ads_launched_before ? "yes" : "no"} onValueChange={(v) => updateBm.mutate({ ads_launched_before: v === "yes" } as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Next warm-up date</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input type="date" value={(bm as any).next_warmup_run_date ?? ""} onChange={(e) => updateBm.mutate({ next_warmup_run_date: e.target.value || null } as any)} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Allocated numbers ({stats.total})</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{stats.active} active · {stats.restricted} restricted · {stats.blocked} blocked</span>
              <Button size="sm" variant="outline" onClick={() => setAttachOpen((v) => !v)}>
                <Plus className="h-3 w-3 mr-1" /> Attach
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {sourceBreakdown && (
              <div className="text-xs text-muted-foreground mb-3">Sources: {sourceBreakdown}</div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Messaging limit</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.linked.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No numbers attached yet</TableCell></TableRow>
                ) : data.linked.map((n) => {
                  const a = getAttribution(n);
                  return (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-sm">+{n.phone_number}</TableCell>
                    <TableCell>{n.display_name ?? "—"}</TableCell>
                    <TableCell>
                      {a.kind === "own" ? (
                        <Badge variant="outline" className="text-[10px]">Own</Badge>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 w-fit">Ref: {a.ref}</Badge>
                          {a.providedBy && <span className="text-[10px] text-muted-foreground">via {a.providedBy}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell><Badge variant={statusVariant(n.status)}>{n.status}</Badge></TableCell>
                    <TableCell>{n.messaging_limit ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => detach.mutate(n.id)}>
                        <Unlink className="h-3 w-3 mr-1" /> Detach
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {attachOpen && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="text-xs text-muted-foreground mb-2">Unassigned numbers in this workspace</div>
                {data.pool.length === 0 ? (
                  <div className="text-sm text-muted-foreground">All numbers are already assigned.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {data.pool.map((n) => (
                      <div key={n.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                        <div>
                          <div className="font-mono text-sm">+{n.phone_number}</div>
                          <div className="text-xs text-muted-foreground">{n.display_name ?? "—"}</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => attach.mutate(n.id)}>Attach</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Add note</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Manual note added to the timeline" />
            <Button size="sm" onClick={() => addNote.mutate()} disabled={!noteText.trim() || addNote.isPending}>Add note</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
          <CardContent>
            {data.events.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No events yet</div>
            ) : (
              <div className="space-y-2">
                {data.events.map((e: any) => (
                  <div key={e.id} className="flex items-start gap-3 text-sm border-b border-border/50 pb-2">
                    <Badge variant="outline" className="text-xs">{e.event_type}</Badge>
                    <div className="flex-1">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">
                        {e.payload && Object.keys(e.payload).length > 0 ? JSON.stringify(e.payload, null, 2) : ""}
                      </pre>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BusinessManagerDetail;
