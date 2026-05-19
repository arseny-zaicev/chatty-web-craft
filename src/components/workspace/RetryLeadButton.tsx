import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  dealId: string;
  initialPhone: string | null;
};

type LeadRow = {
  id: string;
  phone: string;
  error: string | null;
  status: string;
};

/** Small "Retry" button shown on deals that sit in the pipeline's failed_stage.
 *  Opens a dialog: lets the user fix the phone number and resend the lead via
 *  the `retry_lead_import` RPC. Resets the lead to `pending` so lead-dispatch
 *  picks it up on the next tick and the dispatcher creates a fresh deal. */
export default function RetryLeadButton({ dealId, initialPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [phone, setPhone] = useState(initialPhone ?? "");

  const openDialog = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    setLoading(true);
    const { data, error } = await supabase
      .from("lead_imports")
      .select("id, phone, error, status")
      .eq("deal_id", dealId)
      .maybeSingle();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("Lead not found for this card");
      return;
    }
    setLead(data as LeadRow);
    setPhone(data.phone);
  };

  const submit = async () => {
    if (!lead) return;
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 7) {
      toast.error("Phone looks too short");
      return;
    }
    setLoading(true);
    const { error } = await supabase.rpc("retry_lead_import", {
      p_lead_id: lead.id,
      p_new_phone: cleaned,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lead queued for resend");
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={openDialog}
        className="text-[10px] px-2 py-1 rounded border border-amber-500/40 text-amber-600 hover:bg-amber-500/10 flex items-center gap-1"
        title="Fix phone & resend"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Fix number and resend</DialogTitle>
          </DialogHeader>
          {loading && !lead ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {lead?.error && (
                <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
                  {lead.error}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Phone (include country code, e.g. 4917612345678)
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="49176..."
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                On Save the lead returns to the sending queue and this card disappears.
                A fresh card will appear in the first stage when the message is sent.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading || !lead}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & resend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
