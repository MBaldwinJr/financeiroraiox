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
import { listBankAccounts, listCategories, listCostCenters, listParties } from "@/features/catalog/catalog.functions";
import { MONTH_LABELS } from "@/lib/money";
import { RevenueBasisToggle } from "@/components/layout/revenue-basis-toggle";
import { ChevronDown, X } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1];
})();

export function FilterBar({ showRevenueBasis = true, appearance = "default" }: { showRevenueBasis?: boolean; appearance?: "default" | "light" }) {
  const light = appearance === "light";
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const { range, setRange, clear, categoryIds, costCenterIds, bankAccountIds, partyIds, paymentMethods, setMulti } =
    useFilterStore();

  const fCats = useServerFn(listCategories);
  const fCcs = useServerFn(listCostCenters);
  const fBas = useServerFn(listBankAccounts);
  const fParties = useServerFn(listParties);
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

  const parties = useQuery({
    queryKey: ["parties", companyId],
    queryFn: () => fParties({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const hasFilters =
    categoryIds.length + costCenterIds.length + bankAccountIds.length + partyIds.length + paymentMethods.length > 0;

  return (
    <Card className="glass-card flex flex-wrap items-center gap-3 p-3">
      <Select
        value={String(range.year)}
        onValueChange={(v) => setRange({ ...range, year: Number(v) })}
      >
        <SelectTrigger className={light ? "w-[110px] border-slate-200 bg-white text-slate-800" : "w-[110px]"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={light ? "border-slate-200 bg-white text-slate-800" : undefined}>
          {YEARS.map((y) => (
            <SelectItem key={y} value={String(y)} className={light ? "focus:bg-blue-50 focus:text-blue-900" : undefined}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={range.month ? String(range.month) : "all"}
        onValueChange={(v) => setRange({ ...range, month: v === "all" ? null : Number(v) })}
      >
        <SelectTrigger className={light ? "w-[140px] border-slate-200 bg-white text-slate-800" : "w-[140px]"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={light ? "border-slate-200 bg-white text-slate-800" : undefined}>
          <SelectItem value="all" className={light ? "focus:bg-blue-50 focus:text-blue-900" : undefined}>Ano inteiro</SelectItem>
          {MONTH_LABELS.map((m, i) => (
            <SelectItem key={m} value={String(i + 1)} className={light ? "focus:bg-blue-50 focus:text-blue-900" : undefined}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <MultiPickerCompact
        light={light}
        label="Categoria"
        options={(cats.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        value={categoryIds}
        onChange={(ids) => setMulti("categoryIds", ids)}
      />
      <MultiPickerCompact
        light={light}
        label="Centro de custo"
        options={(ccs.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        value={costCenterIds}
        onChange={(ids) => setMulti("costCenterIds", ids)}
      />
      <MultiPickerCompact
        light={light}
        label="Conta"
        options={(bas.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        value={bankAccountIds}
        onChange={(ids) => setMulti("bankAccountIds", ids)}
      />
      <MultiPickerCompact
        light={light}
        label="Cliente/Fornecedor"
        options={(parties.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
        value={partyIds}
        onChange={(ids) => setMulti("partyIds", ids)}
      />
      <MultiPickerCompact
        light={light}
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
        {showRevenueBasis && <RevenueBasisToggle />}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="mr-1 h-4 w-4" /> Limpar filtros
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Seleção múltipla real; permite ver e remover filtros sem perder os anteriores. */
function MultiPickerCompact({
  label,
  options,
  value,
  onChange,
  light = false,
}: {
  label: string;
  light?: boolean;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedLabel =
    value.length === 0
      ? label
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.name ?? label)
        : `${label}: ${value.length}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={light ? "w-[170px] justify-between gap-2 border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-900" : "w-[170px] justify-between gap-2"}
          aria-label={`${label} — ${value.length ? `${value.length} selecionado(s)` : "Todos"}`}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={light ? "max-h-72 w-56 overflow-y-auto border-slate-200 bg-white text-slate-800 shadow-lg" : "max-h-72 w-56 overflow-y-auto"}>
        <DropdownMenuCheckboxItem
          className={light ? "focus:bg-blue-50 focus:text-blue-900 data-[state=checked]:text-blue-700" : undefined}
          checked={value.length === 0}
          onCheckedChange={() => onChange([])}
          onSelect={(e) => e.preventDefault()}
        >
          Todos — {label}
        </DropdownMenuCheckboxItem>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            className={light ? "focus:bg-blue-50 focus:text-blue-900 data-[state=checked]:text-blue-700" : undefined}
            key={o.id}
            checked={value.includes(o.id)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, o.id] : value.filter((id) => id !== o.id))
            }
            onSelect={(e) => e.preventDefault()}
          >
            {o.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
