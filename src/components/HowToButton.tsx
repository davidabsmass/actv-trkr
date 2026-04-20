import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface HowToSection {
  /** Short bold heading for the section, e.g. "Reading the KPI cards" */
  title: string;
  /** Plain-text explanation. Keep to 1–3 sentences. */
  body: string;
  /** Optional bullet list of tips / sub-points */
  bullets?: string[];
}

export interface HowToButtonProps {
  /** Page name for the modal title, e.g. "Dashboard" */
  pageName: string;
  /** One-line summary shown under the title */
  intro: string;
  /** Ordered sections explaining each part of the page */
  sections: HowToSection[];
  /** Optional extra className for the trigger button */
  className?: string;
  /** Render as a compact icon-only button (default) or with text */
  withLabel?: boolean;
}

/**
 * Subtle "How to use this page" help button.
 * Drops next to a page title; opens a clean modal with structured guidance.
 */
export function HowToButton({
  pageName,
  intro,
  sections,
  className,
  withLabel = false,
}: HowToButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={withLabel ? "sm" : "icon"}
        onClick={() => setOpen(true)}
        aria-label={`How to use the ${pageName} page`}
        className={cn(
          "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          withLabel ? "gap-1.5 h-7 px-2 text-xs" : "h-7 w-7",
          className,
        )}
      >
        <HelpCircle className={cn(withLabel ? "h-3.5 w-3.5" : "h-4 w-4")} />
        {withLabel && <span>How-To</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              How to use {pageName}
            </DialogTitle>
            <DialogDescription>{intro}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {sections.map((s, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  {s.title}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.body}
                </p>
                {s.bullets && s.bullets.length > 0 && (
                  <ul className="mt-2 space-y-1 list-disc list-inside text-sm text-muted-foreground">
                    {s.bullets.map((b, j) => (
                      <li key={j} className="leading-relaxed">
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
