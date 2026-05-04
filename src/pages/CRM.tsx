import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Phone, Search, LogOut, Send } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Conversation = {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  whatsapp_number_id: string;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_url: string | null;
  status: string;
  created_at: string;
};

type WhatsAppNumber = {
  id: string;
  phone_number: string;
  display_name: string | null;
};

const CRM = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [numberFilter, setNumberFilter] = useState<string>("all");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    if (!activeId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { conversation_id: activeId, text: draft.trim() },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setDraft("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/admin-auth");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/admin-auth");
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Initial data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [{ data: nums }, { data: convs }] = await Promise.all([
        supabase.from("whatsapp_numbers").select("id, phone_number, display_name"),
        supabase
          .from("conversations")
          .select("id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, whatsapp_number_id")
          .order("last_message_at", { ascending: false, nullsFirst: false }),
      ]);
      if (cancelled) return;
      setNumbers(nums ?? []);
      setConversations((convs ?? []) as Conversation[]);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime conversations
  useEffect(() => {
    const channel = supabase
      .channel("crm-conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        setConversations((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((c) => c.id !== (payload.old as Conversation).id);
          }
          const incoming = payload.new as Conversation;
          const idx = prev.findIndex((c) => c.id === incoming.id);
          const next = idx >= 0 ? [...prev.slice(0, idx), incoming, ...prev.slice(idx + 1)] : [incoming, ...prev];
          return next.sort((a, b) => {
            const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            return tb - ta;
          });
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    supabase
      .from("messages")
      .select("id, direction, body, media_url, status, created_at")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setMessages((data ?? []) as Message[]);
        setLoadingMessages(false);
      });
    // Mark read
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId).then(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Realtime messages for active conversation
  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`crm-messages-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => (prev.find((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const filtered = conversations.filter((c) => {
    if (numberFilter !== "all" && c.whatsapp_number_id !== numberFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${c.contact_name ?? ""} ${c.contact_phone} ${c.last_message_text ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <>
      <Helmet>
        <title>CRM Inbox - Iskra</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="h-screen flex flex-col bg-background text-foreground">
        {/* Header */}
        <header className="h-14 px-6 border-b border-border flex items-center justify-between bg-card/40 backdrop-blur">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h1 className="font-display text-lg tracking-tight">CRM Inbox</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              Admin
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/admin-auth");
              }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Left: conversation list */}
          <aside className="w-[340px] border-r border-border flex flex-col bg-card/20">
            <div className="p-3 space-y-2 border-b border-border">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search conversations"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              {numbers.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setNumberFilter("all")}
                    className={`text-xs px-2 py-1 rounded-full border transition ${
                      numberFilter === "all"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    All
                  </button>
                  {numbers.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setNumberFilter(n.id)}
                      className={`text-xs px-2 py-1 rounded-full border transition ${
                        numberFilter === n.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {n.display_name ?? n.phone_number}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No conversations yet. Incoming WhatsApp messages will appear here.
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition ${
                      activeId === c.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-medium text-sm truncate">
                        {c.contact_name || `+${c.contact_phone}`}
                      </div>
                      {c.unread_count > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.last_message_text || "—"}
                    </div>
                    {c.last_message_at && (
                      <div className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Right: chat window */}
          <section className="flex-1 flex flex-col min-w-0">
            {!active ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a conversation to view messages</p>
                </div>
              </div>
            ) : (
              <>
                <div className="h-14 px-6 border-b border-border flex items-center gap-3 bg-card/40">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                    {(active.contact_name ?? active.contact_phone).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {active.contact_name || `+${active.contact_phone}`}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />+{active.contact_phone}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 bg-background">
                  {loadingMessages ? (
                    <div className="flex justify-center pt-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground pt-8">
                      No messages in this conversation.
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isOut = m.direction === "outbound";
                      return (
                        <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                              isOut
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-card border border-border rounded-bl-sm"
                            }`}
                          >
                            {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                            {m.media_url && (
                              <a
                                href={m.media_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs underline opacity-80"
                              >
                                Media attachment
                              </a>
                            )}
                            <div
                              className={`text-[10px] mt-1 ${
                                isOut ? "text-primary-foreground/70" : "text-muted-foreground"
                              }`}
                            >
                              {new Date(m.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {isOut && ` · ${m.status}`}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-border px-4 py-3 bg-card/30">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      className="resize-none flex-1"
                      disabled={sending}
                    />
                    <Button
                      onClick={handleSend}
                      disabled={sending || !draft.trim()}
                      size="icon"
                      className="h-10 w-10 shrink-0"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
};

export default CRM;
