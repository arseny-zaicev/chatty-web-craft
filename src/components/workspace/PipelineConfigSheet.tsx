import { useEffect, useMemo, useState } from "react";
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
import {
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Webhook,
  FileSpreadsheet,
  Upload,
  Code2,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
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

type SourceKind = "webhook" | "google_sheet" | "csv_upload" | "apps_script" | "api";
type Source = {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  kind: SourceKind;
  name: string;
  status: "active" | "paused" | "error";
  secret_token: string;
  last_ingest_at: string | null;
  last_error: string | null;
  config: Record<string, any> | null;
  created_at: string;
};

type Template = { id: string; name: string };
type WaNumber = { id: string; phone_number: string; display_name: string | null; status: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const SOURCE_KINDS: { value: SourceKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "google_sheet", label: "Google Sheet", icon: FileSpreadsheet },
  { value: "webhook", label: "Generic webhook", icon: Webhook },
  { value: "csv_upload", label: "CSV upload (soon)", icon: Upload },
  { value: "apps_script", label: "Apps Script (soon)", icon: Code2 },
];

function extractSpreadsheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return input.trim();
}

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
  const [newSourceKind, setNewSourceKind] = useState<SourceKind>("google_sheet");
  const [newSourceName, setNewSourceName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
        .select("id, phone_number, display_name, status")
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

  const { data: counters } = useQuery({
    queryKey: ["pipeline-lead-counters", pipeId],
    enabled: Boolean(pipeId && open),
    refetchInterval: 15_000,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
      const base = supabase.from("lead_imports").select("id", { count: "exact", head: true }).eq("pipeline_id", pipeId!);
      const [pending, queued, sentToday, failedToday, repliedToday] = await Promise.all([
        base.eq("status", "pending"),
        supabase.from("lead_imports").select("id", { count: "exact", head: true }).eq("pipeline_id", pipeId!).eq("status", "queued"),
        supabase.from("lead_imports").select("id", { count: "exact", head: true }).eq("pipeline_id", pipeId!).eq("status", "sent").gte("sent_at", todayStart.toISOString()),
        supabase.from("lead_imports").select("id", { count: "exact", head: true }).eq("pipeline_id", pipeId!).eq("status", "failed").gte("scheduled_at", todayStart.toISOString()),
        supabase.from("lead_imports").select("id", { count: "exact", head: true }).eq("pipeline_id", pipeId!).eq("status", "replied").gte("sent_at", todayStart.toISOString()),
      ]);
      return {
        pending: pending.count ?? 0,
        queued: queued.count ?? 0,
        sent: sentToday.count ?? 0,
        failed: failedToday.count ?? 0,
        replied: repliedToday.count ?? 0,
      };
    },
  });

  useEffect(() => {
    if (open && pipeline) hydrate(pipeline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipeline?.id]);

  // Readiness checklist for auto-outreach
  const activeNumbers = useMemo(
    () => (numbers ?? []).filter((n) => n.status === "active" && senderIds.includes(n.id)),
    [numbers, senderIds],
  );
  const readiness = useMemo(() => {
    const items = [
      { key: "template", label: "First-touch template selected", ok: Boolean(templateId) },
      { key: "sender", label: "At least one active sender number", ok: activeNumbers.length > 0 },
      { key: "window", label: "Sending window set", ok: Boolean(winStart && winEnd) },
      { key: "cap", label: "Daily cap set", ok: Boolean(dailyCap && parseInt(dailyCap, 10) > 0) },
      { key: "slack", label: "Slack channel for notifications", ok: Boolean(slackChannel.trim()) },
    ];
    const allOk = items.every((i) => i.ok);
    return { items, allOk };
  }, [templateId, activeNumbers, winStart, winEnd, dailyCap, slackChannel]);

  const saveOutreach = async () => {
    if (!pipeId) return;
    if (autoOutreach && !readiness.allOk) {
      toast.error("Complete the checklist before enabling auto-outreach");
      return;
    }
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
    if (newSourceKind === "csv_upload" || newSourceKind === "apps_script") {
      return toast.error("This source type is coming soon");
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
    const defaultConfig =
      newSourceKind === "google_sheet"
        ? { spreadsheet_id: "", sheet_name: "Sheet1", phone_column: "phone", name_column: "name", header_row: 1, last_synced_row: 1 }
        : {};
    const { data: created, error } = await supabase
      .from("source_connections")
      .insert({
        workspace_id: wsId,
        pipeline_id: pipeId,
        kind: newSourceKind,
        name: newSourceName.trim(),
        secret_token: token,
        config: defaultConfig,
        created_by: u.user.id,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Source connected");
    setShowNewSource(false);
    setNewSourceName("");
    if (newSourceKind === "google_sheet" && created?.id) setEditingId(created.id);
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

  const saveSourceConfig = async (s: Source, cfg: Record<string, any>) => {
    const { error } = await supabase.from("source_connections").update({ config: cfg }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Source updated");
    setEditingId(null);
    refetchSources();
  };

  const syncSource = async (s: Source) => {
    setSyncingId(s.id);
    try {
      const { data, error } = await supabase.functions.invoke("google-sheets-sync", {
        body: { source_connection_id: s.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        `Sync done · ${data?.accepted ?? 0} new · ${data?.rejected ?? 0} skipped`,
      );
      refetchSources();
      qc.invalidateQueries({ queryKey: ["pipeline-lead-counters", pipeId] });
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncingId(null);
    }
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

        {/* Live counters */}
        <section className="mt-4 grid grid-cols-5 gap-2">
          {[
            { label: "Pending", value: counters?.pending ?? 0, tone: "text-amber-600" },
            { label: "Queued", value: counters?.queued ?? 0, tone: "text-blue-600" },
            { label: "Sent today", value: counters?.sent ?? 0, tone: "text-emerald-600" },
            { label: "Replied", value: counters?.replied ?? 0, tone: "text-violet-600" },
            { label: "Failed", value: counters?.failed ?? 0, tone: "text-destructive" },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-card/40 px-2 py-1.5 text-center">
              <div className={`text-base font-semibold tabular-nums ${c.tone}`}>{c.value}</div>
              <div className="text-[10px] text-muted-foreground">{c.label}</div>
            </div>
          ))}
        </section>

        {/* Sources */}
        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lead sources</h3>
            <Button size="sm" variant="outline" onClick={() => setShowNewSource((v) => !v)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Connect source
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A pipeline is <strong>manual</strong> until you connect a source.
          </p>

          {showNewSource && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={newSourceKind} onValueChange={(v) => setNewSourceKind(v as SourceKind)}>
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
              const isSheet = s.kind === "google_sheet";
              const cfg = (s.config ?? {}) as Record<string, any>;
              const editing = editingId === s.id;
              const url = webhookUrl(s);
              const isReady =
                !isSheet || Boolean(cfg.spreadsheet_id && cfg.phone_column);
              return (
                <div key={s.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.kind} · {s.status}
                        {s.last_ingest_at ? ` · last ${new Date(s.last_ingest_at).toLocaleString()}` : " · never used"}
                        {isSheet && cfg.last_synced_row ? ` · row ${cfg.last_synced_row}` : ""}
                      </div>
                    </div>
                    {isSheet && (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!isReady || syncingId === s.id}
                        onClick={() => syncSource(s)}
                      >
                        {syncingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Sync now"}
                      </Button>
                    )}
                    {!isSheet && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => rotateToken(s)} title="Rotate token">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteSource(s)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {s.last_error && (
                    <div className="rounded bg-destructive/10 text-destructive text-[11px] px-2 py-1 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="font-mono">{s.last_error}</span>
                    </div>
                  )}

                  {isSheet ? (
                    <SheetSourceConfig
                      source={s}
                      editing={editing}
                      onEdit={() => setEditingId(s.id)}
                      onCancel={() => setEditingId(null)}
                      onSave={(cfg) => saveSourceConfig(s, cfg)}
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Input value={url} readOnly className="h-8 text-xs font-mono" />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copy(url, s.id)}>
                          {copied === s.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        POST <code>{`{ "leads": [{ "phone": "+44...", "name": "Jane" }] }`}</code>
                      </p>
                    </>
                  )}
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
              <Switch
                checked={autoOutreach}
                onCheckedChange={(v) => {
                  if (v && !readiness.allOk) {
                    toast.error("Complete the checklist below first");
                    return;
                  }
                  setAutoOutreach(v);
                }}
              />
            </label>

            {/* Readiness checklist */}
            <div className="rounded border border-border bg-muted/20 p-2 space-y-1">
              {readiness.items.map((it) => (
                <div key={it.key} className="flex items-center gap-2 text-[11px]">
                  {it.ok ? (
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                  ) : (
                    <X className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <span className={it.ok ? "text-foreground" : "text-muted-foreground"}>{it.label}</span>
                </div>
              ))}
            </div>

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
                  const inactive = n.status !== "active";
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSenderIds((cur) => selected ? cur.filter((id) => id !== n.id) : [...cur, n.id])}
                      className={`text-[11px] px-2 py-1 rounded-full border transition ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/50"} ${inactive ? "opacity-60" : ""}`}
                      title={inactive ? `Status: ${n.status}` : undefined}
                    >
                      {n.display_name || n.phone_number}{inactive ? ` · ${n.status}` : ""}
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
                <Input type="number" min={1} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="e.g. 80" className="h-9" />
              </div>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Label className="text-xs">Slack channel ID</Label>
            <Input
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              placeholder="C0123456789"
              className="h-9 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Lead and reply events for this pipeline route here.
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

function SheetSourceConfig({
  source,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  source: Source;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (cfg: Record<string, any>) => void;
}) {
  const cfg = (source.config ?? {}) as Record<string, any>;
  const [url, setUrl] = useState<string>(
    cfg.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${cfg.spreadsheet_id}/edit` : "",
  );
  const [sheetName, setSheetName] = useState<string>(cfg.sheet_name || "Sheet1");
  const [phoneCol, setPhoneCol] = useState<string>(cfg.phone_column || "phone");
  const [nameCol, setNameCol] = useState<string>(cfg.name_column || "name");
  const [headerRow, setHeaderRow] = useState<string>(String(cfg.header_row ?? 1));

  useEffect(() => {
    if (editing) {
      setUrl(cfg.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${cfg.spreadsheet_id}/edit` : "");
      setSheetName(cfg.sheet_name || "Sheet1");
      setPhoneCol(cfg.phone_column || "phone");
      setNameCol(cfg.name_column || "name");
      setHeaderRow(String(cfg.header_row ?? 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    const linked = Boolean(cfg.spreadsheet_id);
    return (
      <div className="text-[11px] text-muted-foreground space-y-1">
        {linked ? (
          <>
            <div className="font-mono truncate">
              {cfg.sheet_name || "Sheet1"} · phone: <strong>{cfg.phone_column}</strong>
              {cfg.name_column ? <> · name: <strong>{cfg.name_column}</strong></> : null}
            </div>
            <a
              href={`https://docs.google.com/spreadsheets/d/${cfg.spreadsheet_id}/edit`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Open sheet ↗
            </a>
            <Button size="sm" variant="ghost" className="h-6 px-2 ml-2" onClick={onEdit}>Edit</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onEdit}>Configure sheet</Button>
        )}
        <p className="text-[10px]">
          Share the sheet with the connected Google account (read access).
        </p>
      </div>
    );
  }

  const save = () => {
    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      toast.error("Paste a Google Sheet URL");
      return;
    }
    if (!phoneCol.trim()) {
      toast.error("Phone column is required");
      return;
    }
    onSave({
      ...cfg,
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName.trim() || "Sheet1",
      phone_column: phoneCol.trim(),
      name_column: nameCol.trim() || null,
      header_row: Math.max(1, parseInt(headerRow, 10) || 1),
      // preserve last_synced_row; default to header_row
      last_synced_row: cfg.last_synced_row ?? Math.max(1, parseInt(headerRow, 10) || 1),
    });
  };

  return (
    <div className="rounded border border-border bg-muted/20 p-2 space-y-2">
      <div>
        <Label className="text-[10px]">Sheet URL</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="h-8 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Tab name</Label>
          <Input value={sheetName} onChange={(e) => setSheetName(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-[10px]">Header row</Label>
          <Input type="number" min={1} value={headerRow} onChange={(e) => setHeaderRow(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-[10px]">Phone column</Label>
          <Input value={phoneCol} onChange={(e) => setPhoneCol(e.target.value)} placeholder="phone or B" className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-[10px]">Name column</Label>
          <Input value={nameCol} onChange={(e) => setNameCol(e.target.value)} placeholder="name or A" className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Column can be a header label (e.g. <code>phone</code>) or a letter (e.g. <code>B</code>).
      </p>
    </div>
  );
}
