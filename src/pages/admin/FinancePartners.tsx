import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type Partner = {
  id: string; name: string; contact_email: string | null; contact_phone: string | null;
  default_payout_rate_usd: number; currency: string; status: string;
};

export default function FinancePartners() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: partners, isLoading } = useQuery({
    queryKey: ["finance", "partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners")
        .select("*").order("name");
      if (error) throw error;
      return data as Partner[];
    },
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Admin</Button></Link>
            <h1 className="font-display text-2xl">Finance · Partners</h1>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />New partner</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>All partners</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Email</TableHead>
                  <TableHead>Default rate</TableHead><TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(partners || []).map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.contact_email || "-"}</TableCell>
                      <TableCell>${Number(p.default_payout_rate_usd).toFixed(4)}</TableCell>
                      <TableCell>{p.currency}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Link to={`/admin/finance/partners/${p.id}`}>
                          <Button variant="ghost" size="sm">Open</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!partners?.length && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No partners yet. Create one to start tracking payouts.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <NewPartnerDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["finance", "partners"] })} />
    </div>
  );
}

function NewPartnerDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rate, setRate] = useState("0");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("partners").insert({
        name: name.trim(),
        contact_email: email.trim() || null,
        default_payout_rate_usd: Number(rate) || 0,
        payment_notes: notes.trim() || null,
        created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Partner created");
      onCreated(); onOpenChange(false);
      setName(""); setEmail(""); setRate("0"); setNotes("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New partner</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Nitish" /></Field>
          <Field label="Contact email"><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="partner@example.com" /></Field>
          <Field label="Default payout rate per delivered ($)"><Input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} /></Field>
          <Field label="Payment notes"><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Wise, IBAN, etc." /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
);
