import { memo } from "react";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

interface TopListProps {
  readonly items: ReadonlyArray<{ name: string; amount: number }>;
  readonly accent?: "danger" | "info" | "success";
  readonly emptyLabel?: string;
}

const ACCENT: Record<NonNullable<TopListProps["accent"]>, string> = {
  danger: "bg-gradient-to-r from-destructive/80 to-destructive/40",
  info: "bg-gradient-to-r from-accent/80 to-accent/30",
  success: "bg-gradient-to-r from-primary/80 to-primary/30",
};

export const TopList = memo(function TopList({
  items,
  accent = "danger",
  emptyLabel = "Sem dados no período",
}: TopListProps) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.amount));
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const pct = max > 0 ? (item.amount / max) * 100 : 0;
        return (
          <li key={item.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate pr-2 text-foreground">{item.name}</span>
              <span className="numeric font-medium text-muted-foreground">
                {formatBRL(item.amount)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
              <div
                className={cn("h-full rounded-full transition-all", ACCENT[accent])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
});
