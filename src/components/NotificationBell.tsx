import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useUnreadSupportReplies } from "@/hooks/use-unread-support-replies";

export function NotificationBell() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { count: unreadSupportTickets } = useUnreadSupportReplies();

  const { data: unreadCount } = useQuery({
    queryKey: ["unread_notifications", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return 0;
      const { data: orgSites } = await supabase
        .from("sites")
        .select("id")
        .eq("org_id", orgId);
      const siteIds = orgSites?.map(s => s.id) || [];
      if (siteIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("notification_inbox")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("site_id", siteIds)
        .eq("is_read", false);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user?.id && !!orgId,
    refetchInterval: 30000,
  });

  const hasUnread = (unreadCount || 0) > 0 || unreadSupportTickets > 0;
  const handleClick = () => {
    // Prioritise unread support replies — they're more time-sensitive than
    // generic notifications.
    if (unreadSupportTickets > 0) {
      navigate("/account?tab=support");
    } else {
      navigate("/settings?tab=notifications");
    }
  };

  return (
    <IconTooltip label={t("sidebar.notifications", "Notifications")}>
      <button
        onClick={handleClick}
        className="relative p-2 rounded-md hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4.5 w-4.5 text-muted-foreground" />
        {hasUnread && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-warning border-2 border-background" />
        )}
      </button>
    </IconTooltip>
  );
}

