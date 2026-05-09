import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, Users, Link2, Copy, Check, X } from "lucide-react";

type Member = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string | null;
};

const membersKey = (wsId: string) => ["workspace", wsId, "members"] as const;

export default function TeamView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "client">("client");

  const { data: members, isLoading } = useQuery({
    queryKey: membersKey(workspaceId),
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id, user_id, role, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-workspace-member", {
        body: { workspace_id: workspaceId, email: email.trim(), role },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: (data) => {
      const invited = (data as { invited?: boolean })?.invited;
      toast.success(invited ? "Invitation email sent" : "Member added");
      setEmail("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: membersKey(workspaceId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to invite"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: membersKey(workspaceId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-primary" /><h3 className="font-display text-lg font-semibold">Team & client access</h3></div>
          <p className="text-xs text-muted-foreground">Invite teammates as <strong>Manager</strong> (full access) or the client as <strong>Client</strong> (read-only Overview, Inbox, Pipeline, Campaigns - no provider details).</p>
        </div>
        <Button onClick={() => setOpen(true)}><UserPlus className="w-4 h-4 mr-2" />Invite</Button>
      </div>

      <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
        {isLoading && <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
        {!isLoading && (members ?? []).length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">No members yet. Invite the first one.</div>
        )}
        {(members ?? []).map((m) => (
          <div key={m.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{m.email ?? `User ${m.user_id.slice(0, 8)}`}</div>
              <div className="text-[10px] text-muted-foreground">Added {new Date(m.created_at).toLocaleDateString()}</div>
            </div>
            <Badge variant="outline" className={m.role === "client" ? "bg-blue-500/10 text-blue-500 border-blue-500/30" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"}>
              {m.role}
            </Badge>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate(m.id)} disabled={remove.isPending}>
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
            <DialogDescription>They'll receive an email with a link to set a password and access the workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={role} onValueChange={(v) => setRole(v as "manager" | "client")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client - read-only, no provider details</SelectItem>
                  <SelectItem value="manager">Manager - full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => invite.mutate()} disabled={!email.trim() || invite.isPending}>
              {invite.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
