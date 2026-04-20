import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen, ExternalLink, HelpCircle, MessageCircle } from "lucide-react";
import { HELP_ARTICLES, RESOURCE_LINKS } from "./helpContent";
import { DirectContactDialog } from "./DirectContactDialog";

interface QuickHelpPanelProps {
  /** When true, renders a more compact variant (used inside the floating help popover). */
  compact?: boolean;
}

export function QuickHelpPanel({ compact = false }: QuickHelpPanelProps) {
  const navigate = useNavigate();
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <Card className={compact ? "border-0 shadow-none" : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-4 w-4" /> Quick Help
          </CardTitle>
          <CardDescription>
            Common questions answered. Try these before opening a ticket — most issues are resolved here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* FAQ */}
          <Accordion type="single" collapsible className="w-full">
            {HELP_ARTICLES.map((a) => (
              <AccordionItem key={a.id} value={a.id}>
                <AccordionTrigger className="text-sm text-left hover:no-underline">
                  {a.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {a.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Resources */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <BookOpen className="h-3.5 w-3.5" /> Resources
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {RESOURCE_LINKS.map((r) => (
                <button
                  key={r.href}
                  onClick={() => (r.internal ? navigate(r.href) : window.open(r.href, "_blank"))}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors p-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.description}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          </div>

          {/* Direct contact CTA */}
          <div className="rounded-lg border border-dashed border-border p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Still need help?</p>
              <p className="text-xs text-muted-foreground">
                Send a quick message — for short questions that don't need a tracked ticket.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setContactOpen(true)} className="gap-1.5 shrink-0">
              <MessageCircle className="h-3.5 w-3.5" /> Contact
            </Button>
          </div>
        </CardContent>
      </Card>

      <DirectContactDialog open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}
