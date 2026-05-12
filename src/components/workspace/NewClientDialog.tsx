import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { workspaceKeys } from "@/lib/workspaces";
import { portfolioKeys } from "@/lib/portfolioMetrics";
import { toast } from "sonner";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32);

export function NewClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [color, setColor] = useState("#10b981");
  const [website, setWebsite] = useState("");
  const [logo, setLogo] = useState("");
  const [rate, setRate] = useState("0");
  const [internalCode, setInternalCode] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");

  const reset = () => { setName(""); setSlug(""); setColor("#10b981"); setWebsite(""); setLogo(""); setRate("0"); setInternalCode(""); setSlackChannelId(""); };

  const normalizeUrl = (s: string) => {
    const v = s.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    return `https://${v}`;
  };
  const domainOf = (s: string) => {
    try { return new URL(normalizeUrl(s) ?? "").hostname.replace(/^www\./, ""); } catch { return null; }
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in first");
      const finalSlug = slug || slugify(name);
      if (!name.trim()) throw new Error("Name is required");
      if (!finalSlug) throw new Error("Slug is required");
      const websiteUrl = normalizeUrl(website);
      const dom = domainOf(website);
      const logoUrl = logo.trim() || (dom ? `https://logo.clearbit.com/${dom}` : null);
      const { data, error } = await supabase
        .from("workspaces")
        .insert({ name: name.trim(), slug: finalSlug, color, owner_user_id: auth.user.id, website_url: websiteUrl, logo_url: logoUrl, delivered_rate_usd: Number(rate) || 0 })
        .select("slug")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error(`Slug "${finalSlug}" is already taken. Pick a different one.`);
        throw error;
      }
      return data;
    },
    onSuccess: async (d) => {
      toast.success("Client added");
      await Promise.all([
        qc.invalidateQueries({ queryKey: workspaceKeys.list }),
        qc.invalidateQueries({ queryKey: portfolioKeys.snapshot }),
      ]);
      onOpenChange(false);
      reset();
      navigate(`/ws/${d.slug}/overview`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create client"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>Create a new workspace to manage their inbox, campaigns and reporting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Display name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }}
              placeholder="Company 16"
            />
          </Field>
          <Field label="Slug (URL)">
            <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="company16" />
          </Field>
          <Field label="Color">
            <div className="flex gap-2 items-center">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded border border-border" />
              <Input value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </Field>
          <Field label="Website">
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="salesforce.com" />
          </Field>
          <Field label="Logo URL (optional)">
            <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="Auto-detected from website if empty" />
          </Field>
          <Field label="Rate per delivered message ($)">
            <Input type="number" step="0.001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Creating…" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    {children}
  </div>
);
