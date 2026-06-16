import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { listBankAccounts, listCategories, listCostCenters } from "@/features/catalog/catalog.functions";
import { MONTH_LABELS } from "@/lib/money";
import { RevenueBasisToggle } from "@/components/layout/revenue-basis-toggle";
import { X } from "lucide-react";

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1];
})();

export function FilterBar() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const { range, setRange, clear, categoryIds, costCenterIds, bankAccountIds, paymentMethods, setMulti } =
    useFilterStore();

  const fCats = useServerFn(listCategories);
  const fCcs = useServerFn(listCostCenters);
  const fBas = useServerFn(listBankAccounts);
  const cats = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => fCats({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const ccs = useQuery({
    queryKey: ["cost-centers", companyId],
    queryFn: () => fCcs({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const bas = useQuery({
    queryKey: ["bank-accounts", companyId],
    queryFn: () => fBas({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const hasFilters =
    categoryIds.length + costCenterIds.length + bankAccountIds.length + paymentMethods.length > 0;

  return (
    <Card className="glass-card flex flex-wrap items-center gap-3 p-3">
      <Select
        value={String(range.year)}
        onValueChange={(v) => setRange({ ...range, year: Number(v) })}
      >
        <SelectTrigger className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {YEARS.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={range.month ? String(range.month) : "all"}
        onValueChange={(v) => setRange({ ...range, month: v === "all" ? null : Number(v) })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Ano inteiro</SelectItem>
          {MONTH_LABELS.map((m, i) => (
            <SelectItem key={m} value={String(i + 1)}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <MultiPickerCompact
        label="Categoria"
        options={(cats.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        value={categoryIds}
        onChange={(ids) => setMulti("categoryIds", ids)}
      />
      <MultiPickerCompact
        label="Centro de custo"
        options={(ccs.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        value={costCenterIds}
        onChange={(ids) => setMulti("costCenterIds", ids)}
      />
      <MultiPickerCompact
        label="Conta"
        options={(bas.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        value={bankAccountIds}
        onChange={(ids) => setMulti("bankAccountIds", ids)}
      />
      <MultiPickerCompact
        label="Pagamento"
        options={[
          { id: "cash", name: "Dinheiro" },
          { id: "pix", name: "PIX" },
          { id: "boleto", name: "Boleto" },
          { id: "cheque", name: "Cheque" },
          { id: "card", name: "Cartão" },
        ]}
        value={paymentMethods}
        onChange={(ids) => setMulti("paymentMethods", ids)}
      />

      <div className="ml-auto flex items-center gap-3">
        <RevenueBasisToggle />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="mr-1 h-4 w-4" /> Limpar filtros
          </Button>
        )}
      </div>
    </Card>
  );
}

function MultiPickerCompact({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <Select
      value={value[0] ?? "all"}
      onValueChange={(v) => (v === "all" ? onChange([]) : onChange([v]))}
    >
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder={label}>
          {value.length === 0
            ? label
            : value.length === 1
              ? options.find((o) => o.id === value[0])?.name
              : `${value.length} selecionados`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos — {label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
