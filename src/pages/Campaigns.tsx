import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Loader2, Megaphone, Play, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { crmKeys, fetchCampaignBase } from "@/lib/crmData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Recipient = { phone: string; name?: string; variables?: Record<string, string>; conversation_id?: string };

const parseRecipients = (raw: string): Recipient[] => {
  const rows = raw.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  if (rows.length === 0) return [];
  const first = rows[0].split(",").map((c) => c.trim().toLowerCase());
  const hasHeader = first.some((c) => ["phone", "contact_phone", "name", "contact_name"].includes(c));
  const headers = hasHeader ? first : ["phone", "name"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((row) => {
    const cols = row.split(",").map((c) => c.trim());
    const item: Recipient = { phone: "", variables: {} };
    headers.forEach((h, idx) => {
      const value = cols[idx] ?? "";
      if (h === "phone" || h === "contact_phone") item.phone = value;
      else if (h === "name" || h === "contact_name") item.name = value;
      else if (value) item.variables![h] = value;
    });
    return item;
  }).filter((r) => r.phone.replace(/[^\d]/g, "").length >= 8);
};

const Campaigns = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: crmKeys.campaigns, queryFn: fetchCampaignBase });
  const numbers = data?.numbers ?? [];
  const templates = data?.templates ?? [];
  const campaigns = data?.campaigns ?? [];
  const conversations = data?.conversations ?? [];

  const [numberId, setNumberId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [campaignName, setCampaignName] = useState("Test outreach");
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [variables, setVariables] = useState("name");
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);
  const [csv, setCsv] = useState("phone,name\n971500000000,Arseny");

  const recipients = useMemo(() => parseRecipients(csv), [csv]);
  const selectedNumber = numberId || numbers[0]?.id || "";
  const selectedTemplate = templateId || templates[0]?.id || "";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedNumber) throw new Error("Add a WhatsApp number first");
      let activeTemplate = selectedTemplate;
      if (!activeTemplate) {
        if (!templateName.trim()) throw new Error("Add approved Gupshup template name");
        const { data: created, error } = await supabase.functions.invoke("campaigns", {
          body: {
            action: "upsert_template",
            whatsapp_number_id: selectedNumber,
            name: templateName.trim(),
            body: templateBody.trim(),
            variables: variables.split(",").map((v) => v.trim()).filter(Boolean),
          },
        });
        if (error) throw error;
        if ((created as { error?: string })?.error) throw new Error((created as { error: string }).error);
        activeTemplate = (created as { template_id: string }).template_id;
      }
      if (recipients.length === 0) throw new Error("Paste CSV recipients first");
      const { data: launched, error } = await supabase.functions.invoke("campaigns", {
        body: {
          action: "launch",
          name: campaignName.trim() || "Campaign",
          whatsapp_number_id: selectedNumber,
          template_id: activeTemplate,
          delay_min_seconds: delayMin,
          delay_max_seconds: delayMax,
          recipients,
        },
      });
      if (error) throw error;
      if ((launched as { error?: string })?.error) throw new Error((launched as { error: string }).error);
      return launched;
    },
    onSuccess: async () => {
      toast.success("Campaign scheduled");
      await queryClient.invalidateQueries({ queryKey: crmKeys.campaigns });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Launch failed"),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNumber) throw new Error("Pick a sending number first");
      const { data: res, error } = await supabase.functions.invoke("campaigns", {
        body: { action: "sync_templates", whatsapp_number_id: selectedNumber },
      });
      if (error) throw error;
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      return res as { fetched: number; upserted: number };
    },
    onSuccess: async (res) => {
      toast.success(`Synced ${res.upserted}/${res.fetched} templates`);
      await queryClient.invalidateQueries({ queryKey: crmKeys.campaigns });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Sync failed"),
  });
  const loadChats = () => {
    setCsv(["phone,name,conversation_id", ...conversations.map((c) => `${c.contact_phone},${c.contact_name ?? ""},${c.id}`)].join("\n"));
  };

  return (
    <>
      <Helmet><title>Campaigns - Iskra CRM</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="min-h-screen bg-background text-foreground">
        <header className="h-14 px-6 border-b border-border flex items-center justify-between bg-card/40">
          <div className="flex items-center gap-3"><Megaphone className="w-5 h-5 text-primary" /><h1 className="font-display text-lg">Campaigns</h1></div>
          <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => navigate("/pipeline")}><ArrowLeft className="w-4 h-4 mr-1" />Pipeline</Button><Button variant="ghost" size="sm" onClick={() => navigate("/crm")}>CRM</Button></div>
        </header>
        {isLoading ? <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <main className="p-4 grid lg:grid-cols-[1fr_360px] gap-4">
            <section className="rounded-lg border border-border bg-card/30 p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3"><Field label="Campaign name"><Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></Field><Field label="Sending number"><Select value={selectedNumber} onValueChange={setNumberId}><SelectTrigger><SelectValue placeholder="Select number" /></SelectTrigger><SelectContent>{numbers.map((n) => <SelectItem key={n.id} value={n.id}>{n.display_name ?? `+${n.phone_number}`}</SelectItem>)}</SelectContent></Select></Field></div>
              <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-end"><Field label="Approved template"><Select value={selectedTemplate} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Select or create below" /></SelectTrigger><SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.language}</SelectItem>)}</SelectContent></Select></Field><Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh templates"><RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /></Button><Field label="New template name"><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="gupshup_approved_name" /></Field></div>
              <Field label="Template body preview"><Textarea rows={3} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} placeholder="Only for manager preview - sending uses approved Gupshup template name" /></Field>
              <Field label="Variables"><Input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="name, city, offer" /></Field>
              <div className="grid sm:grid-cols-2 gap-3"><Field label="Min delay seconds"><Input type="number" min={5} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} /></Field><Field label="Max delay seconds"><Input type="number" min={delayMin} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} /></Field></div>
              <Field label={`Recipients CSV - ${recipients.length} valid`}><Textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
              <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={loadChats}><RefreshCw className="w-4 h-4 mr-1" />Use current chats</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}><Play className="w-4 h-4 mr-1" />{mutation.isPending ? "Scheduling..." : "Launch with delays"}</Button></div>
            </section>
            <aside className="rounded-lg border border-border bg-card/30 p-4 space-y-3"><div className="font-medium flex items-center gap-2"><Plus className="w-4 h-4 text-primary" />Recent campaigns</div>{campaigns.length === 0 ? <div className="text-sm text-muted-foreground">No campaigns yet.</div> : campaigns.map((c) => <div key={c.id} className="rounded-md border border-border p-3 text-sm"><div className="font-medium truncate">{c.name}</div><div className="text-xs text-muted-foreground mt-1">{c.status} · {c.sent_count}/{c.total_recipients} sent · {c.failed_count} failed</div><div className="text-xs text-muted-foreground">Delay {c.delay_min_seconds}-{c.delay_max_seconds}s</div></div>)}</aside>
          </main>
        )}
      </div>
    </>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>;

export default Campaigns;