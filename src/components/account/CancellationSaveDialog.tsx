import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  /** Called once the user confirms they want to cancel (after feedback is captured). */
  onConfirmCancel: () => Promise<void> | void;
}

const REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "client_canceled", label: "Client canceled" },
  { value: "technical", label: "Technical / setup issues" },
  { value: "missing_features", label: "Missing features" },
  { value: "switching", label: "Switching tools" },
  { value: "other", label: "Other" },
] as const;

const OFFERS_BY_REASON: Record<string, { value: string; label: string }[]> = {
  too_expensive: [{ value: "downgrade", label: "Talk to us about a lighter plan" }],
  not_using: [{ value: "pause", label: "Pause my account for 60 days instead" }],
  client_canceled: [{ value: "transfer", label: "Move billing to another site" }],
  technical: [{ value: "support_call", label: "Get a setup help call" }],
  missing_features: [{ value: "feature_request", label: "Submit a feature request" }],
};

export function CancellationSaveDialog({ open, onOpenChange, orgId, onConfirmCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [offer, setOffer] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setStep(1); setReason(""); setDetail(""); setOffer(""); };

  const recordFeedback = async (outcome: "saved" | "paused" | "downgraded" | "canceled" | "abandoned") => {
    try {
      const { error } = await supabase.functions.invoke("cancellation-feedback", {
        body: { org_id: orgId, reason: reason || "unspecified", reason_detail: detail || null, selected_offer: offer || null, outcome },
      });
      if (error) console.warn("Feedback record failed", error);
    } catch (e) { console.warn(e); }
  };

  const handleNext = async () => {
    if (!reason) { toast({ title: "Please pick a reason", variant: "destructive" }); return; }
    setSubmitting(true);
    await recordFeedback("abandoned"); // intermediate — final outcome set on next click
    setSubmitting(false);
    setStep(2);
  };

  const handleAcceptOffer = async () => {
    setSubmitting(true);
    const outcome = offer === "pause" ? "paused" : offer === "downgrade" ? "downgraded" : "saved";
    await recordFeedback(outcome);
    setSubmitting(false);
    toast({ title: "Thanks — we'll be in touch", description: "Our team will reach out within 1 business day." });
    onOpenChange(false);
    reset();
  };

  const handleConfirmCancel = async () => {
    setSubmitting(true);
    await recordFeedback("canceled");
    try {
      await onConfirmCancel();
    } finally {
      setSubmitting(false);
      onOpenChange(false);
      reset();
    }
  };

  const offers = OFFERS_BY_REASON[reason] || [];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Before you go — can you tell us why?</DialogTitle>
              <DialogDescription>This helps us improve. Takes 10 seconds.</DialogDescription>
            </DialogHeader>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2 py-2">
              {REASONS.map((r) => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`r-${r.value}`} />
                  <Label htmlFor={`r-${r.value}`} className="text-sm font-normal cursor-pointer">{r.label}</Label>
                </div>
              ))}
            </RadioGroup>
            <Textarea placeholder="Anything else? (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Never mind</Button>
              <Button onClick={handleNext} disabled={submitting || !reason}>Continue</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>One more option?</DialogTitle>
              <DialogDescription>
                {offers.length > 0
                  ? "Based on what you said, here's something that might fit better."
                  : "We've recorded your feedback. You can cancel below or close this dialog to keep your account."}
              </DialogDescription>
            </DialogHeader>
            {offers.length > 0 && (
              <RadioGroup value={offer} onValueChange={setOffer} className="space-y-2 py-2">
                {offers.map((o) => (
                  <div key={o.value} className="flex items-center gap-2 rounded border border-border p-3 hover:border-primary/50">
                    <RadioGroupItem value={o.value} id={`o-${o.value}`} />
                    <Label htmlFor={`o-${o.value}`} className="text-sm font-normal cursor-pointer flex-1">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Keep my account</Button>
              {offers.length > 0 && (
                <Button variant="default" onClick={handleAcceptOffer} disabled={submitting || !offer}>Yes, let's try this</Button>
              )}
              <Button variant="destructive" onClick={handleConfirmCancel} disabled={submitting}>Cancel anyway</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
