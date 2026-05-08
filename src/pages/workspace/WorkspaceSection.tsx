import { useOutletContext } from "react-router-dom";
import { Inbox, KanbanSquare, Megaphone, FileText, Phone, BookOpen } from "lucide-react";
import CRM from "@/pages/CRM";
import Pipeline from "@/pages/Pipeline";
import Campaigns from "@/pages/Campaigns";
import TemplatesView from "@/components/workspace/TemplatesView";
import NumbersInventory from "@/components/workspace/NumbersInventory";
import WorkspaceLibrary from "@/components/workspace/WorkspaceLibrary";
import type { WorkspaceContext } from "./WorkspaceLayout";

const sections = {
  inbox: { icon: Inbox, title: "Inbox", desc: "All WhatsApp chats for this client." },
  pipeline: { icon: KanbanSquare, title: "Pipeline", desc: "Kanban board of deals for this client." },
  templates: { icon: FileText, title: "Templates", desc: "Templates and statuses for this client." },
  numbers: { icon: Phone, title: "Numbers", desc: "WhatsApp numbers connected to this client." },
  campaigns: { icon: Megaphone, title: "Campaigns", desc: "Campaigns for this client." },
  library: { icon: BookOpen, title: "Library", desc: "Saved replies, links and custom fields." },
} as const;

export default function WorkspaceSection({ section }: { section: keyof typeof sections }) {
  const { workspace } = useOutletContext<WorkspaceContext>();

  if (!workspace) {
    return <div className="p-6 text-sm text-muted-foreground">Pick a client from the sidebar.</div>;
  }

  if (section === "inbox") return <CRM workspaceId={workspace.id} embedded />;
  if (section === "pipeline") return <Pipeline workspaceId={workspace.id} embedded />;
  if (section === "templates") return <TemplatesView workspaceId={workspace.id} />;
  if (section === "numbers") return <NumbersInventory workspaceId={workspace.id} />;
  if (section === "campaigns") return <Campaigns workspaceId={workspace.id} embedded />;
  if (section === "library") return <WorkspaceLibrary workspaceId={workspace.id} />;

  return null;
}


