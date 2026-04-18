import { useState, useEffect } from "react";
import { useCustomerProfile } from "@/hooks/use-customer-profile";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle, X } from "lucide-react";
import { toast } from "sonner";

const CUSTOMER_TYPES = [
  { value: "agency", label: "Agency" },
  { value: "business_owner", label: "Business Owner" },
  { value: "freelancer", label: "Freelancer" },
  { value: "in_house", label: "In-House Marketing Team" },
  { value: "other", label: "Other" },
];

const WEBSITE_COUNTS = [
  { value: "1", label: "1" },
  { value: "2-5", label: "2–5" },
  { value: "6-10", label: "6–10" },
  { value: "11-25", label: "11–25" },
  { value: "26+", label: "26+" },
];

const ACQUISITION_SOURCES = [
  { value: "google_search", label: "Google Search" },
  { value: "referral", label: "Referral" },
  { value: "existing_client", label: "Existing Client" },
  { value: "social_media", label: "Social Media" },
  { value: "email", label: "Email" },
  { value: "direct", label: "Direct / Typed URL" },
  { value: "other", label: "Other" },
];

export function CustomerProfilePrompt() {
  const {
    shouldShowPrompt,
    completeProfile,
    skipProfile,
    dismissProfile,
    markPromptShown,
  } = useCustomerProfile();

  const [open, setOpen] = useState(false);
  const [customerType, setCustomerType] = useState("");
  const [websiteCount, setWebsiteCount] = useState("");
  const [acquisitionSource, setAcquisitionSource] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    if (shouldShowPrompt && !hasShown) {
      // Small delay so it doesn't pop immediately on page load
      const timer = setTimeout(() => {
        setOpen(true);
        setHasShown(true);
        markPromptShown();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [shouldShowPrompt, hasShown]);

  const canSubmit = customerType && websiteCount;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await completeProfile.mutateAsync({
        customer_type: customerType,
        website_count_range: websiteCount,
        acquisition_source: acquisitionSource || undefined,
      });
      setSubmitted(true);
      setTimeout(() => setOpen(false), 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save your answers. Please try again.";
      toast.error(msg);
    }
  };

  const handleSkip = async () => {
    await skipProfile.mutateAsync();
    setOpen(false);
  };

  const handleDismiss = async () => {
    await dismissProfile.mutateAsync();
    setOpen(false);
  };

  if (!shouldShowPrompt && !open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-border/60">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 z-10 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {submitted ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Thanks! Your experience is being tailored.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-base font-semibold text-foreground">
                Help us tailor your experience
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Answer two quick questions so we can better personalize ACTV TRKR.
              </p>
            </div>

            {/* Fields */}
            <div className="px-6 space-y-4">
              {/* Question 1 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  What best describes you? <span className="text-destructive">*</span>
                </Label>
                <Select value={customerType} onValueChange={setCustomerType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select one…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Question 2 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  How many websites do you manage? <span className="text-destructive">*</span>
                </Label>
                <Select value={websiteCount} onValueChange={setWebsiteCount}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select one…" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEBSITE_COUNTS.map((w) => (
                      <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Question 3 (optional) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  How did you hear about us? <span className="text-muted-foreground/60 text-[10px]">(optional)</span>
                </Label>
                <Select value={acquisitionSource} onValueChange={setAcquisitionSource}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select one…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACQUISITION_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pt-5 pb-5 flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit || completeProfile.isPending}
                className="text-xs px-4"
              >
                {completeProfile.isPending ? "Saving…" : "Save & continue"}
              </Button>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
