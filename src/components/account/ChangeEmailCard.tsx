import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock } from "lucide-react";

/**
 * Email changes are intentionally disabled. We tie subscription history,
 * trial eligibility, and Stripe customer records to the signup email, so
 * changing it would let a user reset their 14-day trial repeatedly.
 *
 * If a customer has a legitimate need to change their email (e.g. a real
 * domain change), they can contact support and we'll handle it manually
 * after verifying identity.
 */
export default function ChangeEmailCard() {
  const { user } = useAuth();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" /> Email address
        </CardTitle>
        <CardDescription>
          For account security and billing integrity, your email can't be changed from here.
          Contact support if you need to update it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Current email</Label>
          <div className="relative">
            <Input value={user?.email || ""} disabled className="bg-muted pr-9" />
            <Lock className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Need to change this? Email{" "}
          <a
            href="mailto:support@actvtrkr.com"
            className="text-primary underline-offset-4 hover:underline"
          >
            support@actvtrkr.com
          </a>{" "}
          and we'll help.
        </p>
      </CardContent>
    </Card>
  );
}
