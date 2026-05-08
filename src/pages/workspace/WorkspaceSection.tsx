import { useOutletContext } from "react-router-dom";
import CRM from "@/pages/CRM";
import Pipeline from "@/pages/Pipeline";
import TemplatesView from "@/components/workspace/TemplatesView";
import NumbersInventory from "@/components/workspace/NumbersInventory";
import WorkspaceLibrary from "@/components/workspace/WorkspaceLibrary";
import WorkspaceCampaigns from "@/pages/workspace/WorkspaceCampaigns";
import type { WorkspaceContext } from "./WorkspaceLayout";

type Section = "inbox" | "pipeline" | "templates" | "numbers" | "campaigns" | "library";

export default function WorkspaceSection({ section }: { section: Section }) {
  const { workspace } = useOutletContext<WorkspaceContext>();

  if (!workspace) {
    return <div className="p-6 text-sm text-muted-foreground">Pick a client from the sidebar.</div>;
  }

  if (section === "inbox") return <CRM workspaceId={workspace.id} embedded />;
  if (section === "pipeline") return <Pipeline workspaceId={workspace.id} embedded />;
  if (section === "templates") return <TemplatesView workspaceId={workspace.id} />;
  if (section === "numbers") return <NumbersInventory workspaceId={workspace.id} />;
  if (section === "campaigns") return <WorkspaceCampaigns workspaceId={workspace.id} slug={workspace.slug} />;
  if (section === "library") return <WorkspaceLibrary workspaceId={workspace.id} />;

  return null;
}


