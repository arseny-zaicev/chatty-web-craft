import { useOutletContext } from "react-router-dom";
import { Inbox, KanbanSquare, Megaphone, FileText, Phone } from "lucide-react";
import CRM from "@/pages/CRM";
import Pipeline from "@/pages/Pipeline";
import Campaigns from "@/pages/Campaigns";
import type { WorkspaceContext } from "./WorkspaceLayout";

const sections = {
  inbox: { icon: Inbox, title: "Inbox", desc: "All WhatsApp chats for this client." },
  pipeline: { icon: KanbanSquare, title: "Pipeline", desc: "Kanban board of deals for this client." },
  templates: { icon: FileText, title: "Templates", desc: "Templates and statuses for this client." },
  numbers: { icon: Phone, title: "Numbers", desc: "WhatsApp numbers connected to this client." },
  campaigns: { icon: Megaphone, title: "Campaigns", desc: "Campaigns for this client." },
} as const;

export default function WorkspaceSection({ section }: { section: keyof typeof sections }) {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const cfg = sections[section];
  const Icon = cfg.icon;

  if (!workspace) {
    return <div className="p-6 text-sm text-muted-foreground">Pick a client from the sidebar.</div>;
  }

  if (section === "inbox") return <CRM workspaceId={workspace.id} embedded />;
  if (section === "pipeline") return <Pipeline workspaceId={workspace.id} embedded />;
  if (section === "campaigns" || section === "templates" || section === "numbers") return <Campaigns workspaceId={workspace.id} embedded />;

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
