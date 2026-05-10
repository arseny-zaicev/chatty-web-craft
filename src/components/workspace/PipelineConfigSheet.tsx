import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Copy, Trash2, RefreshCw, Webhook, FileSpreadsheet, Upload, Code2, Check } from "lucide-react";
import { toast } from "sonner";

type Pipeline = {
  id: string;
  workspace_id: string;
  name: string;
  auto_outreach_enabled: boolean;
  first_touch_template_id: string | null;
  default_sender_number_ids: string[];
  slack_channel_id: string | null;
  daily_cap: number | null;
  sending_window: { start?: string; end?: string; timezone?: string } | null;
};

type Source = {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  kind: "webhook" | "google_sheet" | "csv_upload" | "apps_script" | "api";
  name: string;
  status: "active" | "paused" | "error";
  secret_token: string;
  last_ingest_at: string | null;
  last_error: string | null;
  created_at: string;
};

type Template = { id: string; name: string };
type WaNumber = { id: string; phone_number: string; display_name: string | null };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const SOURCE_KINDS: { value: Source["kind"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "webhook", label: "Generic webhook", icon: Webhook },
  { value: "google_sheet", label: "Google Sheet", icon: FileSpreadsheet },
  { value: "csv_upload", label: "CSV upload", icon: Upload },
  { value: "apps_script", label: "Apps Script", icon: Code2 },
];

export default function PipelineConfigSheet({
  pipeline,
  open,
  onClose,
}: {
  pipeline: Pipeline | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const wsId = pipeline?.workspace_id;
  const pipeId = pipeline?.id;

  const [autoOutreach, setAutoOutreach] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [senderIds, setSenderIds] = useState<string[]>([]);
  const [slackChannel, setSlackChannel] = useState("");
  const [dailyCap, setDailyCap] = useState<string>("");
  const [winStart, setWinStart] = useState("09:00");
  const [winEnd, setWinEnd] = useState("18:00");

  const [showNewSource, setShowNewSource] = useState(false);
  const [newSourceKind, setNewSourceKind] = useState<Source["kind"]>("webhook");
  const [newSourceName, setNewSourceName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Hydrate when pipeline changes
  const hydrate = (p: Pipeline) => {
    setAutoOutreach(Boolean(p.auto_outreach_enabled));
    setTemplateId(p.first_touch_template_id ?? "");
    setSenderIds(p.default_sender_number_ids ?? []);
    setSlackChannel(p.slack_channel_id ?? "");
    setDailyCap(p.daily_cap ? String(p.daily_cap) : "");
    setWinStart(p.sending_window?.start ?? "09:00");
    setWinEnd(p.sending_window?.end ?? "18:00");
  };

  const { data: templates } = useQuery({
    queryKey: ["pipeline-templates", wsId],
    enabled: Boolean(wsId && open),
    queryFn: async (): Promise<Template[]> => {
      const { data } = await supabase
        .from("message_templates")
        .select("id, name")
        .eq("workspace_id", wsId)
        .eq("status", "approved")
        .order("name");
      return (data ?? []) as Template[];
    },
  });

  const { data: numbers } = useQuery({
    queryKey: ["pipeline-numbers", wsId],
    enabled: Boolean(wsId && open),
    queryFn: async (): Promise<WaNumber[]> => {
      const { data } = await supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name")
        .eq("workspace_id", wsId)
        .order("display_name");
      return (data ?? []) as WaNumber[];
    },
  });

  const { data: sources, refetch: refetchSources } = useQuery({
    queryKey: ["pipeline-sources", pipeId],
    enabled: Boolean(pipeId && open),
    queryFn: async (): Promise<Source[]> => {
      const { data } = await supabase
        .from("source_connections")
        .select("*")
        .eq("pipeline_id", pipeId);
      return (data ?? []) as Source[];
    },
  });

  // hydrate when sheet opens
  if (open && pipeline && autoOutreach !== pipeline.auto_outreach_enabled && templateId === "" && (pipeline.first_touch_template_id || pipeline.default_sender_number_ids?.length)) {
    // Initial load - hydrate once
    hydrate(pipeline);
  }

  const saveOutreach = async () => {
    if (!pipeId) return;
    const sending_window =
      winStart && winEnd ? { start: winStart, end: winEnd } : null;
    const { error } = await supabase
      .from("pipelines")
      .update({
        auto_outreach_enabled: autoOutreach,
        first_touch_template_id: templateId || null,
        default_sender_number_ids: senderIds,
        slack_channel_id: slackChannel.trim() || null,
        daily_cap: dailyCap ? Math.max(1, parseInt(dailyCap, 10)) : null,
        sending_window,
      })
      .eq("id", pipeId);
    if (error) return toast.error(error.message);
    toast.success("Pipeline saved");
    qc.invalidateQueries({ queryKey: ["pipelines", wsId] });
  };

  const createSource = async () => {
    if (!pipeId || !wsId) return;
    if (!newSourceName.trim()) return toast.error("Source needs a name");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    // 32-char URL-safe token
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
    const { error } = await supabase.from("source_connections").insert({
      workspace_id: wsId,
      pipeline_id: pipeId,
      kind: newSourceKind,
      name: newSourceName.trim(),
      secret_token: token,
      created_by: u.user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Source connected");
    setShowNewSource(false);
    setNewSourceName("");
    refetchSources();
  };

  const rotateToken = async (s: Source) => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
    const { error } = await supabase
      .from("source_connections")
      .update({ secret_token: token })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Token rotated");
    refetchSources();
  };

  const deleteSource = async (s: Source) => {
    if (!confirm(`Disconnect "${s.name}"?`)) return;
    const { error } = await supabase.from("source_connections").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Source removed");
    refetchSources();
  };

  const webhookUrl = (s: Source) => `${SUPABASE_URL}/functions/v1/lead-intake?token=${s.secret_token}`;

  const copy = async (val: string, key: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{pipeline?.name ?? "Pipeline"}</SheetTitle>
          <SheetDescription>
            Configure how leads enter this pipeline and how the team is notified.
          </SheetDescription>
        </SheetHeader>

        {/* Sources */}
        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lead sources</h3>
            <Button size="sm" variant="outline" onClick={() => setShowNewSource((v) => !v)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Connect source
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A pipeline is <strong>manual</strong> until you connect a source. External systems POST leads to the webhook URL.
          </p>

          {showNewSource && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={newSourceKind} onValueChange={(v) => setNewSourceKind(v as Source["kind"])}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} placeholder="e.g. Hot leads sheet" className="h-9" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowNewSource(false)}>Cancel</Button>
                <Button size="sm" onClick={createSource}>Create</Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border divide-y divide-border">
            {(sources ?? []).length === 0 && !showNewSource && (
              <div className="p-4 text-xs text-muted-foreground text-center">
                No sources. This pipeline is manual.
              </div>
            )}
            {(sources ?? []).map((s) => {
              const Icon = SOURCE_KINDS.find((k) => k.value === s.kind)?.icon ?? Webhook;
              const url = webhookUrl(s);
              return (
                <div key={s.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.kind} · {s.status}
                        {s.last_ingest_at ? ` · last ${new Date(s.last_ingest_at).toLocaleString()}` : " · never used"}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => rotateToken(s)} title="Rotate token">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteSource(s)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input value={url} readOnly className="h-8 text-xs font-mono" />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copy(url, s.id)}>
                      {copied === s.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    POST <code>{`{ "leads": [{ "phone": "+44...", "name": "Jane", "external_id": "row-1", "payload": {...} }] }`}</code>
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Outreach */}
        <section className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold">Outreach</h3>
          <div className="rounded-lg border border-border p-3 space-y-3">
            <label className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Auto first-touch</div>
                <div className="text-[11px] text-muted-foreground">
                  Send the first message automatically when a lead is imported.
                </div>
              </div>
              <Switch checked={autoOutreach} onCheckedChange={setAutoOutreach} />
            </label>

            <div>
              <Label className="text-xs">First-touch template</Label>
              <Select value={templateId || "none"} onValueChange={(v) => setTemplateId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Default sender numbers</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(numbers ?? []).length === 0 && (
                  <span className="text-[11px] text-muted-foreground">No WhatsApp numbers in this workspace.</span>
                )}
                {(numbers ?? []).map((n) => {
                  const selected = senderIds.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSenderIds((cur) => selected ? cur.filter((id) => id !== n.id) : [...cur, n.id])}
                      className={`text-[11px] px-2 py-1 rounded-full border transition ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/50"}`}
                    >
                      {n.display_name || n.phone_number}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Window start</Label>
                <Input type="time" value={winStart} onChange={(e) => setWinStart(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Window end</Label>
                <Input type="time" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Daily cap</Label>
                <Input type="number" min={1} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="optional" className="h-9" />
              </div>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Label className="text-xs">Slack channel ID (override)</Label>
            <Input
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              placeholder="C0123456789"
              className="h-9 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Lead and reply events for this pipeline will route here. Leave empty to use the workspace default.
            </p>
          </div>
        </section>

        <div className="mt-6 flex justify-end gap-2 sticky bottom-0 bg-background pt-3 pb-1 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={saveOutreach}>Save changes</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
