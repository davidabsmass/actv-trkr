import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Globe, Loader2, Sparkles, Plus, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AddSiteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, this is the org's first site — no additional charge applies. */
  isFirstSite?: boolean;
}

type Step = "choose" | "blocked" | "confirm-additional";

interface BlockedState {
  available: number;
  purchased: number;
}

/**
 * Add-Site flow with two clearly-named entry paths:
 *   1. "This is my first ACTV TRKR install"  → existing onboarding (free)
 *   2. "I'm adding an additional site to my plan" → guarded $30/mo flow
 *
 * Guardrail behavior:
 *   The `add-additional-site` edge function returns HTTP 409 with
 *   `error: "slot_already_available"` when the org has already paid for a
 *   slot they haven't connected yet. We surface that as a "blocked" state
 *   so the user can either go finish setup or release the unused slot,
 *   instead of silently being charged again.
 */
export function AddSiteModal({ open, onOpenChange, isFirstSite = false }: AddSiteModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [blocked, setBlocked] = useState<BlockedState | null>(null);

  const reset = () => {
    setStep("choose");
    setBlocked(null);
    setBusy(false);
    setReleasing(false);
  };

  const handleClose = (next: boolean) => {
    if (busy || releasing) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const goToFirstInstall = () => {
    onOpenChange(false);
    reset();
    navigate("/settings?tab=setup");
  };

  const startAdditionalSite = async () => {
    if (isFirstSite) {
      // Edge case: user has no sites yet but explicitly chose "additional".
      // Route them to first-install instead of charging them.
      goToFirstInstall();
      return;
    }

    // Precheck: if the user already paid for a slot (e.g. via direct Stripe
    // quantity bump or a previous trip through this flow) skip the confirm
    // screen and route straight to the download page. Soft-fails to confirm.
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "check-additional-site-slot",
      );
      if (!error && data && Number(data.available_slots) > 0) {
        toast({
          title: "You already have a paid slot ready",
          description:
            "Skipping checkout — opening your pre-keyed plugin download.",
        });
        onOpenChange(false);
        reset();
        navigate("/settings?tab=add-site");
        return;
      }
    } catch {
      // ignore — fall through to confirm screen
    } finally {
      setBusy(false);
    }
    setStep("confirm-additional");
  };

  const confirmAdditional = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-additional-site");

      // The edge function uses status 409 with a structured payload to signal
      // the guardrail. supabase-js surfaces non-2xx as an error but still
      // exposes the body in error.context.
      if (error) {
        // Try to extract the structured guardrail payload.
        let payload: any = data;
        if (!payload && (error as any).context) {
          try {
            payload = await (error as any).context.json();
          } catch {
            // ignore — fall through to generic error
          }
        }
        if (payload?.error === "slot_already_available") {
          setBlocked({
            available: payload.available_slots ?? 1,
            purchased: payload.purchased_slots ?? 1,
          });
          setStep("blocked");
          return;
        }
        throw new Error(payload?.message || payload?.error || error.message);
      }

      if (data?.error === "slot_already_available") {
        setBlocked({
          available: data.available_slots ?? 1,
          purchased: data.purchased_slots ?? 1,
        });
        setStep("blocked");
        return;
      }

      if (data?.error) throw new Error(data.message || data.error);

      const trialing = data?.is_trialing;
      toast({
        title: trialing ? "Added — no charge during trial" : "Additional site added",
        description: trialing
          ? "You'll only be billed for this site when your 7-day trial ends."
          : "Your subscription was updated. The new site is now $30/mo.",
      });

      onOpenChange(false);
      reset();
      navigate("/settings?tab=add-site");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update your subscription.";
      toast({
        variant: "destructive",
        title: "Couldn't add site",
        description: message,
      });
    } finally {
      setBusy(false);
    }
  };

  const continueExistingSetup = () => {
    onOpenChange(false);
    reset();
    navigate("/settings?tab=add-site");
  };

  const releaseUnusedSlot = async () => {
    setReleasing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "release-additional-site-slot",
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      toast({
        title: "Slot released",
        description:
          "Your subscription was updated. You'll see a credit on your next invoice.",
      });
      onOpenChange(false);
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not release the slot.";
      toast({
        variant: "destructive",
        title: "Couldn't release slot",
        description: message,
      });
    } finally {
      setReleasing(false);
    }
  };

  // ───────── Render per step ─────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {step === "choose" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-md bg-primary/10">
                  <Globe className="h-4 w-4 text-primary" />
                </div>
                <DialogTitle>Connect a website</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                Which of these best describes what you're doing?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <button
                type="button"
                onClick={goToFirstInstall}
                className="w-full text-left rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-primary/10 flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      This is my first ACTV TRKR install
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Set up your first website. Included in your plan — no extra charge.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={startAdditionalSite}
                disabled={busy}
                className="w-full text-left rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors p-4 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-primary/10 flex-shrink-0">
                    {busy ? (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      {busy
                        ? "Checking your subscription…"
                        : "I'm adding an additional site to my plan"}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Connect another WordPress site.{" "}
                      <span className="text-foreground font-medium">$30/month</span> — free during your 7-day trial.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm-additional" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-md bg-primary/10">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <DialogTitle>Add another site</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                We checked your subscription — you don't have an unused slot yet,
                so this will add a new{" "}
                <span className="font-semibold text-foreground">$30/month</span>{" "}
                line item, then prepare a plugin file already linked to your account.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground space-y-2">
              <p>
                <span className="font-semibold text-foreground">During your 7-day free trial</span>,
                you can add as many client sites as you want — we won't charge you for any of them
                until the trial ends.
              </p>
              <p>
                We'll prepare a{" "}
                <span className="font-semibold text-foreground">plugin file with your account already linked</span>{" "}
                — no license key to copy or paste. Just install and activate it on the new site.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("choose")} disabled={busy}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={confirmAdditional} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating subscription…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "blocked" && blocked && (
          <>
            <DialogHeader>
              <DialogTitle>You already have an unconnected site</DialogTitle>
              <DialogDescription className="pt-2">
                Your plan already includes{" "}
                <span className="font-semibold text-foreground">
                  {blocked.available} additional site {blocked.available === 1 ? "slot" : "slots"}
                </span>{" "}
                that {blocked.available === 1 ? "hasn't" : "haven't"} been connected yet. We won't add
                another charge until {blocked.available === 1 ? "it's" : "they're"} in use.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              You can either finish setting up the site you already paid for, or release the unused
              slot to remove it from your subscription (you'll receive a credit on your next invoice).
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={releaseUnusedSlot}
                disabled={releasing || busy}
              >
                {releasing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Releasing…
                  </>
                ) : (
                  "Release unused slot"
                )}
              </Button>
              <Button onClick={continueExistingSetup} disabled={releasing || busy}>
                Finish setup
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
