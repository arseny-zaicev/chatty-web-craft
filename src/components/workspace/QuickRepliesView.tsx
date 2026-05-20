// Quick reply templates curator. Visible inside Settings to anyone with
// `perm_quick_replies_manage`. RLS still enforces server-side.
//
// What it does:
// 1. Lists template groups marked as quick replies for this workspace.
// 2. Lets the manager add / rename / remove entries from `template_groups`.
// 3. Shows a per-number coverage matrix so it's obvious which numbers lack
//    an approved variant.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Loader2, Plus, Trash2, Zap, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  fetchQuickTemplateGroupsResolved,
  quickTemplatesKey,
  addQuickTemplateGroup,
  updateQuickTemplateGroup,
  removeQuickTemplateGroup,
} from "@/lib/quickTemplates";
import {
  fetchLaunchEssentials, fetchTemplateGroups, groupLogicalTemplates,
} from "@/lib/launchData";
import TemplateGroupsDialog from "@/components/workspace/TemplateGroupsDialog";

export default function QuickRepliesView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false);

  const { data: resolved = [], isLoading } = useQuery({
    queryKey: quickTemplatesKey.list(workspaceId),
    queryFn: () => fetchQuickTemplateGroupsResolved(workspaceId),
  });

  const { data: essentials } = useQuery({
    queryKey: ["launch-essentials", workspaceId],
    queryFn: () => fetchLaunchEssentials(workspaceId),
  });

  const { data: allGroups = [] } = useQuery({
    queryKey: ["template-groups-all", workspaceId],
    queryFn: () => fetchTemplateGroups(workspaceId),
  });

  const logicalByGroupId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof groupLogicalTemplates>[number]>();
    if (!essentials) return map;
    const logical = groupLogicalTemplates(essentials.templates, allGroups);
    for (const l of logical) {
      if (l.key.startsWith("group:")) {
        map.set(l.key.slice("group:".length), l);
      }
    }
    return map;
  }, [essentials, allGroups]);

  const remove = useMutation({
    mutationFn: removeQuickTemplateGroup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quickTemplatesKey.list(workspaceId) });
      toast.success("Removed from quick replies");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      updateQuickTemplateGroup(id, { label: label.trim() || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: quickTemplatesKey.list(workspaceId) }),
  });

  const numbers = essentials?.numbers ?? [];
  const usedGroupIds = new Set(resolved.map((r) => r.group.id));
  const availableGroups = allGroups.filter((g) => !usedGroupIds.has(g.id));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Quick reply templates</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Approved Meta templates that setters can send from the chat composer to re-open
            conversations after the 24h window closes. Each entry is a template group; when
            sent, the system automatically picks the variant whose WhatsApp number matches
            the chat - so no risk of mixing numbers.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setGroupsDialogOpen(true)}>
            <Layers className="w-3.5 h-3.5 mr-1" />Manage groups
          </Button>
          <Button size="sm" onClick={() => setAdding(true)} disabled={availableGroups.length === 0}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add quick reply
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : resolved.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No quick replies yet. Create or open a template group first, then add it here.
        </div>
      ) : (
        <div className="space-y-3">
          {resolved.map(({ quick, group }) => {
            const logical = logicalByGroupId.get(group.id);
            return (
              <div key={quick.id} className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        defaultValue={quick.label ?? group.name}
                        onBlur={(e) => {
                          if (e.target.value.trim() !== (quick.label ?? group.name)) {
                            rename.mutate({ id: quick.id, label: e.target.value });
                          }
                        }}
                        className="h-8 text-sm font-medium w-64"
                        placeholder="Button label"
                      />
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {group.category}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Group: <code>{group.name}</code> · {group.template_names.length} template{group.template_names.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Button
                    size="sm" variant="ghost" className="text-red-600"
                    onClick={() => { if (confirm(`Remove "${group.name}" from quick replies?`)) remove.mutate(quick.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {numbers.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {numbers.map((n) => {
                      const variant = logical?.variantByNumber.get(n.id);
                      return (
                        <div
                          key={n.id}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs border ${
                            variant ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
                          }`}
                        >
                          {variant ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{n.display_name || n.label || n.phone_number}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {variant ? `Uses: ${variant.name}` : "No approved variant"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddDialog
        open={adding}
        onOpenChange={setAdding}
        workspaceId={workspaceId}
        availableGroups={availableGroups}
        onAdded={() => qc.invalidateQueries({ queryKey: quickTemplatesKey.list(workspaceId) })}
      />

      <TemplateGroupsDialog
        open={groupsDialogOpen}
        onOpenChange={setGroupsDialogOpen}
        workspaceId={workspaceId}
        templates={essentials?.templates ?? []}
      />
    </div>
  );
}

function AddDialog({
  open, onOpenChange, workspaceId, availableGroups, onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  availableGroups: { id: string; name: string; category: string }[];
  onAdded: () => void;
}) {
  const [groupId, setGroupId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!groupId) { toast.error("Pick a template group"); return; }
    setSaving(true);
    try {
      await addQuickTemplateGroup({ workspaceId, templateGroupId: groupId, label });
      toast.success("Added to quick replies");
      onAdded();
      onOpenChange(false);
      setGroupId(""); setLabel("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add quick reply template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Template group</label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="Pick a group..." /></SelectTrigger>
              <SelectContent>
                {availableGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name} ({g.category})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Button label (optional)</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Re-engage" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !groupId}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
