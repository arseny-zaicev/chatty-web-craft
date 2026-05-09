import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Conversation, Deal, Stage, crmKeys, fetchPipelineBase } from "@/lib/crmData";
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
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import AssigneeSelect from "@/components/workspace/AssigneeSelect";
import StageAutomationsDialog from "@/components/workspace/StageAutomationsDialog";
import { fetchWorkspaceMembers, workspaceMembersKey } from "@/lib/workspaceMembers";

const Pipeline = ({ workspaceId, embedded = false }: { workspaceId?: string; embedded?: boolean } = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const wsSlugMatch = location.pathname.match(/^\/ws\/([^/]+)/);
  const wsSlug = wsSlugMatch?.[1];
  const inboxPath = (conversationId: string) =>
    wsSlug ? `/ws/${wsSlug}/inbox?conversation=${conversationId}` : `/crm?conversation=${conversationId}`;
  
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // 'all' | 'me' | 'unassigned' | userId
  const [showAutomations, setShowAutomations] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newStageId, setNewStageId] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: members = [] } = useQuery({
    queryKey: workspaceMembersKey(workspaceId),
    queryFn: () => fetchWorkspaceMembers(workspaceId),
    enabled: !!workspaceId,
  });
  const memberById = useMemo(() => {
    const m = new Map<string, (typeof members)[number]>();
    members.forEach((x) => m.set(x.user_id, x));
    return m;
  }, [members]);
  const convById = useMemo(() => {
    const m = new Map<string, Conversation>();
    conversations.forEach((c) => m.set(c.id, c));
    return m;
  }, [conversations]);

  const { data: pipelineData, isLoading } = useQuery({
    queryKey: crmKeys.pipeline(workspaceId),
    queryFn: () => fetchPipelineBase(workspaceId),
  });

  // Auth gate + me id
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/admin-auth");
      else setMeId(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/admin-auth");
      else setMeId(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!pipelineData) return;
    setStages(pipelineData.stages);
    setDeals(pipelineData.deals);
    setConversations(pipelineData.conversations);
    if (pipelineData.stages[0] && !newStageId) setNewStageId(pipelineData.stages[0].id);
  }, [pipelineData, newStageId]);

  // Realtime deals
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
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  // Realtime conversations (assignee / responder updates)
  useEffect(() => {
    const channel = supabase
      .channel("pipeline-conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        setConversations((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((c) => c.id !== (payload.old as Conversation).id);
          const incoming = payload.new as Conversation;
          if (workspaceId && incoming.workspace_id !== workspaceId) return prev;
          const idx = prev.findIndex((c) => c.id === incoming.id);
          return idx >= 0
            ? [...prev.slice(0, idx), incoming, ...prev.slice(idx + 1)]
            : [...prev, incoming];
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  const dealMatchesAssignee = (d: Deal): boolean => {
    if (assigneeFilter === "all") return true;
    const c = d.conversation_id ? convById.get(d.conversation_id) : null;
    const aid = c?.assigned_user_id ?? null;
    if (assigneeFilter === "unassigned") return !aid;
    if (assigneeFilter === "me") return !!meId && aid === meId;
    return aid === assigneeFilter;
  };
  const visibleDeals = useMemo(
    () => deals.filter(dealMatchesAssignee),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, assigneeFilter, meId, convById],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    stages.forEach((s) => map.set(s.id, []));
    visibleDeals.forEach((d) => {
      const arr = map.get(d.stage_id);
      if (arr) arr.push(d);
    });
    map.forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [visibleDeals, stages]);

  const totalsByStage = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>();
    stages.forEach((s) => map.set(s.id, { count: 0, sum: 0 }));
    visibleDeals.forEach((d) => {
      const t = map.get(d.stage_id);
      if (t) {
        t.count += 1;
        t.sum += d.amount ?? 0;
      }
    });
    return map;
  }, [visibleDeals, stages]);

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
      workspace_id: workspaceId ?? null,
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

      <div className={`${embedded ? "h-full" : "h-screen"} flex flex-col bg-background text-foreground`}>
        {!embedded && <header className="h-14 px-6 border-b border-border flex items-center justify-between bg-card/40 backdrop-blur">
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
        </header>}

        {!embedded ? null : (
          <div className="px-4 py-2 border-b border-border flex items-center justify-end gap-2 bg-card/30">
            <span className="text-xs text-muted-foreground">Filter:</span>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chats</SelectItem>
                <SelectItem value="me">My chats</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.full_name?.trim() || `User ${m.user_id.slice(0, 6)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setShowAutomations(true)}>
              Automations
            </Button>
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Plus className="w-4 h-4 mr-1" /> New deal
            </Button>
          </div>
        )}

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
                      onOpenChat={(convId) => navigate(inboxPath(convId))}
                      conversationOf={(d) => (d.conversation_id ? convById.get(d.conversation_id) ?? null : null)}
                      assigneeOf={(d) => {
                        const c = d.conversation_id ? convById.get(d.conversation_id) : null;
                        return c?.assigned_user_id ? memberById.get(c.assigned_user_id) ?? null : null;
                      }}
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

                {activeDeal.conversation_id && (
                  <Field label="Assigned to">
                    <AssigneeSelect
                      workspaceId={workspaceId}
                      value={convById.get(activeDeal.conversation_id)?.assigned_user_id ?? null}
                      onChange={async (uid) => {
                        const cid = activeDeal.conversation_id!;
                        // Optimistic
                        setConversations((prev) =>
                          prev.map((c) => (c.id === cid ? { ...c, assigned_user_id: uid } : c)),
                        );
                        const { error } = await supabase
                          .from("conversations")
                          .update({ assigned_user_id: uid })
                          .eq("id", cid);
                        if (error) toast.error(error.message);
                        else toast.success("Assignee updated");
                      }}
                    />
                  </Field>
                )}

                <div className="text-xs text-muted-foreground">
                  Updated {formatDistanceToNow(new Date(activeDeal.updated_at), { addSuffix: true })}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {activeDeal.conversation_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(inboxPath(activeDeal.conversation_id!))}
                    >
                      <MessageSquare className="w-4 h-4 mr-1" /> Open chat
                    </Button>
                  )}
                  {activeDeal.contact_phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`+${activeDeal.contact_phone}`);
                        toast.success("Phone copied");
                      }}
                    >
                      <Phone className="w-4 h-4 mr-1" /> Copy phone
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const stageName = stages.find((s) => s.id === activeDeal.stage_id)?.name ?? "";
                      const lines = [
                        `Title: ${activeDeal.title}`,
                        activeDeal.contact_name ? `Contact: ${activeDeal.contact_name}` : null,
                        activeDeal.contact_phone ? `Phone: +${activeDeal.contact_phone}` : null,
                        activeDeal.amount != null ? `Amount: $${Number(activeDeal.amount).toLocaleString()}` : null,
                        `Stage: ${stageName}`,
                        activeDeal.notes ? `Notes: ${activeDeal.notes}` : null,
                      ].filter(Boolean);
                      navigator.clipboard.writeText(lines.join("\n"));
                      toast.success("Details copied");
                    }}
                  >
                    <Copy className="w-4 h-4 mr-1" /> Copy details
                  </Button>
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

      <StageAutomationsDialog
        open={showAutomations}
        onOpenChange={setShowAutomations}
        workspaceId={workspaceId}
        stages={stages}
      />

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

type AssigneeLite = { user_id: string; full_name: string | null } | null;

const StageColumn = ({
  stage,
  deals,
  total,
  onDealClick,
  onOpenChat,
  conversationOf,
  assigneeOf,
}: {
  stage: Stage;
  deals: Deal[];
  total: { count: number; sum: number };
  onDealClick: (id: string) => void;
  onOpenChat?: (conversationId: string) => void;
  conversationOf?: (d: Deal) => Conversation | null;
  assigneeOf?: (d: Deal) => AssigneeLite;
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
          <DraggableDeal
            key={d.id}
            deal={d}
            onClick={() => onDealClick(d.id)}
            onOpenChat={onOpenChat}
            conversation={conversationOf?.(d) ?? null}
            assignee={assigneeOf?.(d) ?? null}
          />
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

const DraggableDeal = ({
  deal,
  onClick,
  onOpenChat,
  conversation,
  assignee,
}: {
  deal: Deal;
  onClick: () => void;
  onOpenChat?: (conversationId: string) => void;
  conversation?: Conversation | null;
  assignee?: AssigneeLite;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={onClick}
    >
      <DealCard
        deal={deal}
        dragHandleProps={{ ...attributes, ...listeners }}
        onOpenChat={onOpenChat}
        conversation={conversation}
        assignee={assignee}
      />
    </div>
  );
};

const DealCard = ({
  deal,
  dragging,
  dragHandleProps,
  onOpenChat,
  conversation,
  assignee,
}: {
  deal: Deal;
  dragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onOpenChat?: (conversationId: string) => void;
  conversation?: Conversation | null;
  assignee?: AssigneeLite;
}) => {
  const phone = deal.contact_phone ?? conversation?.contact_phone ?? null;
  const convId = deal.conversation_id ?? conversation?.id ?? null;
  const copyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!phone) return;
    navigator.clipboard.writeText(`+${phone}`);
    toast.success("Phone copied");
  };
  const openChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (convId && onOpenChat) onOpenChat(convId);
  };
  const initials = assignee
    ? (() => {
        const n = assignee.full_name?.trim();
        if (n) {
          const p = n.split(/\s+/);
          return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
        }
        return assignee.user_id.slice(0, 2).toUpperCase();
      })()
    : null;
  return (
    <div
      className={`group rounded-md border border-border bg-card p-3 text-sm cursor-pointer hover:border-primary/40 hover:shadow-sm transition ${
        dragging ? "shadow-lg rotate-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-snug truncate flex-1">{deal.title}</div>
        <div className="flex items-center gap-1 shrink-0">
          {initials && (
            <div
              className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-semibold flex items-center justify-center"
              title={`Assigned: ${assignee?.full_name ?? "User"}`}
            >
              {initials}
            </div>
          )}
          <button
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
      {deal.contact_name && (
        <div className="text-xs text-foreground/80 mt-1 truncate">{deal.contact_name}</div>
      )}
      {phone && (
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate flex items-center gap-1 font-mono">
          <Phone className="w-3 h-3" />+{phone}
        </div>
      )}
      {deal.amount != null && (
        <div className="text-xs font-semibold text-primary mt-1.5">
          ${Number(deal.amount).toLocaleString()}
        </div>
      )}
      {(convId || phone) && (
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          {convId && onOpenChat && (
            <button
              onClick={openChat}
              className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center gap-1"
              title="Open chat"
            >
              <MessageSquare className="w-3 h-3" /> Chat
            </button>
          )}
          {phone && (
            <button
              onClick={copyPhone}
              className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center gap-1"
              title="Copy phone"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Pipeline;
