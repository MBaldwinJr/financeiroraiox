import { memo } from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { formatBRL } from "@/lib/money";

interface TreemapDatum {
  readonly name: string;
  readonly group: string;
  readonly amount: number;
}

interface TreemapChartProps {
  readonly data: ReadonlyArray<TreemapDatum>;
}

const GROUP_COLORS: Record<string, string> = {
  cmv: "oklch(0.65 0.23 22)",
  fixed: "oklch(0.65 0.18 256)",
  variable: "oklch(0.78 0.16 75)",
  supplier: "oklch(0.55 0.16 35)",
  freight: "oklch(0.68 0.2 310)",
  operational: "oklch(0.55 0.05 260)",
  other: "oklch(0.45 0.05 260)",
};

type TreemapNode = {
  name: string;
  size: number;
  group: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

function TreemapCell(props: unknown) {
  const p = props as TreemapNode;
  const fill = GROUP_COLORS[p.group] ?? "oklch(0.5 0.05 260)";
  if (!p.width || !p.height) return null;
  return (
    <g>
      <rect
        x={p.x}
        y={p.y}
        width={p.width}
        height={p.height}
        style={{
          fill,
          stroke: "oklch(0.18 0.02 260)",
          strokeWidth: 2,
          fillOpacity: 0.85,
        }}
      />
      {p.width > 70 && p.height > 30 && (
        <>
          <text
            x={(p.x ?? 0) + 8}
            y={(p.y ?? 0) + 18}
            fill="white"
            fontSize={11}
            fontWeight={600}
          >
            {p.name}
          </text>
          <text
            x={(p.x ?? 0) + 8}
            y={(p.y ?? 0) + 32}
            fill="rgba(255,255,255,0.7)"
            fontSize={10}
          >
            {formatBRL(p.size)}
          </text>
        </>
      )}
    </g>
  );
}

export const TreemapChart = memo(function TreemapChart({ data }: TreemapChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sem dados
      </div>
    );
  }
  const mapped = data.map((d) => ({ name: d.name, size: d.amount, group: d.group }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap data={mapped} dataKey="size" content={<TreemapCell />}>
        <Tooltip
          contentStyle={{
            background: "oklch(0.18 0.02 260)",
            border: "1px solid oklch(0.32 0.02 260 / 0.6)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => formatBRL(value)}
        />
      </Treemap>
    </ResponsiveContainer>
  );
});
