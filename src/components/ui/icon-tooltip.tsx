import { forwardRef } from "react";
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
    return (
      <Tooltip delayDuration={2000}>
        <TooltipTrigger asChild>
          <span ref={ref} className={className}>{children}</span>
        </TooltipTrigger>
        <TooltipContent side={side} className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
);

IconTooltip.displayName = "IconTooltip";
