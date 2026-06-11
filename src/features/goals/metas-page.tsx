import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2, Target } from "lucide-react";
import { toast } from "sonner";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { FilterBar } from "@/components/layout/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { formatBRL, MONTH_LABELS, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteGoal, listGoals, upsertGoal } from "@/features/goals/goals.functions";
import { getFinancials } from "@/features/dashboard/dashboard.functions";

type GoalKind = "revenue" | "profit" | "expense_cap";

const KIND_LABELS: Record<GoalKind, string> = {
  revenue: "Receita",
  profit: "Lucro",
  expense_cap: "Limite de despesa",
};

export function MetasPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);

  const fetchGoals = useServerFn(listGoals);
  const fetchFin = useServerFn(getFinancials);

  const goalsQ = useQuery({
    queryKey: ["goals", companyId, year],
    queryFn: () => fetchGoals({ data: { companyId: companyId!, year } }),
    enabled: !!companyId,
  });
  const finQ = useQuery({
    queryKey: ["financials", companyId, year, null],
    queryFn: () => fetchFin({ data: { companyId: companyId!, year, month: null } }),
    enabled: !!companyId,
  });

  const qc = useQueryClient();
  const remove = useServerFn(deleteGoal);
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Meta removida");
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  const monthly = finQ.data?.monthly;
  const actual = useMemo(() => {
    if (!monthly) return null;
    return monthly.map((m) => ({
      revenue: m.revenue,
      profit: m.revenue - m.expense,
      expense_cap: m.expense,
    }));
  }, [monthly]);

  const summary = useMemo(() => {
    if (!goalsQ.data || !actual)
      return { totalTarget: 0, totalActual: 0, achieved: 0, count: 0 };
    let totalTarget = 0;
    let totalActual = 0;
    let achieved = 0;
    for (const g of goalsQ.data) {
      const value = actual[g.month - 1][g.kind as GoalKind];
      totalTarget += g.target_cents;
      totalActual += value;
      const ok =
        g.kind === "expense_cap" ? value <= g.target_cents : value >= g.target_cents;
      if (ok) achieved += 1;
    }
    return { totalTarget, totalActual, achieved, count: goalsQ.data.length };
  }, [goalsQ.data, actual]);

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metas Financeiras</h1>
          <p className="text-sm text-muted-foreground">
            Defina metas mensais e acompanhe o progresso em tempo real.
          </p>
        </div>
        <GoalDialog />
      </header>

      <FilterBar />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Metas cadastradas" value={String(summary.count)} />
        <SummaryCard label="Metas atingidas" value={`${summary.achieved}/${summary.count}`} />
        <SummaryCard label="Soma das metas" value={formatBRL(summary.totalTarget)} />
        <SummaryCard label="Realizado" value={formatBRL(summary.totalActual)} />
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Progresso por meta — {year}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {goalsQ.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma meta cadastrada. Comece criando uma meta mensal.
            </p>
          )}
          {goalsQ.data?.map((g) => {
            const value = actual?.[g.month - 1][g.kind as GoalKind] ?? 0;
            const target = g.target_cents;
            const isCap = g.kind === "expense_cap";
            const pct = target > 0 ? Math.min(200, (value / target) * 100) : 0;
            const reached = isCap ? value <= target : value >= target;
            return (
              <div key={g.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      {MONTH_LABELS[g.month - 1]} · {KIND_LABELS[g.kind as GoalKind]}
                    </span>
                    {reached ? (
                      <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
                        {isCap ? "Dentro do limite" : "Atingida"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                        {isCap ? "Ultrapassado" : "Em andamento"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="numeric text-muted-foreground">
                      {formatBRL(value)} / {formatBRL(target)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeMut.mutate(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <Progress
                  value={Math.min(100, pct)}
                  className={cn(
                    "mt-2 h-2",
                    reached ? "[&>div]:bg-success" : "[&>div]:bg-primary",
                    isCap && !reached && "[&>div]:bg-destructive",
                  )}
                />
                {g.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{g.notes}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-bold numeric">{value}</p>
      </CardContent>
    </Card>
  );
}

function GoalDialog() {
  const [open, setOpen] = useState(false);
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [kind, setKind] = useState<GoalKind>("revenue");
  const [target, setTarget] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const upsert = useServerFn(upsertGoal);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          companyId: companyId!,
          year,
          month,
          kind,
          targetCents: toCents(Number(target.replace(",", ".")) || 0),
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Meta salva");
      qc.invalidateQueries({ queryKey: ["goals"] });
      setOpen(false);
      setTarget("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Nova meta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova meta mensal</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_LABELS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as GoalKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Receita mínima</SelectItem>
                  <SelectItem value="profit">Lucro mínimo</SelectItem>
                  <SelectItem value="expense_cap">Limite de despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Valor alvo (R$)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0,00"
            />
            {target && (
              <p className="mt-1 text-xs text-muted-foreground numeric">
                {formatBRL(toCents(Number(target.replace(",", ".")) || 0))}
              </p>
            )}
          </div>
          <div>
            <Label>Notas</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!target || mut.isPending}
            onClick={() => mut.mutate()}
          >
            Salvar meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
