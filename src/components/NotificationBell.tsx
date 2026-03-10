import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: unreadCount } = useQuery({
    queryKey: ["unread_notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from("notification_inbox")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  return (
    <button
      onClick={() => navigate("/notifications")}
      className="relative p-2 rounded-md hover:bg-muted transition-colors"
      aria-label="Notifications"
    >
      <Bell className="h-4.5 w-4.5 text-muted-foreground" />
      {(unreadCount || 0) > 0 && (
        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-warning border-2 border-background" />
      )}
    </button>
  );
}
