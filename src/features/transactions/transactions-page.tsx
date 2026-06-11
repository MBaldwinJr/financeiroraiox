import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Copy, Search, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { FilterBar } from "@/components/layout/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatDate, toCents } from "@/lib/money";
import {
  deleteTransaction,
  listTransactions,
  toggleTransactionStatus,
  upsertTransaction,
} from "@/features/transactions/transactions.functions";
import {
  listBankAccounts,
  listCategories,
  listCostCenters,
  listParties,
} from "@/features/catalog/catalog.functions";
import { cn } from "@/lib/utils";

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Cartão" },
] as const;

export function TransactionsPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const filters = useFilterStore();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TransactionFormDefaults | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetcher = useServerFn(listTransactions);
  const queryKey = [
    "transactions",
    companyId,
    range.year,
    range.month,
    search,
    filters.categoryIds,
    filters.costCenterIds,
    filters.bankAccountIds,
    filters.paymentMethods,
  ];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetcher({
        data: {
          companyId: companyId!,
          year: range.year,
          month: range.month,
          search: search || undefined,
          categoryIds: filters.categoryIds,
          costCenterIds: filters.costCenterIds,
          bankAccountIds: filters.bankAccountIds,
          paymentMethods: filters.paymentMethods as ("cash" | "pix" | "boleto" | "cheque" | "card")[],
          limit: 200,
          offset: 0,
        },
      }),
    enabled: !!companyId,
  });

  const qc = useQueryClient();
  const remove = useServerFn(deleteTransaction);
  const toggle = useServerFn(toggleTransactionStatus);
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Lançamento excluído");
      qc.invalidateQueries();
    },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "paid" | "pending" }) =>
      toggle({ data: { id, status } }),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">
            Registre receitas e despesas; o DRE e dashboard atualizam em tempo real.
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="mr-2 h-4 w-4" /> Novo lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Editar" : "Novo"} lançamento</DialogTitle>
            </DialogHeader>
            <TransactionForm
              defaults={editing}
              onSaved={() => {
                setDialogOpen(false);
                setEditing(null);
                qc.invalidateQueries();
              }}
            />
          </DialogContent>
        </Dialog>
      </header>

      <FilterBar />

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por descrição…"
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Badge variant="secondary" className="numeric">
              {query.data?.total ?? 0} registros
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-left">Centro</th>
                  <th className="px-3 py-2 text-left">Conta</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.rows ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-secondary/30">
                    <td className="px-3 py-2 numeric text-muted-foreground">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.categories?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.cost_centers?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.bank_accounts?.name ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right numeric font-medium",
                        t.kind === "revenue" ? "text-success" : "text-destructive",
                      )}
                    >
                      {t.kind === "revenue" ? "+" : "-"}
                      {formatBRL(t.amount_cents)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          toggleMut.mutate({
                            id: t.id,
                            status: t.status === "paid" ? "pending" : "paid",
                          })
                        }
                        title={t.status === "paid" ? "Pago" : "Pendente"}
                      >
                        {t.status === "paid" ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing(transactionToFormDefaults(t));
                            setDialogOpen(true);
                          }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const { id: _id, ...rest } = transactionToFormDefaults(t);
                            void _id;
                            setEditing(rest);
                            setDialogOpen(true);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeMut.mutate(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {query.data && query.data.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum lançamento no período. Adicione o primeiro!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- form ----

const formSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  description: z.string().min(1).max(280),
  amount: z.number({ coerce: true }).positive(),
  kind: z.enum(["revenue", "expense"]),
  paymentMethod: z.enum(["cash", "pix", "boleto", "cheque", "card"]).nullable(),
  categoryId: z.string().uuid().nullable(),
  costCenterId: z.string().uuid().nullable(),
  bankAccountId: z.string().uuid().nullable(),
  partyId: z.string().uuid().nullable(),
  status: z.enum(["paid", "pending"]),
  notes: z.string().max(1000).nullable(),
});
type TransactionFormValues = z.infer<typeof formSchema>;
interface TransactionFormDefaults extends Partial<TransactionFormValues> {
  id?: string;
}

interface TxRow {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  kind: "revenue" | "expense";
  payment_method: string | null;
  status: "paid" | "pending";
  notes: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  bank_account_id: string | null;
  party_id: string | null;
  categories?: { name: string } | null;
  cost_centers?: { name: string } | null;
  bank_accounts?: { name: string } | null;
  parties?: { name: string } | null;
}

function transactionToFormDefaults(t: TxRow): TransactionFormDefaults {
  return {
    id: t.id,
    date: t.date,
    description: t.description,
    amount: t.amount_cents / 100,
    kind: t.kind,
    paymentMethod: t.payment_method as TransactionFormValues["paymentMethod"],
    categoryId: t.category_id,
    costCenterId: t.cost_center_id,
    bankAccountId: t.bank_account_id,
    partyId: t.party_id,
    status: t.status,
    notes: t.notes,
  };
}

function TransactionForm({
  defaults,
  onSaved,
}: {
  defaults: TransactionFormDefaults | null;
  onSaved: () => void;
}) {
  const companyId = useCompanyStore((s) => s.activeCompanyId)!;
  const upsert = useServerFn(upsertTransaction);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: defaults?.date ?? new Date().toISOString().slice(0, 10),
      description: defaults?.description ?? "",
      amount: defaults?.amount ?? 0,
      kind: defaults?.kind ?? "expense",
      paymentMethod: defaults?.paymentMethod ?? "pix",
      categoryId: defaults?.categoryId ?? null,
      costCenterId: defaults?.costCenterId ?? null,
      bankAccountId: defaults?.bankAccountId ?? null,
      partyId: defaults?.partyId ?? null,
      status: defaults?.status ?? "paid",
      notes: defaults?.notes ?? null,
    },
  });
  const kind = form.watch("kind");

  const fCats = useServerFn(listCategories);
  const fCcs = useServerFn(listCostCenters);
  const fBas = useServerFn(listBankAccounts);
  const fParties = useServerFn(listParties);
  const cats = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => fCats({ data: { companyId } }),
  });
  const ccs = useQuery({
    queryKey: ["cost-centers", companyId],
    queryFn: () => fCcs({ data: { companyId } }),
  });
  const bas = useQuery({
    queryKey: ["bank-accounts", companyId],
    queryFn: () => fBas({ data: { companyId } }),
  });
  const parties = useQuery({
    queryKey: ["parties", companyId],
    queryFn: () => fParties({ data: { companyId } }),
  });

  const filteredCats = (cats.data ?? []).filter((c) => c.kind === kind);

  const mut = useMutation({
    mutationFn: (v: TransactionFormValues) =>
      upsert({
        data: {
          id: defaults?.id,
          companyId,
          date: v.date,
          description: v.description,
          amountCents: toCents(v.amount),
          kind: v.kind,
          paymentMethod: v.paymentMethod,
          categoryId: v.categoryId,
          costCenterId: v.costCenterId,
          bankAccountId: v.bankAccountId,
          partyId: v.partyId,
          status: v.status,
          notes: v.notes,
        },
      }),
    onSuccess: () => {
      toast.success(defaults?.id ? "Atualizado" : "Lançamento criado");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => mut.mutate(v))}>
      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select
          value={kind}
          onValueChange={(v) => form.setValue("kind", v as "revenue" | "expense")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Receita</SelectItem>
            <SelectItem value="expense">Despesa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Data</Label>
        <Input type="date" {...form.register("date")} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Descrição</Label>
        <Input {...form.register("description")} placeholder="Ex: Venda nº 1042" />
      </div>
      <div className="space-y-1.5">
        <Label>Valor (R$)</Label>
        <Input type="number" step="0.01" min="0" {...form.register("amount")} />
      </div>
      <div className="space-y-1.5">
        <Label>Forma de pagamento</Label>
        <Select
          value={form.watch("paymentMethod") ?? "pix"}
          onValueChange={(v) =>
            form.setValue("paymentMethod", v as TransactionFormValues["paymentMethod"])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select
          value={form.watch("categoryId") ?? ""}
          onValueChange={(v) => form.setValue("categoryId", v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {filteredCats.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Centro de custo</Label>
        <Select
          value={form.watch("costCenterId") ?? ""}
          onValueChange={(v) => form.setValue("costCenterId", v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {(ccs.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Conta</Label>
        <Select
          value={form.watch("bankAccountId") ?? ""}
          onValueChange={(v) => form.setValue("bankAccountId", v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {(bas.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Cliente/Fornecedor</Label>
        <Select
          value={form.watch("partyId") ?? ""}
          onValueChange={(v) => form.setValue("partyId", v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {(parties.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Situação</Label>
        <Select
          value={form.watch("status")}
          onValueChange={(v) => form.setValue("status", v as "paid" | "pending")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paid">Pago / Baixado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Observações</Label>
        <Textarea rows={2} {...form.register("notes")} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="w-full" disabled={mut.isPending}>
          {mut.isPending ? "Salvando…" : "Salvar lançamento"}
        </Button>
      </div>
    </form>
  );
}
