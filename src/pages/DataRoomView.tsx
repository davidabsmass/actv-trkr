import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Clock, Lock } from "lucide-react";

interface DataRoomResponse {
  ok: boolean;
  link?: {
    label: string;
    recipient_name: string | null;
    recipient_company: string | null;
    watermark_text: string | null;
    allowed_sections: string[];
    expires_at: string;
    views_remaining: number | null;
  };
  data?: {
    snapshots?: Array<{ metric_key: string; metric_name: string; metric_value: number | null; metric_date: string }>;
    top_customers?: Array<{ customer_name: string; plan: string | null; mrr: number | null; acv: number | null; industry: string | null }>;
    risks?: Array<{ title: string; severity: string; status: string; risk_type: string; description: string | null }>;
    finance?: Array<{ month: string; revenue: number | null; cash_balance: number | null; headcount: number | null }>;
  };
  error?: string;
}

export default function DataRoomView() {
  const { token } = useParams<{ token: string }>();
  const [response, setResponse] = useState<DataRoomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid link");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("data-room-access", {
          body: { token, action: "view" },
        });
        if (fnErr) throw fnErr;
        if (!data?.ok) {
          setError(data?.error ?? "Access denied");
        } else {
          setResponse(data);
        }
      } catch (err: any) {
        setError(err.message ?? "Failed to load data room");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !response?.link) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-destructive" />
              <CardTitle>Access denied</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error ?? "This link is invalid."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { link, data } = response;
  const watermark = link.watermark_text ?? link.recipient_company ?? link.recipient_name ?? "Confidential";

  const formatCurrency = (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const formatNumber = (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v);

  // Get latest snapshot per metric_key
  const latestSnapshots = new Map<string, { name: string; value: number | null }>();
  if (data?.snapshots) {
    for (const s of data.snapshots) {
      if (!latestSnapshots.has(s.metric_key)) {
        latestSnapshots.set(s.metric_key, { name: s.metric_name, value: s.metric_value });
      }
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Watermark overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.04] select-none"
        style={{
          backgroundImage: `repeating-linear-gradient(-45deg, transparent 0, transparent 200px, rgba(0,0,0,0.05) 200px, rgba(0,0,0,0.05) 400px)`,
        }}
      >
        <div className="grid grid-cols-3 gap-32 p-32 text-4xl font-bold text-foreground rotate-[-30deg]">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i}>{watermark}</div>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6 relative z-10">
        <header className="border-b pb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Lock className="w-3 h-3" /> Confidential — Acquisition Data Room
            </div>
            <h1 className="text-2xl font-bold">{link.label}</h1>
            {link.recipient_company && (
              <p className="text-sm text-muted-foreground">Prepared for {link.recipient_company}</p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div className="flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" /> Expires {new Date(link.expires_at).toLocaleDateString()}
            </div>
            {link.views_remaining != null && (
              <div className="mt-1">{link.views_remaining} views remaining</div>
            )}
          </div>
        </header>

        {link.allowed_sections.includes("executive_summary") && latestSnapshots.size > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from(latestSnapshots.entries()).slice(0, 12).map(([key, s]) => (
                  <div key={key} className="p-3 border rounded-md">
                    <div className="text-xs text-muted-foreground">{s.name}</div>
                    <div className="text-lg font-semibold mt-1">
                      {key.includes("rate") || key.includes("margin") || key.includes("nrr") || key.includes("grr")
                        ? `${formatNumber(s.value)}%`
                        : key.includes("arr") || key.includes("mrr") || key.includes("revenue") || key.includes("burn") || key.includes("cash")
                        ? formatCurrency(s.value)
                        : formatNumber(s.value)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {link.allowed_sections.includes("customer_concentration") && data?.top_customers && data.top_customers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2">Customer</th>
                      <th className="text-left py-2">Plan</th>
                      <th className="text-left py-2">Industry</th>
                      <th className="text-right py-2">MRR</th>
                      <th className="text-right py-2">ACV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_customers.slice(0, 20).map((c, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 font-medium">{c.customer_name}</td>
                        <td className="py-2">{c.plan ?? "—"}</td>
                        <td className="py-2">{c.industry ?? "—"}</td>
                        <td className="py-2 text-right">{formatCurrency(c.mrr)}</td>
                        <td className="py-2 text-right">{formatCurrency(c.acv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {link.allowed_sections.includes("financial_efficiency") && data?.finance && data.finance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Financial Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2">Month</th>
                      <th className="text-right py-2">Revenue</th>
                      <th className="text-right py-2">Cash</th>
                      <th className="text-right py-2">Headcount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.finance.slice(0, 12).map((f, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2">{new Date(f.month).toLocaleDateString("en-US", { year: "numeric", month: "short" })}</td>
                        <td className="py-2 text-right">{formatCurrency(f.revenue)}</td>
                        <td className="py-2 text-right">{formatCurrency(f.cash_balance)}</td>
                        <td className="py-2 text-right">{formatNumber(f.headcount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {link.allowed_sections.includes("risk_flags") && data?.risks && data.risks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Risk Register</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.risks.map((r, i) => (
                  <div key={i} className="p-3 border rounded-md flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{r.title}</div>
                      {r.description && (
                        <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
                      )}
                    </div>
                    <Badge variant={r.severity === "critical" || r.severity === "high" ? "destructive" : "secondary"}>
                      {r.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <footer className="text-xs text-muted-foreground text-center pt-6 border-t">
          Confidential — for {watermark} only. Do not redistribute.
        </footer>
      </div>
    </div>
  );
}
