import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/hooks/use-org";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import SeoTab from "@/components/reports/SeoTab";
import { Navigate } from "react-router-dom";

export default function Seo() {
  const { orgName, orgId } = useOrg();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { orgRole, loading: orgRoleLoading } = useOrgRole(orgId);

  if (roleLoading || orgRoleLoading) {
    return null;
  }

  if (!isAdmin && orgRole !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Search className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">SEO Insights</h1>
        <Badge variant="outline" className="text-[9px] uppercase tracking-wider px-1.5 py-0 h-4 text-primary border-primary/30">Beta</Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Site health and search optimization for {orgName}</p>
      <SeoTab />
    </div>
  );
}
