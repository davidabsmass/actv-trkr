import {
  BarChart3,
  TableProperties,
  FileText,
  Download,
  Settings,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const telemetryItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Entries", url: "/entries", icon: TableProperties },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Exports", url: "/exports", icon: Download },
];

const settingsItems = [
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { orgName, orgs, orgId, setOrgId } = useOrg();
  const { signOut } = useAuth();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-bold text-sidebar-foreground tracking-tight">
            ACTV TRKR
          </span>
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 px-4">
            Configuration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
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
      </SidebarContent>

      <SidebarFooter className="p-4">
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
