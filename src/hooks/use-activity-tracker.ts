import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";

const PAGE_TITLES: Record<string, string> = {
  "/": "Home",
  "/dashboard": "Dashboard",
  "/performance": "Performance",
  "/visitor-journeys": "Visitor Journeys",
  "/reports": "Reports",
  "/forms": "Forms",
  "/forms/troubleshooting": "Forms Troubleshooting",
  "/seo": "SEO",
  "/monitoring": "Site Monitoring",
  "/site-integrity": "Site Integrity",
  "/security": "Security",
  "/clients": "Users",
  "/admin-setup": "Setup & Inputs",
  "/pipeline-status": "Pipeline Status",
  "/settings": "Settings",
  "/exports": "Exports",
  "/archives": "Archives",
  "/notifications": "Notifications",
  "/account": "Account",
  "/get-started": "Get Started",
  "/onboarding": "Onboarding",
  "/compliance-setup": "Compliance Setup",
  "/website-setup": "Website Setup",
  "/owner-admin": "Owner Admin",
  "/checkout-success": "Checkout Success",
  "/auth": "Sign In",
  "/signup": "Signup",
  "/reset-password": "Reset Password",
};


/** Tracks user activity (page views & feature interactions) within the dashboard */
export function useActivityTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const { orgId } = useOrg();
  const lastLoggedPath = useRef<string>("");

  // Log page view on route change (path + ?tab= so sub-tabs are visible)
  useEffect(() => {
    if (!user?.id || !orgId) return;
    const tab = new URLSearchParams(location.search).get("tab");
    const path = tab ? `${location.pathname}?tab=${tab}` : location.pathname;
    if (path === lastLoggedPath.current) return;
    lastLoggedPath.current = path;

    const baseTitle = PAGE_TITLES[location.pathname] || location.pathname;
    const title = tab ? `${baseTitle} · ${tab}` : baseTitle;

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
  }, [location.pathname, location.search, user?.id, orgId]);

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
