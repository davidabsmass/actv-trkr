import { useState, useEffect } from "react";
import { Outlet, Navigate, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OrgProvider, useOrg } from "@/hooks/use-org";
import { useUserRole } from "@/hooks/use-user-role";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import actvTrkrLogo from "@/assets/actv-trkr-logo-dark.svg";

function LayoutInner() {
  const { orgId, orgs, loading } = useOrg();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [redeemingInvite, setRedeemingInvite] = useState(false);

  useEffect(() => {
    if (loading || orgs.length > 0) return;

    const pendingCode = localStorage.getItem("pending_invite_code");
    if (!pendingCode) return;

    setRedeemingInvite(true);
    localStorage.removeItem("pending_invite_code");

    supabase.functions
      .invoke("redeem-invite", { body: { code: pendingCode } })
      .then(({ data, error }) => {
        if (!error && data && !data.error) {
          queryClient.invalidateQueries({ queryKey: ["orgs"] });
        }
      })
      .catch((e) => console.error("Pending invite redeem failed:", e))
      .finally(() => setRedeemingInvite(false));
  }, [loading, orgs.length, queryClient]);

  if (loading || redeemingInvite) {
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
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <img src={actvTrkrLogo} alt="ACTV TRKR" className="h-[34px] w-auto" />
            </div>
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
