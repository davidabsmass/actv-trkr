import {
  BarChart3, TableProperties, FileText, Download, Settings, LogOut,
  ChevronDown, Building2, Shield, LayoutDashboard, ClipboardList,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const telemetryItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Entries", url: "/entries", icon: TableProperties },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Exports", url: "/exports", icon: Download },
];

export function AppSidebar() {
  const { orgName, orgs, orgId, setOrgId } = useOrg();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { orgRole } = useOrgRole(orgId);

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-sidebar-foreground tracking-tight">
            ACTV TRKR
          </span>
          {isAdmin && (
            <Badge variant="outline" className="text-[9px] uppercase text-primary border-primary/20">
              Admin
            </Badge>
          )}
        </div>

        {orgs.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-sidebar-accent rounded-md text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors">
                <span className="truncate">{orgName ?? "Select org"}</span>
                <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0 text-sidebar-foreground/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {orgs.map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  onClick={() => setOrgId(o.id)}
                  className={o.id === orgId ? "bg-accent" : ""}
                >
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="px-3 py-2 text-xs font-medium bg-sidebar-accent rounded-md text-sidebar-foreground truncate">
            {orgName ?? "—"}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 px-4">
            Telemetry
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {telemetryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground/70 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin-only section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 px-4">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/clients"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground/70 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <Building2 className="h-4 w-4" />
                      <span>Clients</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/agency"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground/70 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Agency Overview</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin-setup"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground/70 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span>Setup & Inputs</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/settings"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground/70 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="px-4 py-1.5 mb-2">
          <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
          {orgRole && (
            <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-wider">{orgRole}</p>
          )}
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground/60 rounded-md hover:bg-destructive/20 hover:text-destructive transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
