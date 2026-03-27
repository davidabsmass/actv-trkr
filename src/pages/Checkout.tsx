import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, BarChart3, Shield, Bot } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const features = [
  { icon: BarChart3, text: "Real-time analytics & pageview tracking" },
  { icon: Zap, text: "Form monitoring & lead attribution" },
  { icon: Shield, text: "SEO scanning & broken link detection" },
  { icon: Bot, text: "AI-powered insights & recommendations" },
];

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get("canceled") === "true";

  const [email, setEmail] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/actv-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          email,
          plan: annual ? "annual" : "monthly",
          site_url: siteUrl || undefined,
          referral_source: referralSource || undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8">
        {/* Left — Features */}
        <div className="flex flex-col justify-center space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              ACTV TRKR
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Everything you need to understand and grow your website.
            </p>
          </div>

          <div className="space-y-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-foreground text-sm">{f.text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Label htmlFor="annual-toggle" className="text-sm text-muted-foreground">Monthly</Label>
            <Switch id="annual-toggle" checked={annual} onCheckedChange={setAnnual} />
            <Label htmlFor="annual-toggle" className="text-sm text-muted-foreground">
              Annual
            </Label>
            {annual && (
              <Badge variant="secondary" className="text-xs">Save 1 month free</Badge>
            )}
          </div>

          <div className="text-foreground">
            <span className="text-4xl font-bold">${annual ? "330" : "30"}</span>
            <span className="text-muted-foreground ml-1">/{annual ? "year" : "month"}</span>
            {annual && (
              <p className="text-sm text-muted-foreground mt-1">
                That's $27.50/mo — save $30/year
              </p>
            )}
          </div>
        </div>

        {/* Right — Form */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Get started</CardTitle>
            {canceled && (
              <p className="text-sm text-destructive">
                Checkout was canceled. You can try again below.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site">Website URL</Label>
              <Input
                id="site"
                type="url"
                placeholder="https://yoursite.com"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref">How did you hear about us?</Label>
              <Input
                id="ref"
                placeholder="Google, referral, social…"
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
              />
            </div>
            <Button
              className="w-full mt-2"
              size="lg"
              onClick={handleCheckout}
              disabled={loading}
            >
              {loading ? "Redirecting to payment…" : `Subscribe — $${annual ? "330/yr" : "30/mo"}`}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Secure payment via Stripe. Cancel anytime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
