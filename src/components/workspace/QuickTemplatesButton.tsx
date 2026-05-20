// Inbox composer button: send an approved Meta-template to re-open conversations
// after the 24h window. Uses admin-curated `workspace_quick_template_groups`.
//
// Auto-picks the variant whose `whatsapp_number_id` matches this chat. If no
// approved variant exists for the current number, the button is disabled with
// a tooltip explaining why - so setters can't accidentally send a template
// that belongs to a different number.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  fetchQuickTemplateGroupsResolved, quickTemplatesKey,
} from "@/lib/quickTemplates";
import {
  fetchLaunchEssentials, fetchTemplateGroups, groupLogicalTemplates,
} from "@/lib/launchData";
import { usePerm } from "@/lib/workspaceRole";

export default function QuickTemplatesButton({
  workspaceId,
  conversationId,
  conversationNumberId,
  disabled,
}: {
  workspaceId?: string;
  conversationId?: string;
  conversationNumberId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const canUse = usePerm(workspaceId, "perm_quick_replies_use");

  const { data: resolved = [], isLoading } = useQuery({
    queryKey: quickTemplatesKey.list(workspaceId ?? ""),
    queryFn: () => fetchQuickTemplateGroupsResolved(workspaceId!),
    enabled: !!workspaceId && canUse,
  });

  const { data: essentials } = useQuery({
    queryKey: ["launch-essentials", workspaceId],
    queryFn: () => fetchLaunchEssentials(workspaceId!),
    enabled: !!workspaceId && canUse && resolved.length > 0,
  });

  const { data: allGroups = [] } = useQuery({
    queryKey: ["template-groups-all", workspaceId],
    queryFn: () => fetchTemplateGroups(workspaceId!),
    enabled: !!workspaceId && canUse && resolved.length > 0,
  });

  const logicalByGroupId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof groupLogicalTemplates>[number]>();
    if (!essentials) return map;
    for (const l of groupLogicalTemplates(essentials.templates, allGroups)) {
      if (l.key.startsWith("group:")) map.set(l.key.slice("group:".length), l);
    }
    return map;
  }, [essentials, allGroups]);

  // Hide entirely if no quick replies configured OR user lacks permission.
  if (!canUse || resolved.length === 0) return null;

  const send = async (templateGroupId: string) => {
    if (!conversationId) return;
    setSendingId(templateGroupId);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-template", {
        body: { conversation_id: conversationId, template_group_id: templateGroupId },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            detail = body?.error || body?.debug?.provider_message || detail;
          } catch { /* ignore */ }
        }
        throw new Error(detail);
      }
      const d = data as { error?: string };
      if (d?.error) throw new Error(d.error);
      toast.success("Template sent");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send template");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1.5 px-2.5 rounded-md text-xs font-medium"
          disabled={disabled}
          title="Send approved template (re-opens 24h window)"
        >
          <Zap className="w-3.5 h-3.5" />
          Templates
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[340px] p-0">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-medium">Approved templates</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Picks the variant matching this chat's WhatsApp number.
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : (
            resolved.map(({ quick, group }) => {
              const logical = logicalByGroupId.get(group.id);
              const variant = conversationNumberId
                ? logical?.variantByNumber.get(conversationNumberId)
                : undefined;
              const blocked = !variant;
              const sending = sendingId === group.id;
              return (
                <button
                  key={quick.id}
                  disabled={blocked || sending || !conversationId}
                  onClick={() => send(group.id)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b border-border/40 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  title={blocked ? "No approved variant for this chat's WhatsApp number" : variant?.name}
                >
                  <div className="flex items-center gap-2">
                    {blocked ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate flex-1">
                      {quick.label || group.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {group.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5 pl-5">
                    {blocked
                      ? "No approved variant for this number"
                      : (variant?.body ?? `Template: ${variant?.name}`).slice(0, 120)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
