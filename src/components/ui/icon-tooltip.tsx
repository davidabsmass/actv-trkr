import { forwardRef, isValidElement, cloneElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface IconTooltipProps {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export const IconTooltip = forwardRef<HTMLSpanElement, IconTooltipProps>(
  ({ label, children, side = "bottom", className }, ref) => {
    // Inject aria-label on the inner interactive element so screen readers
    // get an accessible name for icon-only buttons (the visible tooltip is
    // mouse-only). Falls back to wrapping in a span if the child isn't a
    // valid element. Won't override an explicit aria-label already provided.
    let labeled = children;
    if (isValidElement(children)) {
      const existingProps = (children as any).props ?? {};
      if (!existingProps["aria-label"]) {
        labeled = cloneElement(children as any, { "aria-label": label });
      }
    }

    return (
      <Tooltip delayDuration={2000}>
        <TooltipTrigger asChild>
          <span ref={ref} className={className}>{labeled}</span>
        </TooltipTrigger>
        <TooltipContent side={side} className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
);

IconTooltip.displayName = "IconTooltip";
