import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Loader2 } from "lucide-react";

interface SeoFixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  issueTitle: string;
  fixType: string;
  suggestedValue: string;
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
  open, onOpenChange, issueId, issueTitle, fixType, suggestedValue, onConfirm, isPending,
}: SeoFixModalProps) {
  const [value, setValue] = useState(suggestedValue);

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
          <label className="text-xs font-medium text-foreground">{label}</label>
          {isLongText ? (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              className="text-sm"
              maxLength={160}
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="text-sm"
              maxLength={fixType === "set_title" ? 60 : undefined}
            />
          )}
          {fixType === "set_title" && (
            <p className="text-[10px] text-muted-foreground">{value.length}/60 characters</p>
          )}
          {fixType === "set_meta_desc" && (
            <p className="text-[10px] text-muted-foreground">{value.length}/160 characters</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(value)} disabled={isPending || !value.trim()}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Apply Fix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
