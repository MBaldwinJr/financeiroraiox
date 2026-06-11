import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL, formatPct } from "@/lib/money";
import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Line, LineChart, ResponsiveContainer } from "recharts";

interface KpiCardProps {
  label: string;
  value: number;
  prev?: number | null;
  icon: LucideIcon;
  accent?: "success" | "danger" | "info" | "warning" | "muted";
  format?: "currency" | "percent";
  sparkline?: number[];
}

const accentMap: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  success: "text-success",
  danger: "text-destructive",
  info: "text-info",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

export function KpiCard({
  label,
  value,
  prev,
  icon: Icon,
  accent = "info",
  format = "currency",
  sparkline,
}: KpiCardProps) {
  const variation =
    prev != null && prev !== 0 ? (value - prev) / Math.abs(prev) : prev === 0 && value > 0 ? 1 : 0;
  const up = variation > 0;
  const down = variation < 0;
  const TrendIcon = up ? ArrowUp : down ? ArrowDown : Minus;
  const trendColor = up ? "text-success" : down ? "text-destructive" : "text-muted-foreground";
  const displayValue = format === "currency" ? formatBRL(value) : formatPct(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className={cn("mt-1 text-2xl font-bold tracking-tight numeric", accentMap[accent])}>
                {displayValue}
              </p>
            </div>
            <div className={cn("rounded-lg bg-secondary p-2", accentMap[accent])}>
              <Icon className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between gap-2">
            {prev != null && (
              <div className={cn("flex items-center gap-1 text-xs numeric", trendColor)}>
                <TrendIcon className="h-3 w-3" />
                <span>{formatPct(variation)}</span>
                <span className="text-muted-foreground">vs anterior</span>
              </div>
            )}
            {sparkline && sparkline.length > 1 && (
              <div className="h-8 w-24 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkline.map((v) => ({ v }))}>
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      dot={false}
                      className={accentMap[accent]}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
