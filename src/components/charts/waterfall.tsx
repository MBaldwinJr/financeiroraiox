import { memo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatBRLCompact, fromCents } from "@/lib/money";

interface WaterfallStep {
  readonly label: string;
  readonly value: number; // cents (positive or negative)
  readonly total?: boolean;
}

interface WaterfallProps {
  readonly steps: ReadonlyArray<WaterfallStep>;
}

interface BarDatum {
  name: string;
  base: number;
  delta: number;
  total: number;
  isTotal: boolean;
}

export const Waterfall = memo(function Waterfall({ steps }: WaterfallProps) {
  let running = 0;
  const data: BarDatum[] = steps.map((s) => {
    if (s.total) {
      running = s.value;
      return { name: s.label, base: 0, delta: fromCents(s.value), total: fromCents(s.value), isTotal: true };
    }
    const start = running;
    const end = running + s.value;
    running = end;
    const base = fromCents(Math.min(start, end));
    const delta = Math.abs(fromCents(s.value));
    return { name: s.label, base, delta, total: fromCents(end), isTotal: false };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.02 260 / 0.4)" />
        <XAxis dataKey="name" stroke="oklch(0.7 0.02 255)" fontSize={10} interval={0} angle={-15} height={50} />
        <YAxis stroke="oklch(0.7 0.02 255)" fontSize={11} tickFormatter={(v) => formatBRLCompact(v * 100)} />
        <Tooltip
          contentStyle={{
            background: "oklch(0.18 0.02 260)",
            border: "1px solid oklch(0.32 0.02 260 / 0.6)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(_, __, item) => {
            const d = item.payload as BarDatum;
            return [formatBRL(d.total * 100), d.name];
          }}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" />
        <Bar dataKey="delta" stackId="w" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => {
            const color = d.isTotal
              ? "oklch(0.65 0.18 256)"
              : d.total >= (data[i - 1]?.total ?? 0)
                ? "oklch(0.72 0.17 156)"
                : "oklch(0.65 0.23 22)";
            return <Cell key={i} fill={color} />;
          })}
          <LabelList
            dataKey="total"
            position="top"
            formatter={(v: unknown) => formatBRLCompact(Number(v) * 100)}
            style={{ fill: "oklch(0.85 0.02 250)", fontSize: 10 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});
