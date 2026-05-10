import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Settings as SettingsIcon, Phone, FileText, Wrench, Users, Sparkles, KanbanSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import NumbersInventory from "@/components/workspace/NumbersInventory";
import TemplatesView from "@/components/workspace/TemplatesView";
import TeamView from "@/components/workspace/TeamView";
import BrandEditor from "@/components/workspace/BrandEditor";
import PipelinesView from "@/components/workspace/PipelinesView";
import type { WorkspaceContext } from "./WorkspaceLayout";

type Tab = "team" | "brand" | "pipelines" | "numbers" | "templates" | "debug";

export default function WorkspaceSettings() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const [tab, setTab] = useState<Tab>("team");

  if (!workspace) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-1"><SettingsIcon className="w-5 h-5 text-primary" /><h1 className="font-display text-2xl font-bold">Settings</h1></div>
        <p className="text-sm text-muted-foreground">Technical setup for {workspace.name}. Team, numbers, templates and provider config.</p>
        <div className="flex gap-1 mt-4 flex-wrap">
          <TabBtn active={tab === "team"} onClick={() => setTab("team")} icon={<Users className="w-3.5 h-3.5" />}>Team</TabBtn>
          <TabBtn active={tab === "brand"} onClick={() => setTab("brand")} icon={<Sparkles className="w-3.5 h-3.5" />}>Brand</TabBtn>
          <TabBtn active={tab === "numbers"} onClick={() => setTab("numbers")} icon={<Phone className="w-3.5 h-3.5" />}>Numbers</TabBtn>
          <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<FileText className="w-3.5 h-3.5" />}>Templates</TabBtn>
          <TabBtn active={tab === "debug"} onClick={() => setTab("debug")} icon={<Wrench className="w-3.5 h-3.5" />}>Provider / Debug</TabBtn>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "team" && <TeamView workspaceId={workspace.id} />}
        {tab === "brand" && <BrandEditor workspaceId={workspace.id} />}
        {tab === "numbers" && <NumbersInventory workspaceId={workspace.id} />}
        {tab === "templates" && <TemplatesView workspaceId={workspace.id} />}
        {tab === "debug" && (
          <div className="p-6 max-w-2xl space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-card/30 p-4">
              <div className="font-medium mb-1">Provider</div>
              <div className="text-muted-foreground">Gupshup. App IDs and API keys are configured per number under <button className="text-primary underline" onClick={() => setTab("numbers")}>Numbers</button>.</div>
            </div>
            <div className="rounded-lg border border-border bg-card/30 p-4">
              <div className="font-medium mb-1">Webhook</div>
              <div className="text-muted-foreground">Inbound replies are routed via the shared <code>whatsapp-webhook</code> function. Per-app callback can be re-set from Numbers.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TabBtn = ({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) => (
  <button onClick={onClick} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{icon}{children}</button>
);
