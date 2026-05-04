import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Deal, Stage, crmKeys, fetchPipelineBase } from "@/lib/crmData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  Loader2,
  LogOut,
  Plus,
  KanbanSquare,
  MessageSquare,
  Phone,
  Trash2,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const Pipeline = ({ workspaceId, embedded = false }: { workspaceId?: string; embedded?: boolean } = {}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newStageId, setNewStageId] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: pipelineData, isLoading } = useQuery({
    queryKey: crmKeys.pipeline(workspaceId),
    queryFn: () => fetchPipelineBase(workspaceId),
  });

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/admin-auth");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/admin-auth");
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!pipelineData) return;
    setStages(pipelineData.stages);
    setDeals(pipelineData.deals);
    if (pipelineData.stages[0] && !newStageId) setNewStageId(pipelineData.stages[0].id);
  }, [pipelineData, newStageId]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("pipeline-deals")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, (payload) => {
        setDeals((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((d) => d.id !== (payload.old as Deal).id);
          const incoming = payload.new as Deal;
          if (workspaceId && incoming.workspace_id !== workspaceId) return prev;
          const idx = prev.findIndex((d) => d.id === incoming.id);
          const next = idx >= 0
            ? [...prev.slice(0, idx), incoming, ...prev.slice(idx + 1)]
            : [...prev, incoming];
          queryClient.setQueryData(crmKeys.pipeline(workspaceId), { stages, deals: next });
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, stages, workspaceId]);

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    stages.forEach((s) => map.set(s.id, []));
    deals.forEach((d) => {
      const arr = map.get(d.stage_id);
      if (arr) arr.push(d);
    });
    map.forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [deals, stages]);

  const totalsByStage = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>();
    stages.forEach((s) => map.set(s.id, { count: 0, sum: 0 }));
    deals.forEach((d) => {
      const t = map.get(d.stage_id);
      if (t) {
        t.count += 1;
        t.sum += d.amount ?? 0;
      }
    });
    return map;
  }, [deals, stages]);

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;

    // optimistic
    const prevStageId = deal.stage_id;
    const newPosition = (dealsByStage.get(targetStageId)?.length ?? 0);
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId ? { ...d, stage_id: targetStageId, position: newPosition } : d,
      ),
    );

    const { error } = await supabase
      .from("deals")
      .update({ stage_id: targetStageId, position: newPosition })
      .eq("id", dealId);
    if (error) {
      toast.error("Failed to move deal");
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: prevStageId } : d)),
      );
    }
  };

  const createDeal = async () => {
    if (!newTitle.trim() || !newStageId) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const stageDeals = dealsByStage.get(newStageId) ?? [];
    const { error } = await supabase.from("deals").insert({
      user_id: userData.user.id,
      title: newTitle.trim(),
      contact_name: newContact.trim() || null,
      contact_phone: newPhone.trim() || null,
      amount: newAmount ? Number(newAmount) : null,
      stage_id: newStageId,
      position: stageDeals.length,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deal created");
    setShowNew(false);
    setNewTitle("");
    setNewContact("");
    setNewPhone("");
    setNewAmount("");
  };

  const saveDeal = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("deals")
      .update({
        title: editing.title,
        contact_name: editing.contact_name,
        contact_phone: editing.contact_phone,
        amount: editing.amount,
        notes: editing.notes,
        stage_id: editing.stage_id,
      })
      .eq("id", editing.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      setEditing(null);
      setActiveDealId(null);
    }
  };

  const deleteDeal = async (id: string) => {
    if (!confirm("Delete this deal?")) return;
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      setActiveDealId(null);
      setEditing(null);
    }
  };

  const activeDeal = deals.find((d) => d.id === activeDealId) ?? null;
  const draggingDeal = deals.find((d) => d.id === draggingId) ?? null;

  return (
    <>
      <Helmet>
        <title>Pipeline - Iskra CRM</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="h-screen flex flex-col bg-background text-foreground">
        <header className="h-14 px-6 border-b border-border flex items-center justify-between bg-card/40 backdrop-blur">
          <div className="flex items-center gap-3">
            <KanbanSquare className="w-5 h-5 text-primary" />
            <h1 className="font-display text-lg tracking-tight">Pipeline</h1>
            <div className="text-xs text-muted-foreground hidden sm:block">
              {deals.length} deals · ${deals.reduce((s, d) => s + (d.amount ?? 0), 0).toLocaleString()} total
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Plus className="w-4 h-4 mr-1" /> New deal
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/crm")}>
              CRM
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/campaigns")}>
              Campaigns
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              Admin
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/admin-auth");
              }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="h-full flex gap-3 p-4 min-w-min">
                {stages.map((stage) => {
                  const stageDeals = dealsByStage.get(stage.id) ?? [];
                  const totals = totalsByStage.get(stage.id) ?? { count: 0, sum: 0 };
                  return (
                    <StageColumn
                      key={stage.id}
                      stage={stage}
                      deals={stageDeals}
                      total={totals}
                      onDealClick={(id) => setActiveDealId(id)}
                    />
                  );
                })}
              </div>
            </div>
            <DragOverlay>
              {draggingDeal ? <DealCard deal={draggingDeal} dragging /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Deal side panel */}
      <Sheet
        open={!!activeDeal}
        onOpenChange={(o) => {
          if (!o) {
            setActiveDealId(null);
            setEditing(null);
          }
        }}
      >
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {activeDeal && (
            <>
              <SheetHeader>
                <SheetTitle>Deal details</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <Field label="Title">
                  <Input
                    value={(editing ?? activeDeal).title}
                    onChange={(e) =>
                      setEditing({ ...(editing ?? activeDeal), title: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact">
                    <Input
                      value={(editing ?? activeDeal).contact_name ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...(editing ?? activeDeal),
                          contact_name: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={(editing ?? activeDeal).contact_phone ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...(editing ?? activeDeal),
                          contact_phone: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (USD)">
                    <Input
                      type="number"
                      value={(editing ?? activeDeal).amount ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...(editing ?? activeDeal),
                          amount: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Stage">
                    <Select
                      value={(editing ?? activeDeal).stage_id}
                      onValueChange={(v) =>
                        setEditing({ ...(editing ?? activeDeal), stage_id: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Notes">
                  <Textarea
                    rows={5}
                    value={(editing ?? activeDeal).notes ?? ""}
                    onChange={(e) =>
                      setEditing({ ...(editing ?? activeDeal), notes: e.target.value })
                    }
                  />
                </Field>

                <div className="text-xs text-muted-foreground">
                  Updated {formatDistanceToNow(new Date(activeDeal.updated_at), { addSuffix: true })}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {activeDeal.conversation_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/crm?conversation=${activeDeal.conversation_id}`)}
                    >
                      <MessageSquare className="w-4 h-4 mr-1" /> Open chat
                    </Button>
                  )}
                  <Button size="sm" onClick={saveDeal} disabled={!editing}>
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteDeal(activeDeal.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* New deal dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Title *">
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Acme Corp - WhatsApp campaign" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact">
                <Input value={newContact} onChange={(e) => setNewContact(e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (USD)">
                <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
              </Field>
              <Field label="Stage">
                <Select value={newStageId} onValueChange={setNewStageId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button onClick={createDeal} disabled={!newTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    {children}
  </div>
);

const StageColumn = ({
  stage,
  deals,
  total,
  onDealClick,
}: {
  stage: Stage;
  deals: Deal[];
  total: { count: number; sum: number };
  onDealClick: (id: string) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 flex flex-col rounded-lg border bg-card/30 transition ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <div className="font-medium text-sm truncate">{stage.name}</div>
        </div>
        <div className="text-xs text-muted-foreground shrink-0">
          {total.count}
          {total.sum > 0 && ` · $${total.sum.toLocaleString()}`}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
        {deals.map((d) => (
          <DraggableDeal key={d.id} deal={d} onClick={() => onDealClick(d.id)} />
        ))}
        {deals.length === 0 && (
          <div className="text-[11px] text-muted-foreground/60 text-center py-6">
            Drop deals here
          </div>
        )}
      </div>
    </div>
  );
};

const DraggableDeal = ({ deal, onClick }: { deal: Deal; onClick: () => void }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={onClick}
    >
      <DealCard deal={deal} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
};

const DealCard = ({
  deal,
  dragging,
  dragHandleProps,
}: {
  deal: Deal;
  dragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) => {
  return (
    <div
      className={`group rounded-md border border-border bg-card p-3 text-sm cursor-pointer hover:border-primary/40 hover:shadow-sm transition ${
        dragging ? "shadow-lg rotate-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-snug truncate">{deal.title}</div>
        <button
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>
      {(deal.contact_name || deal.contact_phone) && (
        <div className="text-xs text-muted-foreground mt-1 truncate flex items-center gap-1">
          {deal.contact_phone && <Phone className="w-3 h-3" />}
          {deal.contact_name || `+${deal.contact_phone}`}
        </div>
      )}
      {deal.amount != null && (
        <div className="text-xs font-semibold text-primary mt-1.5">
          ${Number(deal.amount).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default Pipeline;
