import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

export default function ChangeEmailCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (trimmed === user?.email?.toLowerCase()) {
      toast({ title: "That's already your current email", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: `${window.location.origin}/account` },
      );
      if (error) throw error;
      toast({
        title: "Verification email sent",
        description: `Check ${trimmed} for a confirmation link. Your email won't change until you confirm.`,
      });
      setNewEmail("");
    } catch (e: any) {
      toast({ title: "Couldn't update email", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" /> Change email
        </CardTitle>
        <CardDescription>
          We'll send a confirmation link to your new address. Your email only changes once you click it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Current email</Label>
          <Input value={user?.email || ""} disabled className="bg-muted" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-email" className="text-xs">New email</Label>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <Button size="sm" onClick={submit} disabled={busy || !newEmail}>
          {busy ? "Sending…" : "Send confirmation"}
        </Button>
      </CardContent>
    </Card>
  );
}
