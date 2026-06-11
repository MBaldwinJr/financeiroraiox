import { memo } from "react";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

interface GaugeProps {
  readonly value: number; // 0-100
  readonly label: string;
}

function colorFor(v: number): string {
  if (v >= 80) return "oklch(0.72 0.17 156)"; // green
  if (v >= 60) return "oklch(0.78 0.16 75)"; // amber
  return "oklch(0.65 0.23 22)"; // red
}

export const Gauge = memo(function Gauge({ value, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = colorFor(clamped);
  const data = [{ name: "score", value: clamped, fill: color }];
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          data={data}
          startAngle={210}
          endAngle={-30}
          barSize={22}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: "oklch(0.25 0.02 260 / 0.5)" }} dataKey="value" cornerRadius={12} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
        <span className="numeric text-5xl font-black" style={{ color }}>
          {Math.round(clamped)}
        </span>
        <span className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
});
