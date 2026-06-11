import { memo } from "react";
import { MONTH_LABELS, formatBRLCompact } from "@/lib/money";
import { cn } from "@/lib/utils";

interface HeatmapProps {
  readonly rows: ReadonlyArray<{ category: string; months: number[] }>;
}

function colorFor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "oklch(0.25 0.02 260 / 0.4)";
  const pct = value / max;
  if (pct < 0.33) return "oklch(0.62 0.16 156 / 0.65)"; // green
  if (pct < 0.66) return "oklch(0.78 0.16 75 / 0.75)"; // amber
  return "oklch(0.62 0.22 22 / 0.85)"; // red
}

export const Heatmap = memo(function Heatmap({ rows }: HeatmapProps) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Sem dados</p>;
  }
  const max = Math.max(...rows.flatMap((r) => r.months));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs numeric">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card/80 px-3 py-2 text-left text-muted-foreground">
              Categoria
            </th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="px-1 py-2 text-center font-medium text-muted-foreground">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category}>
              <td className="sticky left-0 z-10 truncate bg-card/80 px-3 py-1 text-left text-foreground">
                {row.category}
              </td>
              {row.months.map((value, i) => (
                <td key={i} className="p-0.5">
                  <div
                    className={cn(
                      "flex h-9 items-center justify-center rounded-md text-[10px] text-white/90",
                    )}
                    style={{ background: colorFor(value, max) }}
                    title={`${row.category} — ${MONTH_LABELS[i]}: ${formatBRLCompact(value)}`}
                  >
                    {value > 0 ? formatBRLCompact(value) : "—"}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
