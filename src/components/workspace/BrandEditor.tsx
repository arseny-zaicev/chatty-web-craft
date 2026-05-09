import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { workspaceKeys } from "@/lib/workspaces";
import { toast } from "sonner";
import { Globe, Sparkles } from "lucide-react";
import { IskraLogo } from "@/components/IskraLogo";

const normalizeUrl = (s: string) => {
  const v = s.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};
const domainOf = (s: string) => {
  try { return new URL(normalizeUrl(s) ?? "").hostname.replace(/^www\./, ""); } catch { return null; }
};

export default function BrandEditor({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["workspace-brand", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, website_url, logo_url, color")
        .eq("id", workspaceId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [website, setWebsite] = useState("");
  const [logo, setLogo] = useState("");

  useEffect(() => {
    if (!data) return;
    setWebsite(data.website_url ?? "");
    setLogo(data.logo_url ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const websiteUrl = normalizeUrl(website);
      const dom = domainOf(website);
      const logoUrl = logo.trim() || (dom ? `https://logo.clearbit.com/${dom}` : null);
      const { error } = await supabase
        .from("workspaces")
        .update({ website_url: websiteUrl, logo_url: logoUrl })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Brand updated");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workspace-brand", workspaceId] }),
        qc.invalidateQueries({ queryKey: workspaceKeys.list }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const previewLogo = logo.trim() || (domainOf(website) ? `https://logo.clearbit.com/${domainOf(website)}` : null);
  const accent = data?.color ?? "#10b981";

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Brand</h2>
        <p className="text-sm text-muted-foreground">Used on the join screen and anywhere we co-brand with this client.</p>
      </div>

      <div className="rounded-xl border border-border p-5 space-y-4 bg-card/30">
        <div className="space-y-1.5">
          <Label htmlFor="ws-website">Website</Label>
          <div className="relative">
            <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input id="ws-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="salesforce.com" className="pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-logo">Logo URL (optional)</Label>
          <Input id="ws-logo" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="Auto-detected from website if empty" />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save brand"}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="w-3.5 h-3.5" /> Preview - join screen header</div>
        <div className="rounded-xl border border-border p-6 bg-gradient-to-br from-background to-muted/40">
          <div className="flex items-center justify-center gap-4">
            <IskraLogo size={36} textClass="text-base" />
            <span className="text-2xl text-muted-foreground/60 font-light">×</span>
            <div className="flex items-center gap-2">
              {previewLogo ? (
                <img src={previewLogo} alt="" className="w-9 h-9 rounded-md object-contain bg-white p-1" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-9 h-9 rounded-md flex items-center justify-center text-white font-semibold text-sm" style={{ background: accent }}>
                  {(data?.name ?? "?").slice(0, 1)}
                </div>
              )}
              <span className="font-display text-base font-semibold">{data?.name}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
