import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UnreadSupportReply {
  ticket_id: string;
  ticket_number: number;
  subject: string;
  org_id: string;
  latest_admin_reply_at: string;
  unread_count: number;
}

/**
 * Returns the list of support tickets (submitted by the current user) that
 * have new replies from the support team since the user last opened them.
 *
 * Backed by `v_my_unread_support_replies` (security_invoker view).
 */
export function useUnreadSupportReplies() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["unread_support_replies", user?.id],
    queryFn: async (): Promise<UnreadSupportReply[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("v_my_unread_support_replies")
        .select("ticket_id, ticket_number, subject, org_id, latest_admin_reply_at, unread_count")
        .order("latest_admin_reply_at", { ascending: false });
      if (error) {
        console.warn("[useUnreadSupportReplies] error", error);
        return [];
      }
      return (data || []) as UnreadSupportReply[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Realtime: refresh when a new admin message lands on any ticket.
  // Filtering by ticket submitter happens via the view, so we just refetch.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`support-replies-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_ticket_messages",
        },
        (payload) => {
          const row = payload.new as { author_type?: string; is_internal?: boolean };
          if (row?.author_type === "admin" && row?.is_internal === false) {
            queryClient.invalidateQueries({ queryKey: ["unread_support_replies", user.id] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const tickets = query.data || [];
  const totalUnread = tickets.reduce((sum, t) => sum + (t.unread_count || 0), 0);

  return {
    tickets,
    count: tickets.length,
    totalUnread,
    isLoading: query.isLoading,
  };
}

/**
 * Mark a single ticket's admin replies as read for the current user.
 * Upserts into `support_ticket_reads` and invalidates the unread query.
 */
export async function markSupportTicketRead(
  userId: string,
  ticketId: string,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  if (!userId || !ticketId) return;
  const { error } = await supabase
    .from("support_ticket_reads")
    .upsert(
      { user_id: userId, ticket_id: ticketId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,ticket_id" },
    );
  if (error) {
    console.warn("[markSupportTicketRead] error", error);
    return;
  }
  queryClient.invalidateQueries({ queryKey: ["unread_support_replies", userId] });
}
