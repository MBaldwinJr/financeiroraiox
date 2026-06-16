import { useFilterStore, type RevenueBasis } from "@/stores/filter-store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const OPTIONS: { value: RevenueBasis; label: string; hint: string }[] = [
  { value: "accrual", label: "Competência", hint: "Data do lançamento" },
  { value: "cash", label: "Caixa", hint: "Data do recebimento" },
  { value: "erp_sales", label: "Vendas ERP", hint: "PDF do ERP" },
];

export function RevenueBasisToggle() {
  const basis = useFilterStore((s) => s.revenueBasis);
  const setBasis = useFilterStore((s) => s.setRevenueBasis);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Receita por
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        value={basis}
        onValueChange={(v) => v && setBasis(v as RevenueBasis)}
        className="rounded-lg border border-border bg-secondary/30 p-0.5"
      >
        {OPTIONS.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            title={o.hint}
            className="h-7 px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
