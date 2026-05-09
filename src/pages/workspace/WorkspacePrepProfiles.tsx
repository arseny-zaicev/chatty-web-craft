import { useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Plus, Pencil, Trash2, Loader2, Database, ArrowLeft, Wand2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  prepProfileKeys, listPrepProfiles, upsertPrepProfile, deletePrepProfile,
  applyDerivedVariables, validateRowAgainstProfile, renderSampleMessage,
  type PrepProfile, type DerivedVariable, type InvalidRule,
} from "@/lib/prepProfiles";
import type { WorkspaceContext } from "./WorkspaceLayout";

export default function WorkspacePrepProfiles() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PrepProfile | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const profilesQ = useQuery({
    queryKey: prepProfileKeys.list(workspace?.id),
    queryFn: () => listPrepProfiles(workspace!.id),
    enabled: !!workspace,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deletePrepProfile(id),
    onSuccess: () => {
      toast.success("Profile deleted");
      qc.invalidateQueries({ queryKey: prepProfileKeys.list(workspace?.id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Pick a client.</div>;

  return (
    <>
      <Helmet><title>Prep Profiles - {workspace.name}</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              <h1 className="font-display text-xl">Prep Profiles</h1>
              <Badge variant="outline" className="text-[10px]">Internal · managers only</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              A Prep Profile is a <strong>saved recipe</strong>. The system never guesses a prompt from a name - the prompt and the rendered message are generated deterministically from the recipe's fields below: required input columns, derived launch variables, validation rules, fallbacks, and a sample message body.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to={`/ws/${workspace.slug}/data`}><ArrowLeft className="w-4 h-4 mr-1" />Back to Data</Link>
            </Button>
            <Button onClick={() => setCreatingNew(true)}>
              <Plus className="w-4 h-4 mr-1" />New profile
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
          {profilesQ.isLoading && <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {!profilesQ.isLoading && (profilesQ.data ?? []).length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No prep profiles yet. Create one before uploading audience batches.
            </div>
          )}
          {(profilesQ.data ?? []).map((p) => (
            <div key={p.id} className="p-4 flex items-start gap-4 hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{p.name}</span>
                  <Badge variant="outline" className="text-[10px]">{p.campaign_type}</Badge>
                  {p.template_label && <Badge variant="outline" className="text-[10px] text-muted-foreground">{p.template_label}</Badge>}
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {p.required_fields.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">required: {p.required_fields.join(", ")}</Badge>
                  )}
                  {p.derived_variables.length > 0 && (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                      derives: {p.derived_variables.map((d) => d.key).join(", ")}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  if (confirm(`Delete profile "${p.name}"?`)) removeMut.mutate(p.id);
                }}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(creatingNew || editing) && (
        <ProfileEditor
          workspaceId={workspace.id}
          initial={editing}
          onClose={() => { setCreatingNew(false); setEditing(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: prepProfileKeys.list(workspace.id) })}
        />
      )}
    </>
  );
}

/* ---------- Editor ---------- */

function ProfileEditor({
  workspaceId, initial, onClose, onSaved,
}: {
  workspaceId: string;
  initial: PrepProfile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [campaignType, setCampaignType] = useState<"marketing" | "utility">(initial?.campaign_type ?? "utility");
  const [templateLabel, setTemplateLabel] = useState(initial?.template_label ?? "");
  const [requiredFields, setRequiredFields] = useState<string[]>(initial?.required_fields ?? []);
  const [optionalFields, setOptionalFields] = useState<string[]>(initial?.optional_fields ?? []);
  const [derived, setDerived] = useState<DerivedVariable[]>(initial?.derived_variables ?? []);
  const [invalidRules, setInvalidRules] = useState<InvalidRule[]>(initial?.invalid_rules ?? []);
  const [fallbacks, setFallbacks] = useState<Record<string, string>>(initial?.fallback_rules ?? {});
  const [quickReplies, setQuickReplies] = useState<string[]>(initial?.quick_replies ?? []);
  const [sample, setSample] = useState<Record<string, string>>(initial?.sample_payload ?? {});
  const [sampleMessageTemplate, setSampleMessageTemplate] = useState<string>(initial?.sample_message_template ?? "");
  const [busy, setBusy] = useState(false);

  const allFields = useMemo(
    () => Array.from(new Set([...requiredFields, ...optionalFields, ...Object.keys(sample)])),
    [requiredFields, optionalFields, sample],
  );

  const livePreview = useMemo(() => {
    const profile: PrepProfile = {
      id: initial?.id ?? "preview",
      workspace_id: workspaceId,
      user_id: "",
      name, description, campaign_type: campaignType, template_label: templateLabel,
      required_fields: requiredFields, optional_fields: optionalFields,
      derived_variables: derived, invalid_rules: invalidRules,
      fallback_rules: fallbacks, quick_replies: quickReplies, sample_payload: sample,
      sample_message_template: sampleMessageTemplate || null,
      created_at: "", updated_at: "",
    };
    const validation = validateRowAgainstProfile(profile, sample);
    const derivedOut = applyDerivedVariables(profile, sample);
    const renderedMessage = renderSampleMessage(profile, sample);
    return { validation, derivedOut, renderedMessage };
  }, [initial?.id, workspaceId, name, description, campaignType, templateLabel, requiredFields, optionalFields, derived, invalidRules, fallbacks, quickReplies, sample, sampleMessageTemplate]);

  const submit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      await upsertPrepProfile({
        id: initial?.id,
        workspace_id: workspaceId,
        user_id: u.user.id,
        name: name.trim(),
        description: description.trim() || null,
        campaign_type: campaignType,
        template_label: templateLabel.trim() || null,
        required_fields: requiredFields,
        optional_fields: optionalFields,
        derived_variables: derived,
        invalid_rules: invalidRules,
        fallback_rules: fallbacks,
        quick_replies: quickReplies,
        sample_payload: sample,
      });
      toast.success(initial ? "Profile updated" : "Profile created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit prep profile" : "New prep profile"}</DialogTitle>
          <DialogDescription>
            Defines the shape an audience batch must match before it can be launched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Section title="Basics">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UAE buyers - utility v2" />
              </Field>
              <Field label="Campaign type">
                <Select value={campaignType} onValueChange={(v) => setCampaignType(v as "marketing" | "utility")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="utility">Utility</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Logical template label">
                <Input value={templateLabel} onChange={(e) => setTemplateLabel(e.target.value)} placeholder="e.g. demo_booking_v2" />
              </Field>
              <Field label="Description">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Internal note" />
              </Field>
            </div>
          </Section>

          <Section title="Source fields">
            <ChipInput label="Required fields" values={requiredFields} onChange={setRequiredFields} placeholder="first_name" />
            <ChipInput label="Optional fields" values={optionalFields} onChange={setOptionalFields} placeholder="company" />
          </Section>

          <Section title="Derived launch variables">
            <p className="text-xs text-muted-foreground">
              Variables passed to the WhatsApp template at launch (e.g. <code>var_1</code>, <code>var_2</code>). Use <code>{"{field}"}</code> in templates to reference source columns.
            </p>
            <div className="space-y-2">
              {derived.map((d, i) => (
                <div key={i} className="rounded-md border border-border p-2 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <Input className="col-span-3" placeholder="key (var_1)" value={d.key}
                      onChange={(e) => updateAt(setDerived, i, { ...d, key: e.target.value })} />
                    <Select value={d.strategy} onValueChange={(v) => updateAt(setDerived, i, { ...d, strategy: v as any })}>
                      <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="field">field</SelectItem>
                        <SelectItem value="template">template</SelectItem>
                        <SelectItem value="static">static</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="col-span-5" placeholder={
                      d.strategy === "field" ? "source column" :
                      d.strategy === "template" ? "a demo system for {company}" :
                      "static value"
                    }
                      value={d.strategy === "field" ? (d.source ?? "") : d.strategy === "template" ? (d.template ?? "") : (d.static ?? "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateAt(setDerived, i,
                          d.strategy === "field" ? { ...d, source: v } :
                          d.strategy === "template" ? { ...d, template: v } :
                          { ...d, static: v }
                        );
                      }} />
                    <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeAt(setDerived, i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <Input placeholder="fallback when empty (optional)" value={d.fallback ?? ""}
                    onChange={(e) => updateAt(setDerived, i, { ...d, fallback: e.target.value })} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setDerived([...derived, { key: `var_${derived.length + 1}`, strategy: "field" }])}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add derived variable
              </Button>
            </div>
          </Section>

          <Section title="Invalid row rules">
            <div className="space-y-2">
              {invalidRules.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-4" placeholder="field" value={r.field}
                    onChange={(e) => updateAt(setInvalidRules, i, { ...r, field: e.target.value })} />
                  <Select value={r.rule} onValueChange={(v) => updateAt(setInvalidRules, i, { ...r, rule: v as any })}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="non_empty">non_empty</SelectItem>
                      <SelectItem value="min_length">min_length</SelectItem>
                      <SelectItem value="regex">regex</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="col-span-4" placeholder={r.rule === "min_length" ? "e.g. 3" : r.rule === "regex" ? "^[A-Z]+$" : ""}
                    value={r.value ?? ""}
                    onChange={(e) => updateAt(setInvalidRules, i, { ...r, value: e.target.value })}
                    disabled={r.rule === "non_empty"} />
                  <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeAt(setInvalidRules, i)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setInvalidRules([...invalidRules, { field: "", rule: "non_empty" }])}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add rule
              </Button>
            </div>
          </Section>

          <Section title="Fallback values per field">
            <KeyValueEditor values={fallbacks} onChange={setFallbacks} keyPlaceholder="field" valuePlaceholder="default value" suggestions={allFields} />
          </Section>

          <Section title="Quick replies (optional)">
            <ChipInput label="Buttons" values={quickReplies} onChange={setQuickReplies} placeholder="Yes" />
          </Section>

          <Section title="Sample row & rendered preview">
            <KeyValueEditor values={sample} onChange={setSample} keyPlaceholder="field" valuePlaceholder="value" suggestions={allFields} />
            <div className="rounded-md border border-border bg-muted/30 p-3 mt-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5"><Eye className="w-3.5 h-3.5" />Live preview</div>
              <div className="text-xs">
                <span className="text-muted-foreground">Validation: </span>
                {livePreview.validation.ok
                  ? <span className="text-emerald-600">OK</span>
                  : <span className="text-amber-600">{livePreview.validation.errors.join("; ")}</span>}
              </div>
              <div className="mt-2 space-y-1 font-mono text-xs">
                {Object.keys(livePreview.derivedOut).length === 0 && (
                  <span className="text-muted-foreground">No derived variables to show.</span>
                )}
                {Object.entries(livePreview.derivedOut).map(([k, v]) => (
                  <div key={k}><span className="text-primary">{k}</span> = <span>{v || <em className="text-muted-foreground">(empty)</em>}</span></div>
                ))}
              </div>
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {initial ? "Save changes" : "Create profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- helpers ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label className="text-xs text-muted-foreground">{label}</label>{children}</div>;
}
function updateAt<T>(setter: (cb: (v: T[]) => T[]) => void, i: number, next: T) {
  setter((arr) => arr.map((x, idx) => idx === i ? next : x));
}
function removeAt<T>(setter: (cb: (v: T[]) => T[]) => void, i: number) {
  setter((arr) => arr.filter((_, idx) => idx !== i));
}

function ChipInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (!t) return; if (!values.includes(t)) onChange([...values, t]); setDraft(""); };
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-2 mt-1">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {values.map((v) => (
          <Badge key={v} variant="outline" className="cursor-pointer" onClick={() => onChange(values.filter((x) => x !== v))}>
            {v} ×
          </Badge>
        ))}
      </div>
    </div>
  );
}

function KeyValueEditor({ values, onChange, keyPlaceholder, valuePlaceholder, suggestions }:
  { values: Record<string, string>; onChange: (v: Record<string, string>) => void; keyPlaceholder: string; valuePlaceholder: string; suggestions?: string[] }) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const entries = Object.entries(values);
  const add = () => { const key = k.trim(); if (!key) return; onChange({ ...values, [key]: v }); setK(""); setV(""); };
  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-2 items-center">
          <Input className="flex-1" value={key} disabled />
          <Input className="flex-[2]" value={val} onChange={(e) => onChange({ ...values, [key]: e.target.value })} />
          <Button variant="ghost" size="icon" onClick={() => { const n = { ...values }; delete n[key]; onChange(n); }}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input className="flex-1" value={k} onChange={(e) => setK(e.target.value)} placeholder={keyPlaceholder} list={suggestions ? "kv-suggestions" : undefined} />
        <Input className="flex-[2]" value={v} onChange={(e) => setV(e.target.value)} placeholder={valuePlaceholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" size="sm" onClick={add}>Add</Button>
        {suggestions && suggestions.length > 0 && (
          <datalist id="kv-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        )}
      </div>
    </div>
  );
}
