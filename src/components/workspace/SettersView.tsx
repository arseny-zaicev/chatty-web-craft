import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  fetchSetters, setterKeys, createSetter, updateSetter, deleteSetter, type Setter,
} from "@/lib/setters";
import {
  fetchWorkspaceMembers, memberDisplayName, workspaceMembersKey,
} from "@/lib/workspaceMembers";

export default function SettersView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data: setters = [], isLoading } = useQuery({
    queryKey: setterKeys.list(workspaceId),
    queryFn: () => fetchSetters(workspaceId),
  });
  const { data: members = [] } = useQuery({
    queryKey: workspaceMembersKey(workspaceId),
    queryFn: () => fetchWorkspaceMembers(workspaceId),
  });

  const linkedIds = useMemo(() => new Set(setters.map((s) => s.linked_user_id).filter(Boolean) as string[]), [setters]);
  const availableMembers = members.filter((m) => !linkedIds.has(m.user_id));

  const [newName, setNewName] = useState("");
  const [newMember, setNewMember] = useState<string>("__external__");
  const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: setterKeys.list(workspaceId) });

  const handleAdd = async () => {
    const fromMember = newMember !== "__external__" ? members.find((m) => m.user_id === newMember) : null;
    const display = fromMember ? memberDisplayName(fromMember) : newName.trim();
    if (!display) { toast.error("Enter a name"); return; }
    setAdding(true);
    try {
      await createSetter({
        workspaceId,
        displayName: display,
        linkedUserId: fromMember?.user_id ?? null,
        external: !fromMember,
      });
      setNewName(""); setNewMember("__external__");
      toast.success("Setter added");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add setter");
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (s: Setter) => {
    try {
      await updateSetter(s.id, { is_active: !s.is_active });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleRename = async (s: Setter, name: string) => {
    if (!name.trim() || name === s.display_name) return;
    try {
      await updateSetter(s.id, { display_name: name.trim() });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = async (s: Setter) => {
    if (!confirm(`Remove setter "${s.display_name}"? Chats assigned to them will become unassigned.`)) return;
    try {
      await deleteSetter(s.id);
      toast.success("Setter removed");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-display mb-1">Setters</h2>
        <p className="text-sm text-muted-foreground">
          People who handle conversations in this workspace. Can be existing workspace members (with login) or
          external names used as labels. Stats and per-chat assignment use this list.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
        <div className="text-sm font-medium flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" />Add setter</div>
        <div className="grid sm:grid-cols-[1fr,1fr,auto] gap-2">
          <Select value={newMember} onValueChange={setNewMember}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Workspace member…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__external__">External (label only)</SelectItem>
              {availableMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{memberDisplayName(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={newMember === "__external__" ? "Setter display name" : "(uses member name)"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={newMember !== "__external__"}
            className="h-9 text-sm"
          />
          <Button onClick={handleAdd} disabled={adding} className="h-9">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Kind</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            )}
            {!isLoading && setters.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No setters yet.</td></tr>
            )}
            {setters.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <Input
                    defaultValue={s.display_name}
                    onBlur={(e) => handleRename(s, e.target.value)}
                    className="h-8 text-sm bg-transparent border-transparent hover:border-border focus:border-border"
                  />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {s.external ? "External" : "Workspace user"}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${s.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}>
                    {s.is_active ? "Active" : "Paused"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(s)} title={s.is_active ? "Pause" : "Activate"}>
                    {s.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s)} title="Remove">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
