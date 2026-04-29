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
import { Globe } from "lucide-react";

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
 * Billing integration for the $35/mo additional-site charge is intentionally
 * deferred — see TODO note in body. We never claim a charge has happened.
 */
export function AddSiteModal({ open, onOpenChange, isFirstSite = false }: AddSiteModalProps) {
  const navigate = useNavigate();

  const handleContinue = () => {
    onOpenChange(false);
    // First site → full first-time setup. Additional sites → streamlined
    // flow that reuses the existing org API key (no rotation).
    navigate(isFirstSite ? "/settings?tab=setup" : "/settings?tab=add-site");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                <span className="font-semibold text-foreground">$35/month</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!isFirstSite && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            We'll prepare a <span className="font-semibold text-foreground">plugin file with your account already linked</span> —
            no license key to copy or paste. Just install and activate it on the new site.
            Billing for the additional site will be set up separately — we won't charge you until
            that's confirmed.
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
