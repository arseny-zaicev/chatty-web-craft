import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, Users, Link2, Copy, Check, X, Mail, Clock, Activity, BarChart3, Pencil, Layers } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Member = {
  id: string;
  user_id: string;
  role: string;
  can_view_stats: boolean;
  allowed_pipeline_ids: string[] | null;
  joined_at: string;
  email: string | null;
  full_name: string | null;
  account_created_at: string | null;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  minutes_30d: number;
  sessions_30d: number;
};

type WsPipeline = { id: string; name: string; color: string | null };

const membersKey = (wsId: string) => ["workspace", wsId, "members"] as const;
const linksKey = (wsId: string) => ["workspace", wsId, "invite-links"] as const;

type InviteLink = {
  id: string;
  token: string;
  role: "manager" | "client";
  max_uses: number;
  used_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  allowed_pipeline_ids: string[] | null;
};

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function TeamView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkRole, setLinkRole] = useState<"manager" | "client">("manager");
  const [linkSeats, setLinkSeats] = useState(4);
  const [linkPipelineIds, setLinkPipelineIds] = useState<string[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "client">("client");

  const { data: pipelines } = useQuery({
    queryKey: ["workspace", workspaceId, "pipelines-list"] as const,
    queryFn: async (): Promise<WsPipeline[]> => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name, color")
        .eq("workspace_id", workspaceId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WsPipeline[];
    },
  });
  const pipelineById = new Map((pipelines ?? []).map((p) => [p.id, p] as const));


  const { data: members, isLoading } = useQuery({
    queryKey: membersKey(workspaceId),
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.functions.invoke("workspace-invite-link?action=members", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      const payload = data as { members?: Member[]; error?: string };
      if (payload?.error) throw new Error(payload.error);
      return payload.members ?? [];
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

  const toggleStats = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("workspace_members").update({ can_view_stats: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(workspaceId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const { data: links, isLoading: linksLoading } = useQuery({
    queryKey: linksKey(workspaceId),
    queryFn: async (): Promise<InviteLink[]> => {
      const { data, error } = await supabase.functions.invoke("workspace-invite-link?action=list", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      const payload = data as { links?: InviteLink[]; error?: string };
      if (payload?.error) throw new Error(payload.error);
      return payload.links ?? [];
    },
  });

  const createLink = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("workspace-invite-link?action=create", {
        body: {
          workspace_id: workspaceId,
          role: linkRole,
          max_uses: linkSeats,
          days: 30,
          pipeline_ids: linkRole === "client" ? linkPipelineIds : [],
        },
      });
      if (error) throw error;
      const payload = data as { error?: string; token?: string };
      if (payload?.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      toast.success("Invite link created");
      setLinkPipelineIds([]);
      qc.invalidateQueries({ queryKey: linksKey(workspaceId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create link"),
  });

  const updateAccess = useMutation({
    mutationFn: async ({ id, ids }: { id: string; ids: string[] }) => {
      const { data, error } = await supabase.functions.invoke("workspace-invite-link?action=update_access", {
        body: { workspace_id: workspaceId, id, allowed_pipeline_ids: ids },
      });
      if (error) throw error;
      const payload = data as { error?: string };
      if (payload?.error) throw new Error(payload.error);
    },
    onSuccess: () => {
      toast.success("Access updated");
      qc.invalidateQueries({ queryKey: membersKey(workspaceId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update access"),
  });

  const revokeLink = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("workspace-invite-link?action=revoke", {
        body: { workspace_id: workspaceId, id },
      });
      if (error) throw error;
      const payload = data as { error?: string };
      if (payload?.error) throw new Error(payload.error);
    },
    onSuccess: () => {
      toast.success("Link revoked");
      qc.invalidateQueries({ queryKey: linksKey(workspaceId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke"),
  });

  const buildLinkUrl = (token: string) => `${window.location.origin}/join/${token}`;
  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildLinkUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-primary" /><h3 className="font-display text-lg font-semibold">Team & client access</h3></div>
          <p className="text-xs text-muted-foreground"><strong>Manager</strong> - full access (Inbox, Pipeline, Overview, Campaigns view, Quick replies, Settings). <strong>Client</strong> - Inbox + Pipeline only by default; toggle below to grant Overview + Campaigns view.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLinkOpen(true)}><Link2 className="w-4 h-4 mr-2" />Invite link</Button>
          <Button onClick={() => setOpen(true)}><UserPlus className="w-4 h-4 mr-2" />Invite by email</Button>
        </div>
      </div>

      {/* Active invite links */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shareable invite links</div>
        <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
          {linksLoading && <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
          {!linksLoading && (links ?? []).length === 0 && (
            <div className="p-4 text-xs text-muted-foreground text-center">No active links. Create one to invite multiple teammates with a single URL.</div>
          )}
          {(links ?? []).map((l) => {
            const expired = new Date(l.expires_at).getTime() < Date.now();
            const exhausted = l.used_count >= l.max_uses;
            const dead = Boolean(l.revoked_at) || expired || exhausted;
            return (
              <div key={l.id} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm truncate">{buildLinkUrl(l.token)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {l.role} · {l.used_count}/{l.max_uses} used ·{" "}
                    {l.revoked_at ? "revoked" : expired ? "expired" : exhausted ? "all seats used" : `expires ${new Date(l.expires_at).toLocaleDateString()}`}
                    {l.role === "client" && (
                      <> · {(l.allowed_pipeline_ids?.length ?? 0) === 0
                        ? "all pipelines"
                        : `${l.allowed_pipeline_ids!.length} pipeline${l.allowed_pipeline_ids!.length === 1 ? "" : "s"}`}</>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => copyLink(l.token)} disabled={dead}>
                  {copiedToken === l.token ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                {!l.revoked_at && (
                  <Button size="icon" variant="ghost" onClick={() => revokeLink.mutate(l.id)} disabled={revokeLink.isPending}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
        {isLoading && <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
        {!isLoading && (members ?? []).length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">No members yet. Invite the first one.</div>
        )}
        {(members ?? []).map((m) => {
          const displayName = m.full_name?.trim() || (m.email ? m.email.split("@")[0] : `User ${m.user_id.slice(0, 8)}`);
          const initials = displayName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0]?.toUpperCase())
            .join("") || "?";
          const minutes = m.minutes_30d ?? 0;
          const activeLabel = minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`;
          return (
            <div key={m.id} className="p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium truncate">{displayName}</div>
                  <Badge variant="outline" className={m.role === "client" ? "bg-blue-500/10 text-blue-500 border-blue-500/30" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"}>
                    {m.role}
                  </Badge>
                </div>
                {m.email && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{m.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
                  <span>Joined {new Date(m.joined_at).toLocaleDateString()}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last seen {fmtRelative(m.last_seen_at ?? m.last_sign_in_at)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    {activeLabel} active · {m.sessions_30d ?? 0} {m.sessions_30d === 1 ? "session" : "sessions"} (30d)
                  </span>
                </div>
                {m.role === "client" && (
                  <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer mt-1">
                    <BarChart3 className="w-3 h-3" />
                    <span>Can view Overview & Campaigns</span>
                    <Switch
                      checked={m.can_view_stats}
                      onCheckedChange={(v) => toggleStats.mutate({ id: m.id, value: v })}
                      disabled={toggleStats.isPending}
                    />
                  </label>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(m.id)} disabled={remove.isPending}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          );
        })}
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
                  <SelectItem value="client">Client - Inbox + Pipeline only</SelectItem>
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

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a shareable invite link</DialogTitle>
            <DialogDescription>Anyone with this link can create their own account and join the workspace, up to the seat limit. Valid for 30 days.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={linkRole} onValueChange={(v) => setLinkRole(v as "manager" | "client")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager - full access</SelectItem>
                  <SelectItem value="client">Client - Inbox + Pipeline only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Seat limit (max teammates)</label>
              <Input type="number" min={1} max={50} value={linkSeats} onChange={(e) => setLinkSeats(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await createLink.mutateAsync();
                setLinkOpen(false);
              }}
              disabled={createLink.isPending}
            >
              {createLink.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Generate link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
