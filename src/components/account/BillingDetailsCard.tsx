import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, FileText, Loader2, ExternalLink, Calendar, AlertTriangle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Invoice = {
  id: string;
  number: string | null;
  created: string;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

type BillingData = {
  has_customer: boolean;
  subscription: {
    id: string;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
    cancel_at: string | null;
    canceled_at: string | null;
    amount: number | null;
    base_amount?: number | null;
    currency: string | null;
    interval: string | null;
    product_name: string | null;
    discount_label?: string | null;
    is_fully_discounted?: boolean;
  } | null;
  payment_method: {
    type: string;
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
  } | null;
  invoices: Invoice[];
};

const fmtMoney = (cents: number | null | undefined, currency: string | null | undefined) => {
  if (cents == null || !currency) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
};

const statusBadge = (status: string) => {
  const s = status.toLowerCase();
  if (s === "active" || s === "trialing") {
    return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{status}</Badge>;
  }
  if (s === "past_due" || s === "unpaid") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
};

export default function BillingDetailsCard() {
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ["billing_details"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-billing-details");
      if (error) throw error;
      return data as BillingData;
    },
    staleTime: 60_000,
  });

  const handleUpdatePayment = async () => {
    const { data, error } = await supabase.functions.invoke("customer-portal");
    if (error) {
      toast({
        title: "Unable to open billing portal",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    if (data?.error === "no_stripe_customer") {
      toast({
        title: "No billing account yet",
        description: "You'll be able to manage billing here once you start a paid plan.",
      });
      return;
    }
    if (data?.url) {
      window.open(data.url, "_blank");
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" /> Billing
        </CardTitle>
        <CardDescription>
          Your current plan, payment method, and invoice history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading billing details…
          </div>
        )}

        {!isLoading && error && (
          <div className="text-sm text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
            <span>Couldn't load billing details right now. Try again in a moment.</span>
          </div>
        )}

        {!isLoading && data && !data.has_customer && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <div className="font-medium">You're on the free plan</div>
              <div className="text-muted-foreground">
                Once you start a paid subscription, your plan, payment method, and invoices will appear here.
              </div>
            </div>
          </div>
        )}

        {!isLoading && data?.subscription && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-card/50 p-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-base font-semibold">
                  {data.subscription.product_name || "Subscription"}
                </div>
                {statusBadge(data.subscription.status)}
                {data.subscription.is_fully_discounted && (
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    Free
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {data.subscription.is_fully_discounted ? (
                  <>
                    <span className="text-foreground font-medium">Free</span>
                    {data.subscription.base_amount != null && (
                      <span className="line-through ml-2 text-xs">
                        {fmtMoney(data.subscription.base_amount, data.subscription.currency)}
                        {data.subscription.interval && ` / ${data.subscription.interval}`}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {fmtMoney(data.subscription.amount, data.subscription.currency)}
                    {data.subscription.interval && ` / ${data.subscription.interval}`}
                  </>
                )}
              </div>
              {data.subscription.discount_label && (
                <div className="text-xs text-emerald-500">
                  {data.subscription.discount_label} applied
                </div>
              )}
              {data.subscription.cancel_at_period_end && data.subscription.cancel_at ? (
                <div className="text-xs text-amber-500 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Cancels on {fmtDate(data.subscription.cancel_at)}
                </div>
              ) : data.subscription.current_period_end ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Renews {fmtDate(data.subscription.current_period_end)}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border bg-card/50 p-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Payment method</div>
              {data.subscription.is_fully_discounted ? (
                <div className="text-sm text-muted-foreground">
                  No payment method needed — your plan is fully covered by a discount code.
                </div>
              ) : data.payment_method?.type === "card" ? (
                <>
                  <div className="text-base font-semibold capitalize">
                    {data.payment_method.brand} •••• {data.payment_method.last4}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Expires {String(data.payment_method.exp_month).padStart(2, "0")}/
                    {data.payment_method.exp_year}
                  </div>
                </>
              ) : data.payment_method ? (
                <div className="text-sm">{data.payment_method.type}</div>
              ) : (
                <div className="text-sm text-muted-foreground">No payment method on file</div>
              )}
              {!data.subscription.is_fully_discounted && (
                <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={handleUpdatePayment}>
                  Update payment method
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {!isLoading && data?.invoices && data.invoices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" /> Invoice history
            </div>
            <div className="rounded-lg border divide-y">
              {data.invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {inv.number || inv.id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(inv.created)} ·{" "}
                      {fmtMoney(inv.amount_paid || inv.amount_due, inv.currency)}
                      {inv.status && ` · ${inv.status}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {inv.invoice_pdf && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer">
                          PDF
                        </a>
                      </Button>
                    )}
                    {inv.hosted_invoice_url && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                          View
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
