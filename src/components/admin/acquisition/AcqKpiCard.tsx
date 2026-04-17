import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, type LucideIcon } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";

type Props = {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  trend?: { delta: number; label?: string };
  tone?: "default" | "success" | "warning" | "danger";
  spark?: number[];
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-foreground",
  success: "text-[hsl(var(--success))]",
  warning: "text-[hsl(var(--warning))]",
  danger: "text-destructive",
};

const sparkStroke: Record<NonNullable<Props["tone"]>, string> = {
  default: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--destructive))",
};

export function AcqKpiCard({ label, value, icon: Icon, hint, trend, tone = "default", spark }: Props) {
  const sparkData = spark && spark.length > 1 ? spark.map((v, i) => ({ i, v })) : null;
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{label}</span>
          </div>
          {hint && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground/70 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs">
                  {hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className={`text-lg font-bold ${toneClass[tone]}`}>{value}</div>
        {trend && (
          <div className={`text-[11px] mt-0.5 ${trend.delta >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
            {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(1)}% {trend.label ?? "MoM"}
          </div>
        )}
        {sparkData && (
          <div className="h-8 mt-1 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Line type="monotone" dataKey="v" stroke={sparkStroke[tone]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
