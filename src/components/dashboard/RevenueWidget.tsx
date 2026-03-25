import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, ShoppingCart, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RevenueData {
  totalRevenue: number;
  orderCount: number;
  avgOrderValue: number;
  currency: string;
  topProducts: { name: string; revenue: number; qty: number }[];
}

export function RevenueWidget({ orgId, startDate, endDate }: { orgId: string | null; startDate: string; endDate: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["revenue_widget", orgId, startDate, endDate],
    queryFn: async (): Promise<RevenueData | null> => {
      if (!orgId) return null;

      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      const { data: orders } = await supabase
        .from("orders")
        .select("id, total, currency")
        .eq("org_id", orgId)
        .gte("ordered_at", dayStart)
        .lte("ordered_at", dayEnd);

      if (!orders || orders.length === 0) return null;

      const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
      const currency = orders[0]?.currency || "USD";

      // Get top products
      const orderIds = orders.map(o => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name, quantity, line_total")
        .eq("org_id", orgId)
        .in("order_id", orderIds.slice(0, 100));

      const prodMap: Record<string, { revenue: number; qty: number }> = {};
      (items || []).forEach((item: any) => {
        const key = item.product_name;
        if (!prodMap[key]) prodMap[key] = { revenue: 0, qty: 0 };
        prodMap[key].revenue += Number(item.line_total);
        prodMap[key].qty += Number(item.quantity);
      });

      const topProducts = Object.entries(prodMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      return {
        totalRevenue,
        orderCount: orders.length,
        avgOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
        currency,
        topProducts,
      };
    },
    enabled: !!orgId,
  });

  // Don't render if no WooCommerce data
  if (isLoading) return null;
  if (!data) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency, minimumFractionDigits: 0 }).format(n);

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Revenue
        </h3>
        <span className="text-xs font-mono-data text-muted-foreground">{data.orderCount} orders</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-xs text-muted-foreground">{t("dashboard.totalRevenue")}</p>
          <p className="text-lg font-bold text-foreground font-mono-data">{fmt(data.totalRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" /> Orders
          </p>
          <p className="text-lg font-bold text-foreground font-mono-data">{data.orderCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> AOV
          </p>
          <p className="text-lg font-bold text-foreground font-mono-data">{fmt(data.avgOrderValue)}</p>
        </div>
      </div>

      {data.topProducts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">{t("dashboard.topProducts")}</p>
          <div className="space-y-1.5">
            {data.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-foreground truncate max-w-[60%]">{p.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{p.qty} sold</span>
                  <span className="text-xs font-mono-data font-medium text-foreground">{fmt(p.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
