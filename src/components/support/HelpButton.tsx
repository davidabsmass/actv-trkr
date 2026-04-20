import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { HelpCircle, ArrowRight } from "lucide-react";
import { QuickHelpPanel } from "./QuickHelpPanel";
import { IconTooltip } from "@/components/ui/icon-tooltip";

/**
 * Floating Help button shown on every authenticated page (positioned bottom-left
 * to avoid the AI chatbot in the bottom-right). Opens a side sheet with the
 * Quick Help panel and a link to the full Support tab.
 */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Hide on the Support tab itself — the panel is already inline there.
  const isOnSupportTab =
    location.pathname.startsWith("/account") &&
    new URLSearchParams(location.search).get("tab") === "support";
  if (isOnSupportTab) return null;

  const goToSupport = () => {
    setOpen(false);
    navigate("/account?tab=support");
  };

  return (
    <>
      <IconTooltip label="Help & support">
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => setOpen(true)}
          aria-label="Open help"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </IconTooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Help & Support</SheetTitle>
            <SheetDescription>
              Quick answers, resources, and a way to reach us.
            </SheetDescription>
          </SheetHeader>

          <QuickHelpPanel compact />

          <div className="mt-6 pt-4 border-t border-border">
            <Button onClick={goToSupport} variant="default" className="w-full gap-1.5">
              Open full Support center <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Submit a tracked request, view ticket history, and reply to support.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
