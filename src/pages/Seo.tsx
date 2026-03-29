import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/hooks/use-org";
import SeoTab from "@/components/reports/SeoTab";
import SeoSummaryView from "@/components/seo/SeoSummaryView";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSeoVisibility } from "@/hooks/use-seo-visibility";

export default function Seo() {
  const { orgName, orgId, loading: orgLoading } = useOrg();
  const { t } = useTranslation();
  const { effectiveLevel, seoVisible, seoAdvanced, loading: seoLoading } = useSeoVisibility();

  if (orgLoading || seoLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgId) {
    return <Navigate to="/dashboard" replace />;
  }

  // If SEO is hidden for this user, redirect to dashboard
  if (!seoVisible) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Search className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">
          {seoAdvanced ? t("seo.title") : "Search Visibility"}
        </h1>
        <Badge variant="outline" className="text-xs uppercase tracking-wider px-1.5 py-0 h-4 text-primary border-primary/30">
          {t("sidebar.beta")}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {seoAdvanced
          ? t("seo.subtitle", { orgName })
          : `Search visibility overview for ${orgName}`}
      </p>

      {seoAdvanced ? <SeoTab /> : <SeoSummaryView />}
    </div>
  );
}
