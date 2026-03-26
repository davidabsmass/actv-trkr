import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wand2, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SeoFixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueTitle: string;
  fixType: string;
  pageUrl: string;
}

const fixTypeLabels: Record<string, string> = {
  set_title: "Page Title",
  set_meta_desc: "Meta Description",
  add_canonical: "Canonical URL",
  add_og_tags: "Open Graph Tags",
};

export default function SeoFixModal({
  open, onOpenChange, issueTitle, fixType, pageUrl,
}: SeoFixModalProps) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !pageUrl || !fixType) return;

    let cancelled = false;
    setLoading(true);
    setValue("");
    setCopied(false);

    supabase.functions
      .invoke("seo-suggest-fix", {
        body: { page_url: pageUrl, fix_type: fixType },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("seo-suggest-fix invoke error:", error);
        } else if (data?.suggested_value) {
          setValue(data.suggested_value);
        } else {
          console.warn("seo-suggest-fix returned no suggested_value:", data);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("seo-suggest-fix network error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, pageUrl, fixType]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setValue("");
      setLoading(false);
      setCopied(false);
    }
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const label = fixTypeLabels[fixType] || fixType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Wand2 className="h-4 w-4 text-primary" />
            Suggested Fix: {issueTitle}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Copy the suggested {label.toLowerCase()} and paste it into your site's SEO settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-foreground">{label}</label>
            {!loading && value && (
              <span className="inline-flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Sparkles className="h-2.5 w-2.5" />
                AI suggested
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating AI suggestion…
              </p>
            </div>
          ) : value ? (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm text-foreground leading-relaxed">{value}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No suggestion available for this issue.</p>
          )}

          {!loading && fixType === "set_title" && value && (
            <p className="text-xs text-muted-foreground">{value.length}/60 characters</p>
          )}
          {!loading && fixType === "set_meta_desc" && value && (
            <p className="text-xs text-muted-foreground">{value.length}/160 characters</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {value && (
            <Button size="sm" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
