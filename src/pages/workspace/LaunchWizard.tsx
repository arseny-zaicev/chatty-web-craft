import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Play, RefreshCw, Rocket, Users, FileText, Phone, Clock, Zap, Timer,
  Upload, MessagesSquare, Bookmark, Eye, AlertTriangle, Save, Trash2, Database,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  fetchLaunchEssentials, fetchConversationsLite,
  groupLogicalTemplates, parseCsv, detectColumns, applyMapping,
  geoFromPhone, buildCampaignName, renderTemplateBody, groupNumbersByCountry,
  loadMapping, saveMapping, listSavedAudiences, saveAudience, deleteSavedAudience,
  type Recipient, type LogicalTemplate, type CampaignType, type Template, type SavedAudience,
} from "@/lib/launchData";
import {
  audienceKeys, fetchBatches, fetchBatchStats, reserveRows, markRowsUsed, releaseRows,
  type AudienceBatch, type AudienceBatchStats, type AudienceRow,
} from "@/lib/audienceData";
import { fetchPipelines, pipelinesKey, createPipeline } from "@/lib/pipelines";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import type { WorkspaceContext } from "./WorkspaceLayout";

const CTA_PRESETS = ["Guide", "Call", "Free material", "Audit", "Case study", "Other"] as const;


const launchKeys = {
  essentials: (wid?: string) => ["launch", "essentials", wid ?? "all"] as const,
  chats: (wid?: string) => ["launch", "chats", wid ?? "all"] as const,
};

const TYPE_PRESETS: Record<CampaignType, { label: string; mode: "Blast" | "Utility"; delayMin: number; delayMax: number; perNumber: number; routing: boolean; templateCategory: "marketing" | "utility" }> = {
  marketing: { label: "Marketing Blast", mode: "Blast", delayMin: 0, delayMax: 0, perNumber: 1000, routing: false, templateCategory: "marketing" },
  utility: { label: "Utility Paced", mode: "Utility", delayMin: 60, delayMax: 120, perNumber: 200, routing: true, templateCategory: "utility" },
};

const UTILITY_MIN_DELAY = 60;

// Country code/name → IANA timezone for "recipient region clock"
const COUNTRY_TZ: Record<string, string> = {
  US: "America/New_York", USA: "America/New_York", "UNITED STATES": "America/New_York",
  CA: "America/Toronto", CANADA: "America/Toronto",
  UK: "Europe/London", GB: "Europe/London", "UNITED KINGDOM": "Europe/London",
  AE: "Asia/Dubai", UAE: "Asia/Dubai", "UNITED ARAB EMIRATES": "Asia/Dubai",
  SA: "Asia/Riyadh", "SAUDI ARABIA": "Asia/Riyadh",
  IN: "Asia/Kolkata", INDIA: "Asia/Kolkata",
  PK: "Asia/Karachi", PAKISTAN: "Asia/Karachi",
  RU: "Europe/Moscow", RUSSIA: "Europe/Moscow",
  DE: "Europe/Berlin", GERMANY: "Europe/Berlin",
  FR: "Europe/Paris", FRANCE: "Europe/Paris",
  ES: "Europe/Madrid", SPAIN: "Europe/Madrid",
  IT: "Europe/Rome", ITALY: "Europe/Rome",
  TR: "Europe/Istanbul", TURKEY: "Europe/Istanbul",
  AU: "Australia/Sydney", AUSTRALIA: "Australia/Sydney",
  BR: "America/Sao_Paulo", BRAZIL: "America/Sao_Paulo",
  MX: "America/Mexico_City", MEXICO: "America/Mexico_City",
  SG: "Asia/Singapore", SINGAPORE: "Asia/Singapore",
  HK: "Asia/Hong_Kong", "HONG KONG": "Asia/Hong_Kong",
  JP: "Asia/Tokyo", JAPAN: "Asia/Tokyo",
  CN: "Asia/Shanghai", CHINA: "Asia/Shanghai",
  ZA: "Africa/Johannesburg", "SOUTH AFRICA": "Africa/Johannesburg",
  NG: "Africa/Lagos", NIGERIA: "Africa/Lagos",
  EG: "Africa/Cairo", EGYPT: "Africa/Cairo",
};

export default function LaunchWizard() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: launchKeys.essentials(workspace?.id),
    queryFn: () => fetchLaunchEssentials(workspace?.id),
    enabled: Boolean(workspace),
    staleTime: 60_000,
  });

  const numbers = data?.numbers ?? [];
  const templates = data?.templates ?? [];
  const logicalTemplates = useMemo(() => groupLogicalTemplates(templates), [templates]);

  // ----- State -----
  const [type, setType] = useState<CampaignType>("marketing");
  const preset = TYPE_PRESETS[type];

  const { data: pipelines = [] } = useQuery({
    queryKey: pipelinesKey(workspace?.id),
    queryFn: () => fetchPipelines(workspace?.id),
    enabled: Boolean(workspace),
    staleTime: 60_000,
  });
  const [pipelineId, setPipelineId] = useState<string>("");
  useEffect(() => {
    if (!pipelineId && pipelines.length > 0) {
      setPipelineId(pipelines.find((p) => p.is_default)?.id ?? pipelines[0].id);
    }
  }, [pipelines, pipelineId]);
  const [showCreatePipeline, setShowCreatePipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineColor, setNewPipelineColor] = useState("#6366f1");
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const handleCreatePipeline = async () => {
    if (!workspace || !newPipelineName.trim()) return;
    setCreatingPipeline(true);
    try {
      const p = await createPipeline(workspace.id, { name: newPipelineName.trim(), color: newPipelineColor });
      await qc.invalidateQueries({ queryKey: pipelinesKey(workspace.id) });
      setPipelineId(p.id);
      setShowCreatePipeline(false);
      setNewPipelineName("");
      toast.success("Pipeline created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create pipeline");
    } finally {
      setCreatingPipeline(false);
    }
  };

  const [logicalKey, setLogicalKey] = useState<string>("");
  const [poolCountry, setPoolCountry] = useState<string>("");
  const [numberIds, setNumberIds] = useState<string[]>([]);
  const [csv, setCsv] = useState("phone,name\n");
  const [audienceSource, setAudienceSource] = useState<"paste" | "upload" | "chats" | "saved" | "database">("paste");

  // Database batch source state
  const [dbBatchId, setDbBatchId] = useState<string>("");
  const [dbAllUnused, setDbAllUnused] = useState(true);
  const [dbQty, setDbQty] = useState<string>("100");

  const [audience, setAudience] = useState("");
  const [audienceDirty, setAudienceDirty] = useState(false);
  const [ctaPreset, setCtaPreset] = useState<string>("Call");
  const [ctaCustom, setCtaCustom] = useState("");
  const cta = ctaPreset === "Other" ? ctaCustom : ctaPreset;
  const [campaignName, setCampaignName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);

  const [delayMin, setDelayMin] = useState(preset.delayMin);
  const [delayMax, setDelayMax] = useState(preset.delayMax);
  const [perNumberQuota, setPerNumberQuota] = useState(preset.perNumber);
  const [routing, setRouting] = useState(preset.routing);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // ----- Scheduling -----
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [scheduledDates, setScheduledDates] = useState<string[]>([]); // YYYY-MM-DD
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("20:00");
  const [respectTz, setRespectTz] = useState(true);
  const [schedulerKind, setSchedulerKind] = useState<"uniform" | "poisson">("poisson");


  // When type changes, reset defaults (unless user dirty-edited)
  const typeAppliedRef = useRef<CampaignType>("marketing");
  useEffect(() => {
    if (typeAppliedRef.current === type) return;
    typeAppliedRef.current = type;
    setDelayMin(preset.delayMin);
    setDelayMax(preset.delayMax);
    setPerNumberQuota(preset.perNumber);
    setRouting(preset.routing);
    // For Marketing default to single number
    if (!preset.routing && numberIds.length > 1) setNumberIds(numberIds.slice(0, 1));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter logical templates by type category
  const visibleLogical = useMemo(
    () => logicalTemplates.filter((t) => t.category === preset.templateCategory),
    [logicalTemplates, preset.templateCategory],
  );

  const activeLogical: LogicalTemplate | undefined = visibleLogical.find((t) => t.key === logicalKey);

  // Auto-pick first logical when none selected or current invalid for type
  useEffect(() => {
    if (!activeLogical && visibleLogical.length > 0) setLogicalKey(visibleLogical[0].key);
    if (logicalKey && !visibleLogical.find((t) => t.key === logicalKey)) {
      setLogicalKey(visibleLogical[0]?.key ?? "");
    }
  }, [visibleLogical, logicalKey, activeLogical]);

  // Load saved mapping for workspace+logical
  useEffect(() => {
    if (!workspace || !logicalKey) return;
    const saved = loadMapping(workspace.id, logicalKey);
    setMapping(saved);
  }, [workspace, logicalKey]);

  // ----- Database batches (internal-only audience source) -----
  const dbBatchesQ = useQuery({
    queryKey: audienceKeys.batches(workspace?.id),
    queryFn: () => fetchBatches(workspace!.id),
    enabled: Boolean(workspace) && audienceSource === "database",
  });
  const dbStatsQ = useQuery({
    queryKey: audienceKeys.stats(workspace?.id),
    queryFn: () => fetchBatchStats(workspace!.id),
    enabled: Boolean(workspace) && audienceSource === "database",
  });
  const dbBatch: AudienceBatch | undefined = (dbBatchesQ.data ?? []).find((b) => b.id === dbBatchId);
  const dbStats: AudienceBatchStats | undefined = (dbStatsQ.data ?? []).find((s) => s.batch_id === dbBatchId);
  const dbAvailable = dbStats?.unused ?? 0;
  const dbTargetCount = audienceSource === "database"
    ? (dbAllUnused ? dbAvailable : Math.min(Math.max(0, Number(dbQty) || 0), dbAvailable))
    : 0;

  // Auto-pick first batch when entering db mode
  useEffect(() => {
    if (audienceSource !== "database") return;
    if (!dbBatchId && (dbBatchesQ.data?.length ?? 0) > 0) {
      setDbBatchId(dbBatchesQ.data![0].id);
    }
  }, [audienceSource, dbBatchesQ.data, dbBatchId]);

  // Auto-fill audience name from selected DB batch (unless user typed their own)
  useEffect(() => {
    if (audienceSource !== "database") return;
    if (audienceDirty) return;
    const n = (dbBatch?.name ?? "").trim();
    if (n && n !== audience) setAudience(n);
  }, [audienceSource, dbBatch?.name, audienceDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Audience parsing & mapping -----
  const csvRecipients = useMemo(() => parseCsv(csv), [csv]);
  const csvColumns = useMemo(() => detectColumns(csvRecipients), [csvRecipients]);
  // When the database source is active, columns come from the batch's variable schema.
  // Recipient count is virtual until we actually reserve rows on launch.
  const recipients = audienceSource === "database"
    ? Array.from({ length: dbTargetCount }, () => ({ phone: "", variables: {} } as Recipient))
    : csvRecipients;
  const columns = audienceSource === "database" ? (dbBatch?.variable_schema ?? []) : csvColumns;
  const variableNames = activeLogical?.variables ?? [];

  // Auto-map variables to columns. Fills dropdowns automatically; user can still override.
  // Priority for each variable v (at position i):
  //   1) exact lowercase match (e.g. "first_name" -> "First_Name")
  //   2) match against "var_<v>" or strip "var_" prefix and match
  //   3) if v is numeric, use column "var_<v>" if present
  //   4) positional fallback: "var_<i+1>" if present
  useEffect(() => {
    if (!variableNames.length || !columns.length) return;
    setMapping((prev) => {
      const next = { ...prev };
      let changed = false;
      variableNames.forEach((v, i) => {
        if (next[v]) return;
        const lower = v.toLowerCase();
        const stripped = lower.replace(/^var_/, "");
        const tryCols = [lower, `var_${stripped}`, stripped, `var_${i + 1}`];
        for (const candidate of tryCols) {
          const found = columns.find((c) => c.toLowerCase() === candidate);
          if (found) { next[v] = found; changed = true; break; }
        }
      });
      return changed ? next : prev;
    });
  }, [variableNames, columns]);

  const mappedRecipients = useMemo(
    () => applyMapping(recipients, mapping, variableNames),
    [recipients, mapping, variableNames],
  );

  // ----- Sender pools (numbers grouped by country) -----
  const pools = useMemo(() => groupNumbersByCountry(numbers), [numbers]);

  // Default pool to the largest available
  useEffect(() => {
    if (!poolCountry && pools.length > 0) setPoolCountry(pools[0].country);
    if (poolCountry && !pools.find((p) => p.country === poolCountry)) {
      setPoolCountry(pools[0]?.country ?? "");
    }
  }, [pools, poolCountry]);

  const activePool = pools.find((p) => p.country === poolCountry);
  const poolNumbers = activePool?.numbers ?? [];

  // "Ready" = number has an approved variant for the chosen logical template (if any)
  const readyInPool = useMemo(() => {
    if (!activeLogical) return poolNumbers;
    return poolNumbers.filter((n) => activeLogical.variantByNumber.has(n.id));
  }, [poolNumbers, activeLogical]);

  // Auto-fill numberIds based on mode + pool
  useEffect(() => {
    if (poolNumbers.length === 0) return;
    if (type === "utility") {
      // Utility: use ALL ready numbers in pool
      const ids = readyInPool.map((n) => n.id);
      setNumberIds(ids.length ? ids : [poolNumbers[0].id]);
    } else {
      // Marketing: single sender — keep current if still in pool & ready, else first ready/first
      setNumberIds((prev) => {
        const stillValid = prev.find((id) => poolNumbers.some((n) => n.id === id));
        if (stillValid) return [stillValid];
        const firstReady = readyInPool[0] ?? poolNumbers[0];
        return [firstReady.id];
      });
    }
  }, [type, poolCountry, readyInPool.length, poolNumbers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeNumbers = numbers.filter((n) => numberIds.includes(n.id));

  // ----- Logical template resolution per number -----
  const resolution = useMemo(() => {
    if (!activeLogical) return { ok: [] as Array<{ numberId: string; template: Template }>, missing: [] as string[] };
    const ok: Array<{ numberId: string; template: Template }> = [];
    const missing: string[] = [];
    for (const n of activeNumbers) {
      const variant = activeLogical.variantByNumber.get(n.id);
      if (variant) ok.push({ numberId: n.id, template: variant });
      else missing.push(n.id);
    }
    return { ok, missing };
  }, [activeLogical, activeNumbers]);

  // ----- Auto name (date | country | audience | template | cta) -----
  useEffect(() => {
    if (nameDirty) return;
    setCampaignName(buildCampaignName({
      geo: poolCountry || "--",
      audience,
      templateLabel: activeLogical?.label,
      cta,
    }));
  }, [poolCountry, audience, activeLogical, cta, nameDirty]);

  // ----- Lazy chats -----
  const chatsQuery = useQuery({
    queryKey: launchKeys.chats(workspace?.id),
    queryFn: () => fetchConversationsLite(workspace?.id, 500),
    enabled: Boolean(workspace) && audienceSource === "chats",
    staleTime: 30_000,
  });

  const useCurrentChats = () => {
    const list = chatsQuery.data ?? [];
    setCsv(["phone,name,conversation_id", ...list.map((c) => `${c.contact_phone},${c.contact_name ?? ""},${c.id}`)].join("\n"));
  };

  // ----- Saved audiences -----
  const [savedList, setSavedList] = useState<SavedAudience[]>([]);
  useEffect(() => { if (workspace) setSavedList(listSavedAudiences(workspace.id)); }, [workspace]);
  const [saveAudName, setSaveAudName] = useState("");

  // ----- Toggles -----
  const toggleNumber = (id: string) => {
    setNumberIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (!routing) return [id]; // single-number mode
      return [...prev, id];
    });
  };

  // ----- ETA -----
  const fmtDur = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h ${mm}m` : `${h}h`;
  };
  const eta = useMemo(() => {
    const perNumber = activeNumbers.length > 0 ? Math.ceil(recipients.length / activeNumbers.length) : recipients.length;
    const avgSec = Math.round(perNumber * (delayMin + delayMax) / 2);
    const maxSec = Math.round(perNumber * delayMax);
    if (!perNumber) return "-";
    return `${fmtDur(avgSec)} avg · up to ${fmtDur(maxSec)}`;
  }, [recipients.length, activeNumbers.length, delayMin, delayMax]);

  // ----- Recipient region clock & realistic pacing -----
  const recipientTz = useMemo(() => COUNTRY_TZ[poolCountry?.toUpperCase() ?? ""] ?? null, [poolCountry]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const recipientNow = useMemo(() => {
    if (!recipientTz) return null;
    try {
      const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: recipientTz, hour: "2-digit", minute: "2-digit", hour12: false });
      return fmt.format(new Date(nowTick));
    } catch { return null; }
  }, [recipientTz, nowTick]);
  const inWindow = useMemo(() => {
    if (!recipientNow || !windowStart || !windowEnd) return null;
    return recipientNow >= windowStart && recipientNow <= windowEnd;
  }, [recipientNow, windowStart, windowEnd]);

  // Per-day capacity model honors per_number_quota cap.
  const dayPlan = useMemo(() => {
    const numbers = Math.max(1, activeNumbers.length);
    const total = recipients.length;
    const dailyCap = Math.max(1, numbers * Math.max(1, perNumberQuota));
    const daysSelected = scheduleMode === "scheduled" ? Math.max(1, scheduledDates.length || 1) : 1;
    const idealPerDay = Math.ceil(total / daysSelected);
    const effectivePerDay = Math.min(idealPerDay, dailyCap);
    const daysNeeded = Math.max(1, Math.ceil(total / dailyCap));
    const capExceeded = idealPerDay > dailyCap;
    return { numbers, total, dailyCap, daysSelected, idealPerDay, effectivePerDay, daysNeeded, capExceeded };
  }, [activeNumbers.length, recipients.length, perNumberQuota, scheduleMode, scheduledDates.length]);

  // Realistic per-message gap when window mode is active (based on today's effective load)
  const pacing = useMemo(() => {
    const perNumber = Math.max(1, Math.ceil(dayPlan.effectivePerDay / dayPlan.numbers));
    if (!windowStart || !windowEnd) return null;
    const [sh, sm] = windowStart.split(":").map(Number);
    const [eh, em] = windowEnd.split(":").map(Number);
    const windowSec = Math.max(60, (eh * 3600 + em * 60) - (sh * 3600 + sm * 60));
    const avgGapSec = Math.floor(windowSec / Math.max(1, perNumber));
    return { perNumber, windowSec, avgGapSec };
  }, [dayPlan.effectivePerDay, dayPlan.numbers, windowStart, windowEnd]);

  // Today's selected status (Pick-days mode)
  const todayInfo = useMemo(() => {
    if (scheduleMode !== "scheduled") return { todayInList: true, firstDate: null as string | null, nextDate: null as string | null };
    if (!recipientTz) return { todayInList: true, firstDate: scheduledDates[0] ?? null, nextDate: null };
    let todayLocal = "";
    try {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: recipientTz, year: "numeric", month: "2-digit", day: "2-digit" });
      todayLocal = fmt.format(new Date(nowTick));
    } catch { todayLocal = ""; }
    const sorted = [...scheduledDates].sort();
    const todayInList = sorted.includes(todayLocal);
    const firstDate = sorted[0] ?? null;
    const nextDate = sorted.find((d) => d > todayLocal) ?? null;
    return { todayInList, firstDate, nextDate, todayLocal };
  }, [scheduleMode, scheduledDates, recipientTz, nowTick]);

  // Feasibility: today's effective load vs the remaining window in recipient TZ.
  const feasibility = useMemo(() => {
    if (!pacing || !recipientNow) return null;
    const [nh, nm] = recipientNow.split(":").map(Number);
    const [eh, em] = windowEnd.split(":").map(Number);
    const [sh, sm] = windowStart.split(":").map(Number);
    const nowSec = nh * 3600 + nm * 60;
    const endSec = eh * 3600 + em * 60;
    const startSec = sh * 3600 + sm * 60;
    const remainingSec = nowSec < startSec
      ? pacing.windowSec
      : nowSec >= endSec ? 0 : Math.max(0, endSec - nowSec);
    const gapSec = scheduleMode === "now"
      ? Math.max(1, (delayMin + delayMax) / 2)
      : Math.max(1, pacing.avgGapSec);
    const perNumberFits = Math.floor(remainingSec / gapSec);
    const todayQueued = scheduleMode === "scheduled"
      ? (todayInfo.todayInList ? dayPlan.effectivePerDay : 0)
      : recipients.length;
    const fitsToday = Math.min(todayQueued, perNumberFits * dayPlan.numbers);
    const overflow = Math.max(0, todayQueued - fitsToday);
    return { remainingSec, fitsToday, overflow, totalQueued: todayQueued, gapSec };
  }, [pacing, recipientNow, scheduleMode, windowEnd, windowStart, dayPlan, recipients.length, delayMin, delayMax, todayInfo]);




  // ----- Sample DB rows for live preview (database source) -----
  const sampleDbRowsQ = useQuery({
    queryKey: ["launch", "preview-rows", dbBatchId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("audience_rows") as any)
        .select("phone, payload, derived_payload")
        .eq("batch_id", dbBatchId)
        .eq("validation_status", "valid")
        .eq("usage_status", "unused")
        .limit(3);
      if (error) throw error;
      return (data ?? []) as Array<{ phone: string; payload: Record<string, string>; derived_payload: Record<string, string> }>;
    },
    enabled: Boolean(dbBatchId) && audienceSource === "database",
    staleTime: 30_000,
  });

  // ----- Preview samples -----
  const previewSamples = useMemo(() => {
    if (!activeLogical) return [] as Array<{ phone: string; body: string; missing: string[] }>;
    // Database source: render from real DB rows using derived_payload (preferred) + payload fallback.
    if (audienceSource === "database") {
      const rows = sampleDbRowsQ.data ?? [];
      return rows.map((r) => {
        const vals: Record<string, string> = {};
        for (const v of variableNames) {
          const src = mapping[v];
          let raw = "";
          if (src && src.startsWith("__static:")) raw = src.slice("__static:".length);
          else if (src) raw = String(r.payload?.[src] ?? r.derived_payload?.[src] ?? "");
          // Fallback: if no mapping, try derived_payload["var_<v>"] (handles {{1}} -> var_1 etc.)
          if (!raw) raw = String(r.derived_payload?.[`var_${v}`] ?? "");
          vals[v] = raw;
        }
        const missing = variableNames.filter((v) => !String(vals[v] ?? "").trim());
        return {
          phone: r.phone,
          body: renderTemplateBody(activeLogical.body, variableNames, vals),
          missing,
        };
      });
    }
    return mappedRecipients.slice(0, 3).map((r) => {
      const vals = r.variables ?? {};
      const missing = variableNames.filter((v) => !String(vals[v] ?? "").trim());
      return {
        phone: r.phone,
        body: renderTemplateBody(activeLogical.body, variableNames, vals),
        missing,
      };
    });
  }, [mappedRecipients, activeLogical, variableNames, audienceSource, sampleDbRowsQ.data, mapping]);

  // ----- Launch -----
  const launch = useMutation({
    mutationFn: async () => {
      if (!campaignName.trim()) throw new Error("Name the campaign");
      if (!activeLogical) throw new Error("Pick a logical template");
      if (numberIds.length === 0) throw new Error("Select at least one sending number");
      if (resolution.missing.length > 0) throw new Error("Some numbers don't have an approved variant of this template");

      // ---- Build the recipient list (and reserve DB rows if database mode) ----
      let workingRecipients: Recipient[] = mappedRecipients;
      let reservedRowIds: string[] = [];
      let rowIdByPhone = new Map<string, string>();

      if (audienceSource === "database") {
        if (!dbBatch) throw new Error("Pick a database batch");
        if (dbTargetCount <= 0) throw new Error("No unused rows available");
        const reserved: AudienceRow[] = await reserveRows(
          dbBatch.id,
          dbAllUnused ? null : dbTargetCount,
        );
        if (reserved.length === 0) throw new Error("Could not reserve any rows (already used?)");
        reservedRowIds = reserved.map((r) => r.id);
        // Build mapped recipients from row.payload + derived_payload using current mapping
        const built: Recipient[] = reserved.map((r) => {
          const vars: Record<string, string> = {};
          const dp: Record<string, string> = (r as any).derived_payload ?? {};
          for (const v of variableNames) {
            const src = mapping[v];
            let raw = "";
            if (src && src.startsWith("__static:")) raw = src.slice("__static:".length);
            else if (src) raw = String((r.payload as any)?.[src] ?? dp?.[src] ?? "");
            if (!raw) raw = String(dp?.[`var_${v}`] ?? "");
            vars[v] = raw;
          }
          rowIdByPhone.set(r.phone, r.id);
          return { phone: r.phone, variables: vars };
        });
        workingRecipients = built;
      } else if (workingRecipients.length === 0) {
        throw new Error("Add recipients");
      }

      // Distribute recipients across numbers
      const buckets = new Map<string, Recipient[]>();
      const targets = resolution.ok;
      if (targets.length === 1) {
        buckets.set(targets[0].numberId, workingRecipients);
      } else {
        targets.forEach((t) => buckets.set(t.numberId, []));
        workingRecipients.forEach((r, i) => {
          const t = targets[i % targets.length];
          buckets.get(t.numberId)!.push(r);
        });
      }

      const results: Array<{ ok: boolean; numberId: string; res?: any; error?: string; rowIds?: string[] }> = [];
      try {
        for (const t of targets) {
          const list = buckets.get(t.numberId) ?? [];
          if (list.length === 0) continue;
          const bucketRowIds = audienceSource === "database"
            ? list.map((r) => rowIdByPhone.get(r.phone)).filter((x): x is string => !!x)
            : [];
          const subname = targets.length > 1
            ? `${campaignName} :: ${(numbers.find((n) => n.id === t.numberId)?.label ?? `+${numbers.find((n) => n.id === t.numberId)?.phone_number}`)}`
            : campaignName;
          const bucketIndex = targets.indexOf(t);
          const { data: res, error } = await supabase.functions.invoke("campaigns", {
            body: {
              action: "launch",
              name: subname,
              whatsapp_number_id: t.numberId,
              template_id: t.template.id,
              delay_min_seconds: delayMin,
              delay_max_seconds: delayMax,
              recipients: list,
              // Scheduling
              scheduler_kind: schedulerKind,
              scheduled_dates: scheduleMode === "scheduled" ? scheduledDates : [],
              window_start: windowStart,
              window_end: windowEnd,
              respect_recipient_tz: respectTz,
              bucket_index: bucketIndex,
              bucket_count: targets.length,
              pipeline_id: pipelineId || null,
            },
          });
          if (error) results.push({ ok: false, numberId: t.numberId, error: error.message, rowIds: bucketRowIds });
          else if ((res as any)?.error) results.push({ ok: false, numberId: t.numberId, error: (res as any).error, rowIds: bucketRowIds });
          else results.push({ ok: true, numberId: t.numberId, res, rowIds: bucketRowIds });
        }
      } catch (e) {
        // Outer failure -> release everything still reserved
        if (reservedRowIds.length > 0) {
          try { await releaseRows(reservedRowIds); } catch { /* swallow */ }
        }
        throw e;
      }

      // Mark used / release per bucket result
      if (audienceSource === "database") {
        for (const r of results) {
          const ids = r.rowIds ?? [];
          if (ids.length === 0) continue;
          if (r.ok) {
            const cid = (r.res as any)?.campaign_id;
            if (cid) {
              try { await markRowsUsed(ids, cid); } catch { /* ignore */ }
            }
          } else {
            try { await releaseRows(ids); } catch { /* ignore */ }
          }
        }
      }

      // Persist mapping for next time
      if (workspace && activeLogical) saveMapping(workspace.id, activeLogical.key, mapping);
      return results;
    },
    onSuccess: async (results) => {
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      if (failed === 0) toast.success(`Launched ${ok} campaign${ok === 1 ? "" : "s"}`);
      else toast.error(`Launched ${ok}, failed ${failed}: ${results.find((r) => !r.ok)?.error ?? ""}`);
      qc.invalidateQueries({ queryKey: ["crm", "campaigns"] });
      qc.invalidateQueries({ queryKey: audienceKeys.stats(workspace?.id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Launch failed"),
  });

  const sync = useMutation({
    mutationFn: async () => {
      if (numbers.length === 0) throw new Error("Add a number first");
      // Bulk: sync templates for every active number in this workspace.
      // Per-number failures are isolated and reported by the edge function.
      const { data: res, error } = await supabase.functions.invoke("campaigns", {
        body: { action: "sync_templates_all", workspace_id: workspace?.id },
      });
      if (error) throw error;
      return res as { totals: { numbers: number; fetched: number; upserted: number; failed: number }; results: Array<{ whatsapp_number_id: string; ok?: boolean; error?: string }> };
    },
    onSuccess: async (r) => {
      const t = r?.totals ?? { numbers: 0, fetched: 0, upserted: 0, failed: 0 };
      if (t.failed > 0) {
        toast.warning(`Synced ${t.upserted}/${t.fetched} across ${t.numbers - t.failed}/${t.numbers} numbers (${t.failed} failed)`);
      } else {
        toast.success(`Synced ${t.upserted}/${t.fetched} across ${t.numbers} number${t.numbers === 1 ? "" : "s"}`);
      }
      await qc.invalidateQueries({ queryKey: launchKeys.essentials(workspace?.id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 grid lg:grid-cols-[1fr_320px] gap-4 max-w-[1400px] mx-auto pb-32">
        {/* MAIN COLUMN */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-primary" />
              <h2 className="font-display text-xl">Launch campaign</h2>
            </div>
            {workspace && (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/ws/${workspace.slug}/campaigns`}><ArrowLeft className="w-4 h-4 mr-1" />Back to campaigns</Link>
              </Button>
            )}
          </div>

          {/* Step 1: Campaign type */}
          <Step n={1} icon={Zap} title="Campaign type">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(TYPE_PRESETS) as CampaignType[]).map((k) => {
                const p = TYPE_PRESETS[k];
                const active = type === k;
                return (
                  <button
                    key={k}
                    onClick={() => setType(k)}
                    className={`text-left rounded-md border p-3 transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {k === "marketing" ? <Zap className="w-4 h-4 text-primary" /> : <Timer className="w-4 h-4 text-amber-500" />}
                      {p.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {k === "marketing"
                        ? "0/0 delay, single number, send as fast as possible."
                        : "Randomized 60-120s delay per number, distribute across numbers."}
                    </div>
                  </button>
                );
              })}
            </div>
          </Step>

          {/* Step 2: Logical template */}
          <Step n={2} icon={FileText} title="Template" right={
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />Sync Gupshup
            </Button>
          }>
            {visibleLogical.length === 0 ? (
              <div className="text-sm text-muted-foreground rounded-md border border-dashed border-border p-3">
                No approved {preset.templateCategory} templates. Sync from Gupshup or create one.
              </div>
            ) : (
              <>
                <Select value={logicalKey} onValueChange={setLogicalKey}>
                  <SelectTrigger><SelectValue placeholder="Pick a logical template" /></SelectTrigger>
                  <SelectContent>
                    {visibleLogical.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        <span className="inline-flex items-center gap-2">
                          <span>{t.label}</span>
                          <span className="text-xs text-muted-foreground">({t.variants.length} variant{t.variants.length === 1 ? "" : "s"})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeLogical && (() => {
                  const poolReady = poolNumbers.filter((n) => activeLogical.variantByNumber.has(n.id)).length;
                  const poolMissing = poolNumbers.length - poolReady;
                  const orphanVariants = activeLogical.variants.filter(
                    (v) => !v.whatsapp_number_id || !numbers.find((n) => n.id === v.whatsapp_number_id),
                  );
                  return (
                    <div className="mt-3 space-y-2">
                      {/* Coverage summary */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">
                          {poolReady}/{poolNumbers.length} numbers in pool ready
                        </Badge>
                        {poolMissing > 0 && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                            {poolMissing} missing variant
                          </Badge>
                        )}
                        {activeLogical.variables.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {activeLogical.variables.length} variable{activeLogical.variables.length === 1 ? "" : "s"}: {activeLogical.variables.map((v) => `{${v}}`).join(" ")}
                          </Badge>
                        )}
                        {orphanVariants.length > 0 && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                            {orphanVariants.length} orphan variant (no number)
                          </Badge>
                        )}
                      </div>

                      {/* Per-number variant table */}
                      <div className="rounded-md border border-border overflow-hidden">
                        <div className="grid grid-cols-[1fr_1.4fr_auto_auto] gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                          <div>Number</div>
                          <div>Template variant</div>
                          <div>Lang</div>
                          <div>Status</div>
                        </div>
                        <div className="divide-y divide-border">
                          {poolNumbers.map((n) => {
                            const variant = activeLogical.variantByNumber.get(n.id);
                            return (
                              <div key={n.id} className="grid grid-cols-[1fr_1.4fr_auto_auto] gap-2 px-2 py-1.5 text-xs items-center">
                                <div className="truncate">{n.label ?? `+${n.phone_number}`}</div>
                                <div className="truncate font-mono text-[11px]">
                                  {variant?.name ?? <span className="text-amber-600">- missing -</span>}
                                </div>
                                <div className="text-muted-foreground text-[11px]">{variant?.language ?? "-"}</div>
                                <div>
                                  {variant ? (
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${variant.status === "approved" ? "border-emerald-500/30 text-emerald-600" : "border-amber-500/30 text-amber-600"}`}
                                    >
                                      {variant.status}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">no variant</Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Template body preview */}
                      {activeLogical.body ? (
                        <div className="rounded-md border border-border bg-muted/30 p-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Template body</div>
                          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{activeLogical.body}</pre>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-600 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" /> No body synced for this template - re-sync from Gupshup.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </Step>

          {/* Step 3: Sender pool */}
          <Step n={3} icon={Phone} title="Sender pool">
            {pools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active numbers in this workspace.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Country pool</span>
                  <Select value={poolCountry} onValueChange={setPoolCountry}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {pools.map((p) => (
                        <SelectItem key={p.country} value={p.country}>
                          {p.country} · {p.numbers.length} number{p.numbers.length === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-[11px]">
                    {readyInPool.length} ready of {poolNumbers.length}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] border-primary/30 text-primary">
                    {type === "utility" ? "Utility · distribute across pool" : "Marketing · single sender"}
                  </Badge>
                </div>

                <div className="grid sm:grid-cols-2 gap-2 mt-3">
                  {poolNumbers.map((n) => {
                    const selected = numberIds.includes(n.id);
                    const hasVariant = activeLogical?.variantByNumber.has(n.id);
                    const inputType = type === "utility" ? "checkbox" : "radio";
                    return (
                      <label
                        key={n.id}
                        className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm ${selected ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <input
                          type={inputType}
                          name="number-pick"
                          checked={selected}
                          onChange={() => toggleNumber(n.id)}
                        />
                        <span className="truncate flex-1">{n.label ?? `+${n.phone_number}`}</span>
                        {activeLogical && (
                          hasVariant
                            ? <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">ready</Badge>
                            : <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">no variant</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {resolution.missing.length > 0 && (
              <div className="mt-2 text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {resolution.missing.length} selected number(s) lack an approved variant of this template. Launch is blocked until resolved.
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-3">
              <Field label="Quota / number"><Input type="number" min={1} value={perNumberQuota} onChange={(e) => setPerNumberQuota(Number(e.target.value))} /></Field>
              <Field label={`Min delay (s)${type === "utility" ? " · ≥60" : ""}`}>
                <Input type="number" min={type === "utility" ? UTILITY_MIN_DELAY : 0} value={delayMin}
                  disabled={scheduleMode === "scheduled"}
                  onChange={(e) => setDelayMin(Math.max(type === "utility" ? UTILITY_MIN_DELAY : 0, Number(e.target.value)))} />
              </Field>
              <Field label="Max delay (s)">
                <Input type="number" min={delayMin} value={delayMax}
                  disabled={scheduleMode === "scheduled"}
                  onChange={(e) => setDelayMax(Math.max(delayMin, Number(e.target.value)))} />
              </Field>
            </div>
            {scheduleMode === "scheduled" && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Min/Max delay is ignored when a window is set - gaps are computed from the window length below.
              </div>
            )}

            {/* Schedule */}
            <div className="mt-4 rounded-md border border-border/60 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</div>
                <Tabs value={scheduleMode} onValueChange={(v) => setScheduleMode(v as any)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="now" className="text-xs px-2 py-0.5">Send now</TabsTrigger>
                    <TabsTrigger value="scheduled" className="text-xs px-2 py-0.5">Pick days</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {scheduleMode === "scheduled" && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Launch days (recipients are split evenly across selected days)</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input type="date" className="w-auto" min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && !scheduledDates.includes(v)) setScheduledDates([...scheduledDates, v].sort());
                        e.target.value = "";
                      }} />
                    {scheduledDates.map((d) => (
                      <Badge key={d} variant="secondary" className="gap-1 cursor-pointer" onClick={() => setScheduledDates(scheduledDates.filter((x) => x !== d))}>
                        {d} ✕
                      </Badge>
                    ))}
                    {scheduledDates.length === 0 && <span className="text-xs text-muted-foreground">Add at least one date</span>}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Field label="Window from"><Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} /></Field>
                <Field label="Window to"><Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} /></Field>
                <Field label="Scheduler">
                  <Select value={schedulerKind} onValueChange={(v) => setSchedulerKind(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="poisson">Poisson (organic, jittered)</SelectItem>
                      <SelectItem value="uniform">Uniform (fixed delays)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Time zone basis">
                  <Select value={respectTz ? "yes" : "no"} onValueChange={(v) => setRespectTz(v === "yes")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Recipient local (per phone prefix)</SelectItem>
                      <SelectItem value="no">My time zone (browser)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* Recipient region clock */}
              {recipientTz && recipientNow && (
                <div className={`text-[11px] flex items-center gap-2 px-2 py-1.5 rounded-md border ${inWindow ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-500"}`}>
                  <span className="font-mono font-semibold">{recipientNow}</span>
                  <span className="opacity-70">in {poolCountry} ({recipientTz.split("/")[1].replace("_", " ")})</span>
                  <span className="ml-auto">{inWindow ? `✓ inside ${windowStart}-${windowEnd}` : `outside ${windowStart}-${windowEnd}`}</span>
                </div>
              )}

              <div className="text-[11px] text-muted-foreground space-y-1">
                {scheduleMode === "now" ? (() => {
                  const perNumber = pacing?.perNumber || 1;
                  const avgSec = perNumber * (delayMin + delayMax) / 2;
                  const maxSec = perNumber * delayMax;
                  return (
                    <div>
                      Starts immediately. {schedulerKind === "poisson" ? "Poisson (organic, jittered)" : "Uniform fixed"} gaps of <b>{delayMin}-{delayMax}s</b> between sends per number.
                      Per number: <b>{perNumber} msgs</b> → ≈ <b>{fmtDur(Math.round(avgSec))} avg</b>, up to <b>{fmtDur(Math.round(maxSec))} max</b>. So yes - 50/number at 60-120s comfortably fits within an hour or two; numbers send in parallel so total wall-clock = same as one number.
                    </div>
                  );
                })() : pacing && pacing.perNumber > 1 ? (
                  <div>
                    {scheduledDates.length || 0} day(s) × {windowStart}-{windowEnd} {respectTz ? "in each recipient's local time" : "in your time zone"}. <b>{pacing.perNumber} msgs/number ÷ {(pacing.windowSec / 3600).toFixed(1)}h ≈ 1 msg every {pacing.avgGapSec >= 60 ? `${Math.round(pacing.avgGapSec / 60)} min` : `${pacing.avgGapSec}s`}</b> on average (jittered ±20% for organic feel). The 60-120s "Min/Max delay" field does not apply here - gaps are derived from the window so messages spread across the full session.
                  </div>
                ) : (
                  <div>{scheduledDates.length || 0} day(s) × {windowStart}-{windowEnd} {respectTz ? "in recipient's local time" : "in your time zone"}.</div>
                )}
                {feasibility && feasibility.totalQueued > 0 && (
                  <div className={`mt-1 px-2 py-1.5 rounded-md border text-[11px] ${feasibility.overflow > 0 ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-500" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"}`}>
                    <b>Today fits ≈ {feasibility.fitsToday.toLocaleString()} of {feasibility.totalQueued.toLocaleString()}</b> msgs before {windowEnd} ({recipientNow} now in {poolCountry}).
                    {feasibility.overflow > 0
                      ? ` ${feasibility.overflow.toLocaleString()} will auto-roll to tomorrow's window (${windowStart}-${windowEnd}) and queue up there with status "scheduled". No action needed - they're saved.`
                      : " Everything fits today."}
                    <div className="opacity-80 mt-0.5">Campaign stays <b>running</b> across days. <b>sent_count</b> grows live; leftovers keep <b>scheduled_at</b> = next available slot. You'll see "X / Y sent · Z scheduled for tomorrow" on the campaign page.</div>
                  </div>
                )}
              </div>
            </div>
          </Step>


          {/* Step 4: Audience */}
          <Step n={4} icon={Users} title="Audience">
            <Tabs value={audienceSource} onValueChange={(v) => setAudienceSource(v as any)}>
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="paste"><FileText className="w-3.5 h-3.5 mr-1" />Paste</TabsTrigger>
                <TabsTrigger value="upload"><Upload className="w-3.5 h-3.5 mr-1" />Upload</TabsTrigger>
                <TabsTrigger value="chats"><MessagesSquare className="w-3.5 h-3.5 mr-1" />Chats</TabsTrigger>
                <TabsTrigger value="saved"><Bookmark className="w-3.5 h-3.5 mr-1" />Saved</TabsTrigger>
                <TabsTrigger value="database"><Database className="w-3.5 h-3.5 mr-1" />Database</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-3">
                <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="phone,name&#10;971500000000,Arseny" />
              </TabsContent>

              <TabsContent value="upload" className="mt-3">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="block text-sm w-full"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setCsv(text);
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">CSV with header row: phone, name, then any custom variable columns.</p>
              </TabsContent>

              <TabsContent value="chats" className="mt-3 space-y-2">
                {chatsQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading current chats...</div>
                ) : (
                  <Button variant="outline" size="sm" onClick={useCurrentChats}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />Use current chats ({chatsQuery.data?.length ?? 0})
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="saved" className="mt-3 space-y-2">
                {savedList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No saved audiences yet. Save one from the current parsed list below.</p>
                ) : (
                  <div className="space-y-1">
                    {savedList.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">{a.name}</span>
                        <span className="text-xs text-muted-foreground">{a.count}</span>
                        <Button variant="ghost" size="sm" onClick={() => setCsv(a.csv)}>Load</Button>
                        <Button variant="ghost" size="icon" onClick={() => { deleteSavedAudience(workspace!.id, a.id); setSavedList(listSavedAudiences(workspace!.id)); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="database" className="mt-3 space-y-3">
                {dbBatchesQ.isLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading batches...</div>
                ) : (dbBatchesQ.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No database batches yet. Upload one in the Data section.</p>
                ) : (
                  <>
                    <Select value={dbBatchId} onValueChange={setDbBatchId}>
                      <SelectTrigger><SelectValue placeholder="Pick a batch" /></SelectTrigger>
                      <SelectContent>
                        {(dbBatchesQ.data ?? []).map((b) => {
                          const s = (dbStatsQ.data ?? []).find((x) => x.batch_id === b.id);
                          return (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name} {s ? `· ${s.unused} unused / ${s.valid} valid` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {dbBatch && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        <Stat label="Total" value={dbStats?.total ?? 0} />
                        <Stat label="Valid" value={dbStats?.valid ?? 0} />
                        <Stat label="Duplicates" value={dbStats?.duplicates ?? 0} />
                        <Stat label="Used" value={dbStats?.used ?? 0} />
                        <Stat label="Unused" value={dbStats?.unused ?? 0} highlight />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={dbAllUnused} onChange={(e) => setDbAllUnused(e.target.checked)} />
                        Use all unused ({dbAvailable})
                      </label>
                      {!dbAllUnused && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Quantity</span>
                          <Input type="number" min={1} max={dbAvailable} className="h-8 w-24"
                            value={dbQty} onChange={(e) => setDbQty(e.target.value)} />
                        </div>
                      )}
                      <Badge variant="outline" className="text-[10px]">Will reserve {dbTargetCount} row{dbTargetCount === 1 ? "" : "s"} on launch</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Rows are reserved when you click Launch, marked used after each sub-campaign succeeds, and released automatically if a sub-campaign fails.
                    </p>
                  </>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between flex-wrap gap-2 mt-3 text-xs text-muted-foreground">
              <span>
                {audienceSource === "database"
                  ? `${dbTargetCount} recipients will be reserved from this batch on launch`
                  : `${recipients.length} valid recipients · ${columns.length} columns detected`}
              </span>
              {audienceSource !== "database" && recipients.length > 0 && workspace && (
                <div className="flex items-center gap-1">
                  <Input className="h-7 w-44 text-xs" placeholder="Save this CSV as..." value={saveAudName} onChange={(e) => setSaveAudName(e.target.value)} />
                  <Button variant="ghost" size="sm" onClick={() => {
                    saveAudience(workspace.id, saveAudName || `Audience ${savedList.length + 1}`, csv, recipients.length);
                    setSavedList(listSavedAudiences(workspace.id));
                    setSaveAudName("");
                    toast.success("Audience saved to Saved tab");
                  }}>
                    <Save className="w-3.5 h-3.5 mr-1" />Save
                  </Button>
                </div>
              )}
            </div>
          </Step>

          {/* Step 5: Variable mapping */}
          {variableNames.length > 0 && (
            <Step n={5} icon={FileText} title="Variable mapping">
              <div className="space-y-2">
                {variableNames.map((v) => {
                  const current = mapping[v] ?? "";
                  const isStatic = current.startsWith("__static:");
                  return (
                    <div key={v} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{`{${v}}`}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <Select value={isStatic ? "__static__" : current || "__none__"} onValueChange={(val) => {
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (val === "__none__") delete next[v];
                          else if (val === "__static__") next[v] = "__static:";
                          else next[v] = val;
                          return next;
                        });
                      }}>
                        <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Pick column" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— unset —</SelectItem>
                          {columns.map((c) => <SelectItem key={c} value={c}>column: {c}</SelectItem>)}
                          <SelectItem value="__static__">static value...</SelectItem>
                        </SelectContent>
                      </Select>
                      {isStatic && (
                        <Input
                          className="h-8 flex-1"
                          placeholder="Static value"
                          value={current.slice("__static:".length)}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [v]: `__static:${e.target.value}` }))}
                        />
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">Mapping is auto-saved per template for this workspace.</p>
              </div>
            </Step>
          )}

          {/* Step 6: Naming */}
          <Step n={6} icon={Bookmark} title="Campaign name">
            <Field label="Pipeline (board where replies will land)">
              <div className="flex gap-2">
                <Select value={pipelineId} onValueChange={setPipelineId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a pipeline" /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                          {p.name}{p.is_default && <span className="text-[10px] text-muted-foreground">(default)</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setShowCreatePipeline(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />New
                </Button>
              </div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              <Field label="Audience">
                <Input value={audience} onChange={(e) => { setAudience(e.target.value); setAudienceDirty(true); }} placeholder="GTM Professionals" />
              </Field>
              <Field label="CTA">
                <div className="flex gap-2">
                  <Select value={ctaPreset} onValueChange={setCtaPreset}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CTA_PRESETS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {ctaPreset === "Other" && (
                    <Input className="flex-1" value={ctaCustom} onChange={(e) => setCtaCustom(e.target.value)} placeholder="Custom CTA" />
                  )}
                </div>
              </Field>
            </div>
            <div className="mt-2">
              <Field label="Generated name (editable)">
                <Input value={campaignName} onChange={(e) => { setCampaignName(e.target.value); setNameDirty(true); }} />
              </Field>
              {nameDirty && (
                <button className="text-xs text-primary underline mt-1" onClick={() => setNameDirty(false)}>
                  Reset to auto-generated
                </button>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Format: YYYY-MM-DD | COUNTRY | AUDIENCE | TEMPLATE | CTA
              </p>
            </div>
          </Step>

          {/* Step 7: Preview */}
          <Step n={7} icon={Eye} title="Rendered preview">
            {!activeLogical?.body ? (
              <p className="text-sm text-muted-foreground">No template body to preview.</p>
            ) : previewSamples.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add recipients to preview the rendered message.</p>
            ) : (
              <div className="space-y-2">
                {previewSamples.map((s, i) => (
                  <div key={i} className="rounded-md border border-border bg-card/30 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xs text-muted-foreground">To +{s.phone}</div>
                      {s.missing.length > 0 && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                          <AlertTriangle className="w-3 h-3 mr-1" />Missing: {s.missing.join(", ")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{s.body}</div>
                  </div>
                ))}
              </div>
            )}
          </Step>
        </div>

        {/* SIDEBAR */}
        <aside className="rounded-lg border border-border bg-card/40 p-4 space-y-3 lg:sticky lg:top-4 self-start">
          <div className="font-display text-lg flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Review</div>
          <Row label="Type" value={preset.label} />
          <Row label="Workspace" value={workspace?.name ?? "-"} />
          <Row label="Pool" value={poolCountry ? `${poolCountry} · ${readyInPool.length}/${poolNumbers.length} ready` : "-"} />
          <Row label="Template" value={activeLogical?.label ?? "-"} />
          <Row label="Numbers" value={activeNumbers.length || "Pick at least 1"} />
          <Row label="Recipients" value={recipients.length} />
          <Row label="Per number" value={activeNumbers.length ? Math.ceil(recipients.length / activeNumbers.length) : "-"} />
          <Row label="Speed" value={delayMin === 0 && delayMax === 0 ? "Blast" : `${delayMin}-${delayMax}s`} />
          <Row label="ETA" value={eta} />
          {resolution.missing.length > 0 && (
            <div className="text-xs text-amber-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {resolution.missing.length} number(s) missing template variant.
            </div>
          )}
          <Button
            className="w-full"
            onClick={() => launch.mutate()}
            disabled={launch.isPending || resolution.missing.length > 0 || recipients.length === 0 || !activeLogical || activeNumbers.length === 0 || !pipelineId}
          >
            <Play className="w-4 h-4 mr-1" />{launch.isPending ? "Launching..." : "Launch now"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {resolution.ok.length > 1 ? `Will create ${resolution.ok.length} sub-campaigns, one per number.` : "Single campaign."}
          </p>
        </aside>
      </div>

      <Dialog open={showCreatePipeline} onOpenChange={setShowCreatePipeline}>
        <DialogContent>
          <DialogHeader><DialogTitle>New pipeline</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name">
              <Input value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} placeholder="e.g. Ads / Germany" autoFocus />
            </Field>
            <Field label="Color">
              <Input type="color" value={newPipelineColor} onChange={(e) => setNewPipelineColor(e.target.value)} className="h-10 w-20 p-1" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreatePipeline(false)}>Cancel</Button>
            <Button onClick={handleCreatePipeline} disabled={!newPipelineName.trim() || creatingPipeline}>
              {creatingPipeline ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Step = ({ n, icon: Icon, title, right, children }: { n: number; icon: any; title: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">{n}</span>
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h3 className="font-medium flex-1">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><label className="text-xs text-muted-foreground">{label}</label>{children}</div>
);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium truncate ml-2">{value}</span></div>
);

const Stat = ({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) => (
  <div className={`rounded-md border p-2 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card/30"}`}>
    <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    <div className="text-sm font-semibold">{value}</div>
  </div>
);
