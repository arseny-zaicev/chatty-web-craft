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

  if (!workspace) {
    return <div className="p-6 text-sm text-muted-foreground">Pick a client from the sidebar.</div>;
  }

  if (section === "inbox") return <CRM workspaceId={workspace.id} embedded />;
  if (section === "pipeline") return <Pipeline workspaceId={workspace.id} embedded />;
  if (section === "campaigns" || section === "templates" || section === "numbers") return <Campaigns workspaceId={workspace.id} embedded />;

  return null;
}
