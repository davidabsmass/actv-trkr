import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  /** CSS color value, e.g. "hsl(var(--primary))" */
  color?: string;
  /** Pixel height of the rendered SVG */
  height?: number;
  /** Optional className for the wrapping svg */
  className?: string;
}

/**
 * Tiny inline sparkline. Pure SVG, zero deps.
 * Renders an area under a smooth-ish line so KPI cards feel alive
 * without animation. If data is too short or flat, hides itself.
 */
export function Sparkline({
  data,
  color = "hsl(var(--primary))",
  height = 32,
  className = "",
}: SparklineProps) {
  const { path, area, width, gradientId } = useMemo(() => {
    const w = 120;
    const h = height;
    const padY = 2;
    const id = `spark-${Math.random().toString(36).slice(2, 9)}`;

    if (!data || data.length < 2) {
      return { path: "", area: "", width: w, gradientId: id };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = w / (data.length - 1);

    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = h - padY - ((v - min) / range) * (h - padY * 2);
      return [x, y] as const;
    });

    const pathStr = points
      .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
      .join(" ");

    const areaStr = `${pathStr} L ${w} ${h} L 0 ${h} Z`;

    return { path: pathStr, area: areaStr, width: w, gradientId: id };
  }, [data, height]);

  if (!path) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
