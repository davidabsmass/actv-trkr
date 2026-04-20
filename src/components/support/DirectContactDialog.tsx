import { useEffect, useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface DirectContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REASONS = [
  "General question",
  "Technical issue",
  "Billing question",
  "Feature request",
  "Partnership",
  "Other",
] as const;

const contactSchema = z.object({
  reason: z.string().min(1, "Please select a reason"),
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(2000),
});

/**
 * Lightweight "contact us directly" dialog — for short questions that don't
 * warrant a full ticket. Reuses the `contact-message` transactional template
 * (same one used by the landing footer) and pre-fills the signed-in user's
 * name + email.
 */
export function DirectContactDialog({ open, onOpenChange }: DirectContactDialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from profile when the dialog opens
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setName((prev) => prev || data?.full_name || "");
      setEmail((prev) => prev || data?.email || user.email || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const reset = () => {
    setReason("");
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactSchema.safeParse({ reason, name, email, message });
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      toast.error(first || "Please check the form");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "contact-message",
          recipientEmail: "david@absmass.com",
          templateData: {
            ...parsed.data,
            submittedAt: new Date().toISOString(),
            source: "in-app: Support tab",
          },
        },
      });
      if (error) throw error;
      toast.success("Message sent — we'll be in touch soon.");
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error("DirectContact error:", err?.message || err);
      toast.error("Couldn't send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Contact us directly</DialogTitle>
          <DialogDescription>
            Send a short message — best for quick questions that don't need a tracked ticket.
            For bugs or anything we'll need to follow up on, use 'Submit Request' instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dc-reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="dc-reason">
                <SelectValue placeholder="What's this about?" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="dc-name">Name</Label>
              <Input
                id="dc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-email">Email</Label>
              <Input
                id="dc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dc-message">Message</Label>
            <Textarea
              id="dc-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Tell us a bit more…"
            />
            <p className="text-xs text-muted-foreground">{message.length}/2000</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send message"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
