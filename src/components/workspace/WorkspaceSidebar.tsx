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
import { useWorkspaceAccess, isManagerLike, isAdmin } from "@/lib/workspaceRole";

const overviewTab = { key: "overview", label: "Overview", icon: LayoutDashboard };
const campaignsTab = { key: "campaigns", label: "Campaigns", icon: Megaphone };
const baseClientTabs = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "pipeline", label: "Pipeline", icon: KanbanSquare },
];
const managerExtras = [
  { key: "data", label: "Data", icon: Database },
  { key: "materials", label: "Materials", icon: FolderOpen },
  { key: "library", label: "Quick replies", icon: BookOpen },
];
const setupTabs = [
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export function WorkspaceSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { slug } = useParams<{ slug?: string }>();
  const { data: workspaces, isLoading } = useQuery({ queryKey: workspaceKeys.list, queryFn: fetchWorkspaces });
  const currentWs = (workspaces ?? []).find((w: Workspace) => w.slug === slug);
  const { data: access } = useWorkspaceAccess(currentWs?.id);
  const role = access?.role;
  const canManage = isManagerLike(role);
  const canLaunch = isAdmin(role);
  const canSeeStats = canManage || (role === "client" && Boolean(access?.canViewStats));

  const clientTabs = [
    ...(canSeeStats ? [overviewTab] : []),
    ...baseClientTabs,
    ...(canSeeStats ? [campaignsTab] : []),
  ];
  const opsTabs = canManage ? [...clientTabs, ...managerExtras] : clientTabs;

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

        {slug && slug !== "new" && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>{!collapsed && "Operations"}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {opsTabs.map((t) => (
                    <SidebarMenuItem key={t.key}>
                      <SidebarMenuButton asChild tooltip={t.label}>
                        <NavLink
                          to={`/ws/${slug}/${t.key}`}
                          end={t.key === "overview"}
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

            {canManage && (
              <SidebarGroup>
                <SidebarGroupLabel>{!collapsed && "Setup"}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {setupTabs.map((t) => (
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
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

