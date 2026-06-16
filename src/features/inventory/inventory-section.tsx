import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, RefreshCcw, CalendarClock, Percent, Plus } from "lucide-react";
import { toast } from "sonner";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import {
  deleteInventorySnapshot,
  getInventoryMetrics,
  upsertInventorySnapshot,
} from "./inventory.functions";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatPct } from "@/lib/money";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const accentClass: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted-foreground",
  info: "text-info",
  danger: "text-destructive",
};

function MetricCard({
  label,
  icon: Icon,
  accent = "info",
  display,
}: {
  label: string;
  icon: LucideIcon;
  accent?: "success" | "warning" | "muted" | "info" | "danger";
  display: string;
}) {
  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={cn("mt-1 text-2xl font-bold tracking-tight numeric", accentClass[accent])}>
              {display}
            </p>
          </div>
          <div className={cn("rounded-lg bg-secondary p-2", accentClass[accent])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const toCents = (v: string): number => Math.round(Number(v.replace(",", ".")) * 100);

function NewSnapshotDialog({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState("");
  const [retail, setRetail] = useState("");
  const [notes, setNotes] = useState("");
  const upsert = useServerFn(upsertInventorySnapshot);
  const mutation = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          companyId,
          snapshotDate: date,
          costCents: toCents(cost),
          retailCents: retail ? toCents(retail) : null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Snapshot de estoque registrado.");
      setOpen(false);
      setCost("");
      setRetail("");
      setNotes("");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" /> Novo snapshot
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo snapshot de estoque</DialogTitle>
          <DialogDescription>
            Informe o valor agregado do estoque numa data. Use o mesmo dia para sobrescrever.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="snap-date">Data</Label>
            <Input id="snap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="snap-cost">Valor ao custo (R$)</Label>
            <Input
              id="snap-cost"
              inputMode="decimal"
              placeholder="0,00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="snap-retail">Valor a preço de venda (opcional)</Label>
            <Input
              id="snap-retail"
              inputMode="decimal"
              placeholder="0,00"
              value={retail}
              onChange={(e) => setRetail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="snap-notes">Observação</Label>
            <Input id="snap-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!cost || mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InventorySection() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);
  const fetcher = useServerFn(getInventoryMetrics);
  const del = useServerFn(deleteInventorySnapshot);
  const qc = useQueryClient();
  const queryKey = ["inventory-metrics", companyId, year];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetcher({ data: { companyId: companyId!, year } }),
    enabled: !!companyId,
  });

  if (!companyId) return null;

  const m = data;
  const onDelete = async (id: string) => {
    try {
      await del({ data: { companyId, id } });
      toast.success("Snapshot removido.");
      qc.invalidateQueries({ queryKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Estoque (valor agregado)</h2>
          <p className="text-xs text-muted-foreground">
            Snapshots periódicos do valor de estoque. Giro e cobertura usam o CMV YTD de {year}.
          </p>
        </div>
        <NewSnapshotDialog companyId={companyId} onSaved={() => qc.invalidateQueries({ queryKey })} />
      </div>

      {isLoading || !m ? (
        <p className="text-sm text-muted-foreground">Carregando estoque…</p>
      ) : !m.current ? (
        <Card className="glass-card">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum snapshot registrado. Cadastre o primeiro para ver os indicadores.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Valor em estoque (custo)"
              value={m.current.cost_cents}
              icon={Package}
              accent="info"
            />
            <MetricCard
              label="Giro anualizado"
              icon={RefreshCcw}
              accent="success"
              display={m.turnover != null ? `${m.turnover.toFixed(2)}×` : "—"}
            />
            <MetricCard
              label="Cobertura (dias)"
              icon={CalendarClock}
              accent="warning"
              display={m.coverageDays != null ? `${Math.round(m.coverageDays)} dias` : "—"}
            />
            <MetricCard
              label="Margem potencial"
              icon={Percent}
              accent={
                m.potentialMarginCents && m.potentialMarginCents > 0 ? "success" : "muted"
              }
              display={
                m.potentialMarginCents == null
                  ? "informe preço de venda"
                  : `${formatBRL(m.potentialMarginCents)} (${formatPct(m.potentialMarginPct ?? 0)})`
              }
            />
          </div>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Histórico de snapshots</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Venda</TableHead>
                    <TableHead>Observação</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.history.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.snapshot_date}</TableCell>
                      <TableCell className="text-right">{formatBRL(s.cost_cents)}</TableCell>
                      <TableCell className="text-right">
                        {s.retail_cents != null ? formatBRL(s.retail_cents) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.notes ?? ""}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)}>
                          Excluir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
