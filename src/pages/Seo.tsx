import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/hooks/use-org";
import SeoTab from "@/components/reports/SeoTab";
import { Navigate } from "react-router-dom";

export default function Seo() {
  const { orgName, orgId, loading: orgLoading } = useOrg();

  if (orgLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgId) {
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

