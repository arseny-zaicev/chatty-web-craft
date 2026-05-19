import { NavLink, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, LayoutDashboard, Inbox, KanbanSquare, Megaphone, Rocket, Loader2, BookOpen, Settings as SettingsIcon, Database, FolderOpen } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { fetchWorkspaces, workspaceKeys, type Workspace } from "@/lib/workspaces";
import { useWorkspaceAccess, type PermKey } from "@/lib/workspaceRole";

type Tab = { key: string; label: string; icon: typeof Inbox; perm: PermKey; end?: boolean };

const OPS_TABS: Tab[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, perm: "perm_overview", end: true },
  { key: "inbox", label: "Inbox", icon: Inbox, perm: "perm_inbox" },
  { key: "pipeline", label: "Pipeline", icon: KanbanSquare, perm: "perm_pipeline" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, perm: "perm_campaigns_view" },
  { key: "data", label: "Data", icon: Database, perm: "perm_data" },
  { key: "materials", label: "Materials", icon: FolderOpen, perm: "perm_materials" },
  { key: "library", label: "Quick replies", icon: BookOpen, perm: "perm_quick_replies_use" },
];

const SETUP_TABS: Tab[] = [
  { key: "settings", label: "Settings", icon: SettingsIcon, perm: "perm_settings" },
];

export function WorkspaceSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { slug } = useParams<{ slug?: string }>();
  const { data: workspaces, isLoading } = useQuery({ queryKey: workspaceKeys.list, queryFn: fetchWorkspaces });
  const currentWs = (workspaces ?? []).find((w: Workspace) => w.slug === slug);
  const { data: access } = useWorkspaceAccess(currentWs?.id);
  const permissions = access?.permissions;

  const visibleOps = OPS_TABS.filter((t) => permissions?.[t.perm]);
  const visibleSetup = SETUP_TABS.filter((t) => permissions?.[t.perm]);
  const canLaunch = Boolean(permissions?.perm_launch);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" />{!collapsed && "Clients"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading && <div className="px-3 py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
              {(workspaces ?? []).map((w) => (
                <SidebarMenuItem key={w.id}>
                  <SidebarMenuButton asChild isActive={slug === w.slug} tooltip={w.name}>
                    <NavLink to={`/ws/${w.slug}/inbox`} className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: w.color }} />
                      {!collapsed && <span className="truncate">{w.name}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {slug && slug !== "new" && visibleOps.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && "Operations"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleOps.map((t) => (
                  <SidebarMenuItem key={t.key}>
                    <SidebarMenuButton asChild tooltip={t.label}>
                      <NavLink
                        to={`/ws/${slug}/${t.key}`}
                        end={t.end}
                        className={({ isActive }) => `flex items-center gap-2 ${isActive ? "bg-muted text-foreground" : ""}`}
                      >
                        <t.icon className="w-4 h-4" />
                        {!collapsed && <span>{t.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {canLaunch && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Launch campaign">
                      <NavLink
                        to={`/ws/${slug}/launch`}
                        className={({ isActive }) => `flex items-center gap-2 ${isActive ? "bg-primary/10 text-primary" : "text-primary"}`}
                      >
                        <Rocket className="w-4 h-4" />
                        {!collapsed && <span>Launch</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {slug && slug !== "new" && visibleSetup.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && "Setup"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleSetup.map((t) => (
                  <SidebarMenuItem key={t.key}>
                    <SidebarMenuButton asChild tooltip={t.label}>
                      <NavLink
                        to={`/ws/${slug}/${t.key}`}
                        className={({ isActive }) => `flex items-center gap-2 ${isActive ? "bg-muted text-foreground" : ""}`}
                      >
                        <t.icon className="w-4 h-4" />
                        {!collapsed && <span>{t.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
