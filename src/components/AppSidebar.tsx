import {
  TableProperties, Settings, LogOut, UserCircle,
  ChevronDown, Building2, Shield, ClipboardList, Activity, Bell,
  LayoutDashboard, TrendingUp,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import { NotificationBell } from "@/components/NotificationBell";
import actvTrkrLogo from "@/assets/actv-trkr-logo-white.svg";

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const telemetryItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Performance", url: "/performance", icon: TrendingUp },
  { title: "Forms", url: "/forms", icon: TableProperties },
  { title: "Monitoring", url: "/monitoring", icon: Activity },
];

export function AppSidebar() {
  const { orgName, orgs, orgId, setOrgId } = useOrg();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { orgRole } = useOrgRole(orgId);

  return (
    <Sidebar className="border-r-0 [&>[data-sidebar=sidebar]]:bg-transparent" style={{ background: "var(--sidebar-gradient)" }}>
      <SidebarHeader className="p-5 pt-[62px]">
        <div className="mb-1">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-10 w-auto" />
        </div>
        <span className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/80 border border-white/30 bg-white/10 rounded-full w-fit mb-4">Beta</span>

        {orgs.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-white/15 rounded-md text-white hover:bg-white/25 transition-colors">
                <span className="truncate">{orgName ?? "Select org"}</span>
                <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0 text-white/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {orgs.map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  onClick={() => setOrgId(o.id)}
                  className={o.id === orgId ? "font-medium" : ""}
                >
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="px-3 py-2 text-xs font-medium bg-white/15 rounded-md text-white truncate">
            {orgName ?? "—"}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-white/50 px-4">
            Dashboard
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {telemetryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                      activeClassName="bg-white/20 text-white font-medium"
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
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-white/50 px-4">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/clients"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                      activeClassName="bg-white/20 text-white font-medium"
                    >
                      <Building2 className="h-4 w-4" />
                      <span>Clients</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin-setup"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                      activeClassName="bg-white/20 text-white font-medium"
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span>Setup & Inputs</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Settings — visible to org admins and global admins */}
        {(isAdmin || !!orgRole) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/settings"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                      activeClassName="bg-white/20 text-white font-medium"
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
          <p className="text-xs text-white/50 truncate">{user?.email}</p>
          {orgRole && (
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{orgRole}</p>
          )}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/account"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/60 rounded-lg hover:bg-white/15 hover:text-white transition-colors w-full"
                activeClassName="bg-white/20 text-white font-medium"
              >
                <UserCircle className="h-4 w-4" />
                <span>Account</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/60 rounded-lg hover:bg-white/15 hover:text-white transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
