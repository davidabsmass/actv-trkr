import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { maskStripeId } from "@/lib/mask-id";

interface Props {
  /** The full Stripe ID (e.g. cus_1A2B3C4D5E6F). */
  value?: string | null;
  /** Optional className applied to the wrapping span. */
  className?: string;
}

/**
 * Masked display for Stripe-style IDs. Shows masked form by default with
 * eye / copy buttons. Reveal toggles the full ID inline. Copy puts the
 * full value on the clipboard regardless of reveal state.
 *
 * Use everywhere a `cus_…`, `sub_…`, `in_…`, `ch_…`, `pi_…` ID would
 * otherwise appear in the admin UI.
 */
export function MaskedId({ value, className }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="font-mono text-muted-foreground">—</span>;

  const display = revealed ? value : maskStripeId(value);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs ${className ?? ""}`}>
      <span className="select-all">{display}</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-5 w-5 p-0"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? "Hide ID" : "Reveal ID"}
        title={revealed ? "Hide" : "Reveal"}
      >
        {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-5 w-5 p-0"
        onClick={handleCopy}
        aria-label="Copy full ID"
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </Button>
    </span>
  );
}
