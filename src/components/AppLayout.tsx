import { Outlet, Navigate, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OrgProvider, useOrg } from "@/hooks/use-org";
import { useUserRole } from "@/hooks/use-user-role";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

function LayoutInner() {
  const { orgId, orgs, loading } = useOrg();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgs.length) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b border-border px-4 shrink-0">
            <SidebarTrigger />
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate("/admin-setup")} className="gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Admin
              </Button>
            )}
          </header>
          <div className="flex-1 overflow-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default function AppLayout() {
  return (
    <OrgProvider>
      <LayoutInner />
    </OrgProvider>
  );
}
