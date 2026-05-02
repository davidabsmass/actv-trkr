import {
  TableProperties, Settings, LogOut, UserCircle,
  ChevronDown, Building2, Shield, ClipboardList, Activity, Bell,
  LayoutDashboard, TrendingUp, Users, Search, FileText, ShieldAlert,
  ShieldCheck, Route as RouteIcon, Contact,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import { useSeoVisibility } from "@/hooks/use-seo-visibility";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteSwitcher } from "@/components/sites/SiteSwitcher";
import actvTrkrLogo from "@/assets/actv-trkr-logo-white.svg";
import { useTranslation } from "react-i18next";

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  titleKey: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const telemetryItems: NavItem[] = [
  { titleKey: "sidebar.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { titleKey: "sidebar.performance", url: "/performance", icon: TrendingUp },
  { titleKey: "Visitor Journeys", url: "/visitor-journeys", icon: RouteIcon },
  { titleKey: "Site Contacts", url: "/site-contacts", icon: Contact },
  { titleKey: "sidebar.reports", url: "/reports", icon: FileText },
  { titleKey: "sidebar.forms", url: "/forms", icon: TableProperties },
  { titleKey: "sidebar.monitoring", url: "/monitoring", icon: Activity },
  { titleKey: "Site Integrity", url: "/site-integrity", icon: ShieldAlert },
  { titleKey: "sidebar.seo", url: "/seo", icon: Search },
];

export function AppSidebar() {
  const { orgName, orgs, orgId, setOrgId, loading: orgLoading } = useOrg();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { orgRole, loading: orgRoleLoading } = useOrgRole(orgId);
  const { seoVisible, seoAdvanced } = useSeoVisibility();
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar className="border-r-0 [&>[data-sidebar=sidebar]]:bg-transparent" style={{ background: "var(--sidebar-gradient)" }}>
      <SidebarHeader className="p-3 pt-6 md:p-5 md:pt-[62px]">
        <div className="mb-1">
          <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-8 md:h-10 w-auto" />
        </div>
        <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-white/80 border border-white/30 bg-white/10 rounded-full w-fit mb-1 md:mb-4">{t("sidebar.beta")}</span>

        {orgs.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-white/15 rounded-md text-white hover:bg-white/25 transition-colors">
                <span className="truncate">{orgName ?? "—"}</span>
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
        )}

        {/* Site switcher: lists connected sites and offers "Add another site". */}
        {orgId && <SiteSwitcher />}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-white/50 px-4">
            {t("sidebar.dashboard")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {telemetryItems
                .filter((item) => {
                  // Hide SEO nav item if seo is not visible for this user
                  if (item.url === "/seo" && !seoVisible) return false;
                  // Site Contacts is owner-only
                  if (item.url === "/site-contacts" && user?.email?.toLowerCase() !== "david@newuniformdesign.com") return false;
                  return true;
                })
                .map((item) => {
                  // SEO label: only the owner sees full "SEO"; everyone else sees "Search Visibility"
                  const isOwner = user?.email?.toLowerCase() === "david@newuniformdesign.com";
                  const label = item.url === "/seo" && !isOwner
                    ? "Search Visibility"
                    : t(item.titleKey);
                  return (
                    <SidebarMenuItem key={item.titleKey}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end
                          onClick={closeMobileNav}
                          className="flex items-center gap-3 px-4 py-1.5 md:py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                          activeClassName="bg-white/20 text-white font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin-only section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-white/50 px-4">
              {t("sidebar.admin")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/clients"
                      onClick={closeMobileNav}
                      className="flex items-center gap-3 px-4 py-1.5 md:py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                      activeClassName="bg-white/20 text-white font-medium"
                    >
                      <Users className="h-4 w-4" />
                      <span>{t("sidebar.users")}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin-setup"
                      onClick={closeMobileNav}
                      className="flex items-center gap-3 px-4 py-1.5 md:py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                      activeClassName="bg-white/20 text-white font-medium"
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span>{t("sidebar.clients")}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {user?.email?.toLowerCase() === "david@newuniformdesign.com" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/pipeline-status"
                        onClick={closeMobileNav}
                        className="flex items-center gap-3 px-4 py-1.5 md:py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                        activeClassName="bg-white/20 text-white font-medium"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>Pipeline Status</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Settings — visible to org admins and global admins, or while still loading */}
        {(isAdmin || !!orgRole || orgRoleLoading) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/settings"
                      onClick={closeMobileNav}
                      className="flex items-center gap-3 px-4 py-1.5 md:py-2.5 text-sm text-white/70 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
                      activeClassName="bg-white/20 text-white font-medium"
                    >
                      <Settings className="h-4 w-4" />
                      <span>{t("sidebar.settings")}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2 md:p-4">
        <div className="px-4 py-1 mb-1 md:py-1.5 md:mb-2">
          <p className="text-xs text-white/50 truncate">{user?.email}</p>
          {orgRole && (
            <p className="text-xs text-white/40 uppercase tracking-wider">{orgRole}</p>
          )}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/account"
                onClick={closeMobileNav}
                className="flex items-center gap-3 px-4 py-1.5 md:py-2.5 text-sm text-white/60 rounded-lg hover:bg-white/15 hover:text-white transition-colors w-full"
                activeClassName="bg-white/20 text-white font-medium"
              >
                <UserCircle className="h-4 w-4" />
                <span>{t("sidebar.account")}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <LanguageSwitcher variant="sidebar" />
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-3 px-4 py-1.5 md:py-2.5 text-sm text-white/60 rounded-lg hover:bg-white/15 hover:text-white transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>{t("sidebar.signOut")}</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
