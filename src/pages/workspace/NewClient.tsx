import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { workspaceKeys } from "@/lib/workspaces";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32);

export default function NewClient() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [color, setColor] = useState("#10b981");

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in first");
      const finalSlug = slug || slugify(name);
      if (!name.trim() || !finalSlug) throw new Error("Name is required");
      const { data, error } = await supabase
        .from("workspaces")
        .insert({ name: name.trim(), slug: finalSlug, color, owner_user_id: auth.user.id })
        .select("slug")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (d) => {
      toast.success("Client added");
      await qc.invalidateQueries({ queryKey: workspaceKeys.list });
      navigate(`/ws/${d.slug}/inbox`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create client"),
  });

  return (
    <div className="p-6 max-w-md">
      <div className="flex items-center gap-2 mb-4"><Building2 className="w-5 h-5 text-primary" /><h2 className="font-display text-2xl">New client</h2></div>
      <div className="space-y-3 rounded-lg border border-border bg-card/30 p-5">
        <Field label="Display name"><Input value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} placeholder="Company16" /></Field>
        <Field label="Slug (URL)"><Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="company16" /></Field>
        <Field label="Color">
          <div className="flex gap-2 items-center"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded border border-border" /><Input value={color} onChange={(e) => setColor(e.target.value)} /></div>
        </Field>
        <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating..." : "Create client"}</Button>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
);
