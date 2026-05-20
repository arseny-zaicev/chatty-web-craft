import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Inline BM picker for a single whatsapp number.
 *  - Updates whatsapp_numbers.business_manager_id directly.
 *  - If `partnerId` is supplied and the chosen BM is not yet linked to that
 *    partner, we auto-create a bm_partner_assignments row at the partner's
 *    default rate so the BM shows up under that partner immediately.
 *  - Special value "__create__" opens a small dialog to create a brand-new BM.
 */
export function NumberBmPicker({
  numberId,
  currentBmId,
  workspaceId,
  partnerId,
  partnerDefaultRate,
  partnerRole = "provider",
  onChanged,
}: {
  numberId: string;
  currentBmId: string | null;
  workspaceId: string | null;
  partnerId?: string;
  partnerDefaultRate?: number;
  partnerRole?: string;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  // BMs available: scoped to partner if given, else all
  const { data: bms } = useQuery({
    queryKey: ["admin", "bm-picker", partnerId ?? "global"],
    queryFn: async () => {
      if (partnerId) {
        const { data: assigns } = await supabase
          .from("bm_partner_assignments")
          .select("business_manager_id, effective_to")
          .eq("partner_id", partnerId)
          .is("effective_to", null);
        const ids = Array.from(new Set((assigns ?? []).map((a: any) => a.business_manager_id)));
        if (!ids.length) return [] as any[];
        const { data } = await supabase
          .from("business_managers")
          .select("id, name, status")
          .in("id", ids)
          .order("name");
        return (data ?? []) as any[];
      }
      const { data } = await supabase
        .from("business_managers")
        .select("id, name, status")
        .order("name");
      return (data ?? []) as any[];
    },
  });

  const linkBmToPartner = async (bmId: string) => {
    if (!partnerId) return;
    const { data: existing } = await supabase
      .from("bm_partner_assignments")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("business_manager_id", bmId)
      .is("effective_to", null)
      .maybeSingle();
    if (existing) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("bm_partner_assignments").insert({
      business_manager_id: bmId,
      partner_id: partnerId,
      role: partnerRole,
      rate_usd: partnerDefaultRate ?? 0,
      created_by: u.user?.id,
    });
  };

  const setBm = useMutation({
    mutationFn: async (nextBmId: string | null) => {
      const patch: Record<string, unknown> = { business_manager_id: nextBmId };
      // If BM has a workspace and number has none, inherit it.
      if (nextBmId) {
        const { data: bm } = await supabase
          .from("business_managers")
          .select("workspace_id")
          .eq("id", nextBmId)
          .maybeSingle();
        if (!workspaceId && bm?.workspace_id) patch.workspace_id = bm.workspace_id;
        await linkBmToPartner(nextBmId);
      }
      const { error } = await supabase
        .from("whatsapp_numbers")
        .update(patch as any)
        .eq("id", numberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("BM updated");
      qc.invalidateQueries({ queryKey: ["admin", "ownership-global"] });
      qc.invalidateQueries({ queryKey: ["admin", "partner-ownership", partnerId] });
      qc.invalidateQueries({ queryKey: ["admin", "partner-numbers"] });
      qc.invalidateQueries({ queryKey: ["admin", "bm-picker"] });
      onChanged?.();
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const handleChange = (v: string) => {
    if (v === "__create__") {
      setCreateOpen(true);
      return;
    }
    if (v === "__none__") {
      setBm.mutate(null);
      return;
    }
    if (v === currentBmId) return;
    setBm.mutate(v);
  };

  return (
    <>
      <Select value={currentBmId ?? "__none__"} onValueChange={handleChange}>
        <SelectTrigger className="h-7 w-[160px] text-xs">
          <SelectValue placeholder="BM…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— none —</SelectItem>
          {(bms ?? []).map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name} <span className="text-muted-foreground text-[10px]">({b.status})</span>
            </SelectItem>
          ))}
          <SelectItem value="__create__">
            <span className="flex items-center gap-1 text-emerald-700">
              <Plus className="w-3 h-3" /> Create new BM
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <CreateBmInlineDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        partnerId={partnerId}
        partnerDefaultRate={partnerDefaultRate}
        partnerRole={partnerRole}
        onCreated={async (bmId) => {
          setCreateOpen(false);
          setBm.mutate(bmId);
        }}
      />
    </>
  );
}

function CreateBmInlineDialog({
  open,
  onOpenChange,
  workspaceId,
  partnerId,
  partnerDefaultRate,
  partnerRole,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | null;
  partnerId?: string;
  partnerDefaultRate?: number;
  partnerRole?: string;
  onCreated: (bmId: string) => void;
}) {
  const [name, setName] = useState("");
  const [metaId, setMetaId] = useState("");
  const [status, setStatus] = useState("warming_up");

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("BM name required");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: bm, error } = await supabase
        .from("business_managers")
        .insert({
          name: name.trim(),
          meta_bm_id: metaId.trim() || null,
          status,
          workspace_id: workspaceId,
          provider: "gupshup",
          verification_status: "unverified",
          warmup_started_at: status === "warming_up" ? new Date().toISOString() : null,
          created_by: u.user.id,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      // Link to partner if provided
      if (partnerId) {
        await supabase.from("bm_partner_assignments").insert({
          business_manager_id: bm.id,
          partner_id: partnerId,
          role: partnerRole ?? "provider",
          rate_usd: partnerDefaultRate ?? 0,
          created_by: u.user.id,
        });
      }
      return bm.id as string;
    },
    onSuccess: (bmId) => {
      toast.success("BM created");
      setName("");
      setMetaId("");
      setStatus("warming_up");
      onCreated(bmId);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> New Business Manager
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">BM name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ISKRA-BM-05" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Meta BM ID</label>
            <Input value={metaId} onChange={(e) => setMetaId(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warming_up">warming_up</SelectItem>
                <SelectItem value="verifying">verifying</SelectItem>
                <SelectItem value="ready">ready</SelectItem>
                <SelectItem value="disabled">disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {partnerId && (
            <p className="text-[11px] text-muted-foreground">
              Will be auto-linked to this partner at ${(partnerDefaultRate ?? 0).toFixed(4)}/delivered.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create & attach"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
