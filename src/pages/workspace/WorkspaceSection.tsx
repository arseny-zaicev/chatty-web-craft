import { Link, useOutletContext } from "react-router-dom";
import { ExternalLink, Inbox, KanbanSquare, Megaphone, FileText, Phone, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceContext } from "./WorkspaceLayout";

const sections = {
  inbox: { icon: Inbox, title: "Inbox", desc: "All WhatsApp chats for this client. Star, pin, mark as read.", link: "/crm" },
  pipeline: { icon: KanbanSquare, title: "Pipeline", desc: "Kanban board of deals. Drag cards across stages.", link: "/pipeline" },
  templates: { icon: FileText, title: "Templates", desc: "Approved Gupshup templates with statuses (approved / pending / rejected).", link: "/campaigns" },
  numbers: { icon: Phone, title: "Numbers", desc: "WhatsApp numbers connected to this workspace.", link: "/campaigns" },
  campaigns: { icon: Megaphone, title: "Campaigns", desc: "Past and active broadcasts with delivery, read, and reply stats.", link: "/campaigns" },
} as const;

export default function WorkspaceSection({ section }: { section: keyof typeof sections }) {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const cfg = sections[section];
  const Icon = cfg.icon;
  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Icon className="w-5 h-5 text-primary" />
        <h2 className="font-display text-2xl">{cfg.title}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{cfg.desc}</p>
      <div className="rounded-lg border border-border bg-card/30 p-6">
        <div className="text-sm text-muted-foreground mb-3">
          {workspace ? `Workspace: ${workspace.name}` : "Pick a client from the sidebar."}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={cfg.link}><ExternalLink className="w-4 h-4 mr-1" />Open full view</Link>
          </Button>
          {workspace && (
            <Button asChild variant="default" size="sm">
              <Link to={`/ws/${workspace.slug}/launch`}><Rocket className="w-4 h-4 mr-1" />Launch campaign</Link>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Per-workspace filtered views are coming next - for now this opens the global view that already shows your data.
        </p>
      </div>
    </div>
  );
}
