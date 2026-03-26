import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/performance": "Performance",
  "/reports": "Reports",
  "/forms": "Forms",
  "/seo": "SEO",
  "/monitoring": "Site Monitoring",
  "/security": "Security",
  "/clients": "Users",
  "/admin-setup": "Setup & Inputs",
  "/settings": "Settings",
  "/exports": "Exports",
  "/notifications": "Notifications",
  "/account": "Account",
  "/get-started": "Get Started",
  "/onboarding": "Onboarding",
};

/** Tracks user activity (page views & feature interactions) within the dashboard */
export function useActivityTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const { orgId } = useOrg();
  const lastLoggedPath = useRef<string>("");

  // Log page view on route change
  useEffect(() => {
    if (!user?.id || !orgId) return;
    const path = location.pathname;
    if (path === lastLoggedPath.current) return;
    lastLoggedPath.current = path;

    const title = PAGE_TITLES[path] || path;

    supabase
      .from("user_activity_log" as any)
      .insert({
        user_id: user.id,
        org_id: orgId,
        activity_type: "page_view",
        page_path: path,
        page_title: title,
      })
      .then(() => {});
  }, [location.pathname, user?.id, orgId]);

  // Expose a function to log feature interactions
  const trackFeature = useCallback(
    (featureName: string, details?: Record<string, any>) => {
      if (!user?.id || !orgId) return;
      supabase
        .from("user_activity_log" as any)
        .insert({
          user_id: user.id,
          org_id: orgId,
          activity_type: "feature_click",
          page_path: location.pathname,
          page_title: featureName,
          details: details || {},
        })
        .then(() => {});
    },
    [user?.id, orgId, location.pathname]
  );

  return { trackFeature };
}
