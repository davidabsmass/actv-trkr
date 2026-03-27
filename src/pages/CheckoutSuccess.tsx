import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccess() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center border-border">
        <CardContent className="pt-10 pb-8 space-y-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">You're in!</h1>
            <p className="text-muted-foreground mt-2">
              We'll be in touch shortly with your setup instructions.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Check your email for a confirmation and next steps. If you don't see it within a few minutes, check your spam folder.
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            Back to home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
