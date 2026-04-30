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
import { Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AddSiteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, this is the org's first site — no additional charge applies. */
  isFirstSite?: boolean;
}

/**
 * Confirmation modal shown before reusing the existing onboarding flow
 * to connect another WordPress site to the current account.
 *
 * Additional sites are billed at $30/mo each. During the active 14-day
 * trial we tell Stripe to add the line item to the subscription with
 * `proration_behavior: "none"` so nothing is charged until the trial ends.
 */
export function AddSiteModal({ open, onOpenChange, isFirstSite = false }: AddSiteModalProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleContinue = async () => {
    if (isFirstSite) {
      onOpenChange(false);
      navigate("/settings?tab=setup");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-additional-site");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const trialing = data?.is_trialing;
      toast({
        title: trialing ? "Added — no charge during trial" : "Additional site added",
        description: trialing
          ? "You'll only be billed for this site when your 14-day trial ends."
          : "Your subscription was updated. The new site is now $30/mo.",
      });

      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-md bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle>Add another site</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Connect another WordPress site to this account.
            {!isFirstSite && (
              <>
                {" "}
                Additional sites are billed at{" "}
                <span className="font-semibold text-foreground">$30/month</span> each.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!isFirstSite && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground space-y-2">
            <p>
              <span className="font-semibold text-foreground">During your 14-day free trial</span>,
              you can add as many client sites as you want — we won't charge you for any of them
              until the trial ends.
            </p>
            <p>
              We'll prepare a{" "}
              <span className="font-semibold text-foreground">plugin file with your account already linked</span>{" "}
              — no license key to copy or paste. Just install and activate it on the new site.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleContinue} disabled={busy}>
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
      </DialogContent>
    </Dialog>
  );
}
