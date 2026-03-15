import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Wand2, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SeoFixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  issueTitle: string;
  fixType: string;
  suggestedValue: string;
  pageUrl: string;
  onConfirm: (value: string) => void;
  isPending: boolean;
}

const fixTypeLabels: Record<string, string> = {
  set_title: "Page Title",
  set_meta_desc: "Meta Description",
  add_canonical: "Canonical URL",
  add_og_tags: "Open Graph Tags",
};

export default function SeoFixModal({
  open, onOpenChange, issueId, issueTitle, fixType, suggestedValue, pageUrl, onConfirm, isPending,
}: SeoFixModalProps) {
  const [value, setValue] = useState(suggestedValue);
  const [loading, setLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  useEffect(() => {
    if (!open || !pageUrl || !fixType) return;

    // If a suggestedValue was already provided, use it
    if (suggestedValue) {
      setValue(suggestedValue);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setAiGenerated(false);

    supabase.functions
      .invoke("seo-suggest-fix", {
        body: { page_url: pageUrl, fix_type: fixType },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.suggested_value) {
          setValue(data.suggested_value);
          setAiGenerated(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, pageUrl, fixType, suggestedValue]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setValue("");
      setAiGenerated(false);
      setLoading(false);
    }
  }, [open]);

  const isLongText = fixType === "set_meta_desc";
  const label = fixTypeLabels[fixType] || fixType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Wand2 className="h-4 w-4 text-primary" />
            Fix: {issueTitle}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Review and edit the suggested {label.toLowerCase()} before applying.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-foreground">{label}</label>
            {aiGenerated && !loading && (
              <span className="inline-flex items-center gap-1 text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Sparkles className="h-2.5 w-2.5" />
                AI suggested
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating AI suggestion…
              </p>
            </div>
          ) : isLongText ? (
            <Textarea
              value={value}
              onChange={(e) => { setValue(e.target.value); setAiGenerated(false); }}
              rows={3}
              className="text-sm"
              maxLength={160}
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => { setValue(e.target.value); setAiGenerated(false); }}
              className="text-sm"
              maxLength={fixType === "set_title" ? 60 : undefined}
            />
          )}
          {!loading && fixType === "set_title" && (
            <p className="text-[10px] text-muted-foreground">{value.length}/60 characters</p>
          )}
          {!loading && fixType === "set_meta_desc" && (
            <p className="text-[10px] text-muted-foreground">{value.length}/160 characters</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(value)} disabled={isPending || loading || !value.trim()}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Apply Fix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
