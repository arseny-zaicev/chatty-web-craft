import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import AssigneeSelect from "@/components/workspace/AssigneeSelect";
import StageAutomationsDialog from "@/components/workspace/StageAutomationsDialog";
import { fetchWorkspaceMembers, workspaceMembersKey, memberDisplayName } from "@/lib/workspaceMembers";
import { createDeal, updateDeal, deleteDeal as deleteDealApi, moveDeal } from "@/lib/deals";
import { fetchPipelines, pipelinesKey, moveDealToPipeline } from "@/lib/pipelines";
import { markConversationRead } from "@/lib/inbox";
import { useRequireAuth } from "@/hooks/useAuthSession";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import CRM from "./CRM";

const Pipeline = ({ workspaceId, embedded = false }: { workspaceId?: string; embedded?: boolean } = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const wsSlugMatch = location.pathname.match(/^\/ws\/([^/]+)/);
  const wsSlug = wsSlugMatch?.[1];
  const inboxPath = (conversationId: string) =>
    wsSlug ? `/ws/${wsSlug}/inbox?conversation=${conversationId}` : `/crm?conversation=${conversationId}`;

  const { data: pipelines = [] } = useQuery({
    queryKey: pipelinesKey(workspaceId),
    queryFn: () => fetchPipelines(workspaceId),
    enabled: !!workspaceId,
  });
  const urlPipeline = searchParams.get("pipeline");
  const defaultPipeline = pipelines.find((p) => p.is_default) ?? pipelines[0] ?? null;
  const selectedPipelineId =
    (urlPipeline && pipelines.some((p) => p.id === urlPipeline)) ? urlPipeline : defaultPipeline?.id ?? null;
  // Sync URL to default once pipelines load
  useEffect(() => {
    if (!urlPipeline && defaultPipeline) {
      setSearchParams((prev) => { prev.set("pipeline", defaultPipeline.id); return prev; }, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPipeline?.id]);
  
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // 'all' | 'me' | 'unassigned' | userId
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
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
    queryKey: crmKeys.pipeline(workspaceId, selectedPipelineId),
    queryFn: () => fetchPipelineBase(workspaceId, selectedPipelineId),
    enabled: !!workspaceId ? !!selectedPipelineId : true,
  });

  // Auth gate + me id
  const authedUserId = useRequireAuth("/admin-auth");
  useEffect(() => { setMeId(authedUserId); }, [authedUserId]);

  useEffect(() => {
    if (!pipelineData) return;
    setStages(pipelineData.stages);
    setDeals(pipelineData.deals);
    setConversations(pipelineData.conversations);
    if (pipelineData.stages[0] && !newStageId) setNewStageId(pipelineData.stages[0].id);
  }, [pipelineData, newStageId]);

  // Realtime deals — workspace-scoped channel; client filters to selected pipeline.
  useRealtimeTable<Deal>(
    {
      channel: `pipeline-deals-${workspaceId ?? "all"}`,
      table: "deals",
      filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
      enabled: !!workspaceId,
    },
    (payload) => {
      setDeals((prev) => {
        if (payload.eventType === "DELETE") return prev.filter((d) => d.id !== (payload.old as Deal).id);
        const incoming = payload.new as Deal;
        // Drop events for other pipelines; remove if previously belonged here.
        if (selectedPipelineId && incoming.pipeline_id && incoming.pipeline_id !== selectedPipelineId) {
          return prev.filter((d) => d.id !== incoming.id);
        }
        const idx = prev.findIndex((d) => d.id === incoming.id);
        return idx >= 0
          ? [...prev.slice(0, idx), incoming, ...prev.slice(idx + 1)]
          : [...prev, incoming];
      });
    },
    [workspaceId, selectedPipelineId],
  );

  // Realtime conversations (assignee / responder updates) — workspace-scoped
  useRealtimeTable<Conversation>(
    {
      channel: `pipeline-conversations-${workspaceId ?? "all"}`,
      table: "conversations",
      filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
      enabled: !!workspaceId,
    },
    (payload) => {
      setConversations((prev) => {
        if (payload.eventType === "DELETE") return prev.filter((c) => c.id !== (payload.old as Conversation).id);
        const incoming = payload.new as Conversation;
        const idx = prev.findIndex((c) => c.id === incoming.id);
        return idx >= 0
          ? [...prev.slice(0, idx), incoming, ...prev.slice(idx + 1)]
          : [...prev, incoming];
      });
    },
    [workspaceId],
  );

  const dealMatchesAssignee = (d: Deal): boolean => {
    if (assigneeFilter === "all") return true;
    const c = d.conversation_id ? convById.get(d.conversation_id) : null;
    const aid = c?.assigned_user_id ?? null;
    if (assigneeFilter === "unassigned") return !aid;
    if (assigneeFilter === "me") return !!meId && aid === meId;
    return aid === assigneeFilter;
  };
  const dealUnread = (d: Deal): number => {
    const c = d.conversation_id ? convById.get(d.conversation_id) : null;
    return c?.unread_count ?? 0;
  };
  const visibleDeals = useMemo(
    () => deals.filter((d) => dealMatchesAssignee(d) && (!unreadOnly || dealUnread(d) > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, assigneeFilter, meId, convById, unreadOnly],
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
    const overId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    // Special: delete drop zone
    if (overId === "__delete__") {
      const ok = confirm("Delete this deal?");
      if (!ok) return;
      const prev = deals;
      setDeals((p) => p.filter((d) => d.id !== dealId));
      const { error } = await deleteDealApi(dealId).then(() => ({ error: null as any })).catch((e) => ({ error: e }));
      if (error) {
        toast.error("Failed to delete");
        setDeals(prev);
      } else {
        toast.success("Deal deleted");
      }
      return;
    }

    const targetStageId = overId;
    if (deal.stage_id === targetStageId) return;

    // optimistic
    const prevStageId = deal.stage_id;
    const newPosition = (dealsByStage.get(targetStageId)?.length ?? 0);
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId ? { ...d, stage_id: targetStageId, position: newPosition } : d,
      ),
    );

    const { error } = await moveDeal(dealId, targetStageId, newPosition).then(() => ({ error: null as any })).catch((e) => ({ error: e }));
    if (error) {
      toast.error("Failed to move deal");
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: prevStageId } : d)),
      );
    } else {
      const stage = stages.find((s) => s.id === targetStageId);
      if (stage?.name) toast.success(`Moved to ${stage.name}`);
      // Auto mark-read when moving to a lost stage (e.g. Block / Not interested),
      // so unread chats don't keep haunting the Inbox.
      if (stage?.stage_type === "lost" && deal.conversation_id) {
        const cid = deal.conversation_id;
        setConversations((prev) => prev.map((c) => (c.id === cid ? { ...c, unread_count: 0 } : c)));
        void markConversationRead(cid).catch(() => {});
      }
    }
  };

  const handleCreateDeal = async () => {
    if (!newTitle.trim() || !newStageId) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const stageDeals = dealsByStage.get(newStageId) ?? [];
    try {
      await createDeal({
        userId: userData.user.id,
        workspaceId: workspaceId ?? null,
        title: newTitle.trim(),
        contactName: newContact.trim() || null,
        contactPhone: newPhone.trim() || null,
        amount: newAmount ? Number(newAmount) : null,
        stageId: newStageId,
        position: stageDeals.length,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
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
    try {
      await updateDeal(editing.id, {
        title: editing.title,
        contact_name: editing.contact_name,
        contact_phone: editing.contact_phone,
        amount: editing.amount,
        notes: editing.notes,
        stage_id: editing.stage_id,
      });
      toast.success("Saved");
      const targetStage = stages.find((s) => s.id === editing.stage_id);
      if (targetStage?.stage_type === "lost" && editing.conversation_id) {
        const cid = editing.conversation_id;
        setConversations((prev) => prev.map((c) => (c.id === cid ? { ...c, unread_count: 0 } : c)));
        void markConversationRead(cid).catch(() => {});
      }
      setEditing(null);
      setActiveDealId(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const handleDeleteDeal = async (id: string) => {
    if (!confirm("Delete this deal?")) return;
    try {
      await deleteDealApi(id);
      setActiveDealId(null);
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
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

      <div className={`${embedded ? "h-full" : "h-screen"} flex flex-col bg-background text-foreground relative`}>
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
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-card/30 flex-wrap">
            {pipelines.length > 0 && (
              <div className="flex items-center gap-1 mr-auto flex-wrap">
                {pipelines.map((p) => {
                  const active = p.id === selectedPipelineId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSearchParams((prev) => { prev.set("pipeline", p.id); return prev; }, { replace: true })}
                      className={`text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1.5 ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                      title={p.name}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
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
                    {memberDisplayName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(() => {
              const unreadCount = deals.reduce((s, d) => s + (dealUnread(d) > 0 ? 1 : 0), 0);
              return (
                <button
                  onClick={() => setUnreadOnly((v) => !v)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
                    unreadOnly
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                  title="Show only deals with unread messages"
                >
                  Unread{unreadCount > 0 && ` · ${unreadCount}`}
                </button>
              );
            })()}
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
                      onOpenChat={(convId) => setChatConversationId(convId)}
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
            <BottomActionBar visible={!!draggingDeal} stages={stages} />
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
                {pipelines.length > 1 && (
                  <Field label="Pipeline">
                    <Select
                      value={(editing ?? activeDeal).pipeline_id ?? selectedPipelineId ?? ""}
                      onValueChange={async (v) => {
                        if (!v || v === activeDeal.pipeline_id) return;
                        try {
                          await moveDealToPipeline(activeDeal.id, v);
                          toast.success("Deal moved to pipeline");
                          setActiveDealId(null);
                          setEditing(null);
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed to move");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                              {p.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
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
                      onClick={() => setChatConversationId(activeDeal.conversation_id!)}
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
                    onClick={() => handleDeleteDeal(activeDeal.id)}
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
            <Button onClick={handleCreateDeal} disabled={!newTitle.trim()}>
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
  const style: React.CSSProperties = {
    opacity: isDragging ? 0 : 1,
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <DealCard
        deal={deal}
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
  onOpenChat,
  conversation,
  assignee,
}: {
  deal: Deal;
  dragging?: boolean;
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
      className={`group rounded-md border border-border bg-card p-3 text-sm cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition-shadow ${
        dragging ? "shadow-2xl ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-snug truncate flex-1">{deal.title}</div>
        <div className="flex items-center gap-1 shrink-0">
          {(conversation?.unread_count ?? 0) > 0 && (
            <div
              className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center"
              title={`${conversation!.unread_count} unread`}
            >
              {conversation!.unread_count}
            </div>
          )}
          {initials && (
            <div
              className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-semibold flex items-center justify-center"
              title={`Assigned: ${assignee?.full_name ?? "User"}`}
            >
              {initials}
            </div>
          )}
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

type ActionZone = {
  id: string;
  label: string;
  bg: string;
  hoverBg: string;
  text: string;
};

const ActionDropZone = ({ zone }: { zone: ActionZone }) => {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 h-full flex items-center justify-center text-sm font-semibold transition-all ${zone.text} ${isOver ? `${zone.hoverBg} scale-[1.02]` : zone.bg}`}
    >
      {zone.label}
    </div>
  );
};

const BottomActionBar = ({ visible, stages }: { visible: boolean; stages: Stage[] }) => {
  if (!visible) return null;

  // Final-status zones: won/lost via stage_type + any stage named "booked"
  const won = stages.filter((s) => s.stage_type === "won");
  const lost = stages.filter((s) => s.stage_type === "lost");
  const booked = stages.filter(
    (s) => s.stage_type !== "won" && s.stage_type !== "lost" && /booked/i.test(s.name),
  );

  const zones: ActionZone[] = [
    { id: "__delete__", label: "Delete", bg: "bg-muted/80", hoverBg: "bg-muted", text: "text-foreground" },
    ...lost.map<ActionZone>((s) => ({
      id: s.id,
      label: s.name,
      bg: "bg-destructive/80",
      hoverBg: "bg-destructive",
      text: "text-destructive-foreground",
    })),
    ...booked.map<ActionZone>((s) => ({
      id: s.id,
      label: s.name,
      bg: "bg-primary/80",
      hoverBg: "bg-primary",
      text: "text-primary-foreground",
    })),
    ...won.map<ActionZone>((s) => ({
      id: s.id,
      label: s.name,
      bg: "bg-emerald-600/80",
      hoverBg: "bg-emerald-600",
      text: "text-white",
    })),
  ];

  if (zones.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-16 flex shadow-2xl z-50 pointer-events-auto animate-in slide-in-from-bottom-4 duration-150">
      {zones.map((z) => (
        <ActionDropZone key={z.id} zone={z} />
      ))}
    </div>
  );
};

export default Pipeline;
