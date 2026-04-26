import { useNavigate } from "react-router-dom";
import { MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnreadSupportReplies } from "@/hooks/use-unread-support-replies";

/**
 * Dashboard banner that calls out unread replies from the ACTV TRKR support
 * team. Shows until the user opens the ticket (which marks it read via
 * `support_ticket_reads`).
 */
export function SupportReplyBanner() {
  const navigate = useNavigate();
  const { tickets, count } = useUnreadSupportReplies();

  if (count === 0) return null;

  const single = count === 1 ? tickets[0] : null;

  const handleClick = () => {
    if (single) {
      navigate(`/account?tab=support&ticket=${single.ticket_id}`);
    } else {
      navigate("/account?tab=support");
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 animate-slide-up"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <MessageSquare className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        {single ? (
          <>
            <p className="text-sm font-semibold text-foreground">
              Support replied to your ticket #{single.ticket_number}
            </p>
            <p className="text-xs text-muted-foreground truncate" title={single.subject}>
              {single.subject}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-foreground">
              You have {count} new {count === 1 ? "reply" : "replies"} from support
            </p>
            <p className="text-xs text-muted-foreground">
              Open the support inbox to read and respond.
            </p>
          </>
        )}
      </div>
      <Button
        size="sm"
        onClick={handleClick}
        className="shrink-0 gap-1.5"
      >
        {single ? "View reply" : "View tickets"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
