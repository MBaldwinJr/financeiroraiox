import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, HelpCircle, Loader2, Scale } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { listRecentImportJobs } from "@/features/import/import-jobs.functions";
import {
  reconcileImport,
  type ReconciliationFinding,
} from "@/features/import/reconciliation.functions";
import { formatBRL } from "@/lib/money";

const TYPE_META: Record<
  ReconciliationFinding["type"],
  { label: string; tone: "default" | "secondary" | "destructive"; icon: typeof AlertTriangle }
> = {
  value_divergence: { label: "Divergência de valor", tone: "destructive", icon: Scale },
  date_divergence: { label: "Divergência de data", tone: "secondary", icon: CalendarClock },
  unmatched: { label: "Sem correspondente", tone: "secondary", icon: HelpCircle },
  exact_duplicate: { label: "Duplicado exato", tone: "default", icon: CheckCircle2 },
};

export function ReconciliationPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReconciliationFinding["type"] | "all">("all");

  const listJobsFn = useServerFn(listRecentImportJobs);
  const jobsQ = useQuery({
    queryKey: ["import-jobs", companyId],
    queryFn: () => listJobsFn({ data: { companyId: companyId!, limit: 15 } }),
    enabled: !!companyId,
  });

  const reconcileFn = useServerFn(reconcileImport);
  const reconcileQ = useQuery({
    queryKey: ["reconcile", companyId, selectedJob],
    queryFn: () =>
      reconcileFn({
        data: {
          companyId: companyId!,
          jobId: selectedJob!,
          dateToleranceDays: 3,
          amountTolerancePct: 0.02,
        },
      }),
    enabled: !!companyId && !!selectedJob,
  });

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  const findings = reconcileQ.data?.findings ?? [];
  const visible =
    filter === "all" ? findings : findings.filter((f) => f.type === filter);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reconciliação de importações</h1>
        <p className="text-sm text-muted-foreground">
          Compara as linhas de uma importação recente com os lançamentos já existentes e sinaliza
          divergências por valor e data.
        </p>
      </header>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Selecionar importação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[320px] flex-1">
            <Select
              value={selectedJob ?? ""}
              onValueChange={(v) => setSelectedJob(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um job para reconciliar…" />
              </SelectTrigger>
              <SelectContent>
                {(jobsQ.data ?? []).map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {new Date(j.created_at).toLocaleString("pt-BR")} · {j.total} linhas ·{" "}
                    {j.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => reconcileQ.refetch()}
            disabled={!selectedJob || reconcileQ.isFetching}
          >
            {reconcileQ.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Recalcular
          </Button>
        </CardContent>
      </Card>

      {reconcileQ.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryStat label="Total" value={reconcileQ.data.total} tone="default" />
          <SummaryStat
            label="Divergência valor"
            value={reconcileQ.data.valueDivergences}
            tone="destructive"
          />
          <SummaryStat
            label="Divergência data"
            value={reconcileQ.data.dateDivergences}
            tone="secondary"
          />
          <SummaryStat label="Sem match" value={reconcileQ.data.unmatched} tone="secondary" />
          <SummaryStat label="Duplicados" value={reconcileQ.data.exactDuplicates} tone="default" />
        </div>
      )}

      {reconcileQ.data && (
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">Todos ({findings.length})</TabsTrigger>
            <TabsTrigger value="value_divergence">
              Valor ({reconcileQ.data.valueDivergences})
            </TabsTrigger>
            <TabsTrigger value="date_divergence">
              Data ({reconcileQ.data.dateDivergences})
            </TabsTrigger>
            <TabsTrigger value="unmatched">Sem match ({reconcileQ.data.unmatched})</TabsTrigger>
            <TabsTrigger value="exact_duplicate">
              Duplicado ({reconcileQ.data.exactDuplicates})
            </TabsTrigger>
          </TabsList>
          <TabsContent value={filter} className="mt-4">
            <FindingsTable rows={visible} />
          </TabsContent>
        </Tabs>
      )}

      {selectedJob && reconcileQ.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Comparando…
        </p>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "secondary" | "destructive";
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold numeric">
          <Badge variant={tone} className="text-base">
            {value}
          </Badge>
        </p>
      </CardContent>
    </Card>
  );
}

function FindingsTable({ rows }: { rows: ReconciliationFinding[] }) {
  if (!rows.length)
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma divergência nesta categoria.
        </CardContent>
      </Card>
    );
  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-secondary/80 text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-2 py-2 text-left">Tipo</th>
                <th className="px-2 py-2 text-left">Importado</th>
                <th className="px-2 py-2 text-left">Lançamento existente</th>
                <th className="px-2 py-2 text-right">Δ valor</th>
                <th className="px-2 py-2 text-right">Δ dias</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => {
                const meta = TYPE_META[f.type];
                const Icon = meta.icon;
                return (
                  <tr
                    key={i}
                    className="border-t border-border/40 align-top hover:bg-secondary/20"
                  >
                    <td className="px-2 py-2">
                      <Badge variant={meta.tone} className="gap-1">
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="px-2 py-2">
                      <p className="font-medium">{f.imported.description}</p>
                      <p className="text-muted-foreground numeric">
                        {f.imported.date} ·{" "}
                        {f.imported.kind === "revenue" ? "+" : "−"}
                        {formatBRL(f.imported.amountCents)}
                      </p>
                    </td>
                    <td className="px-2 py-2">
                      {f.matchedTransactionId ? (
                        <>
                          <p className="font-medium">{f.matchedDescription}</p>
                          <p className="text-muted-foreground numeric">
                            {f.matchedDate} · {formatBRL(f.matchedAmountCents ?? 0)}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className={`px-2 py-2 text-right numeric ${
                        f.deltaCents !== 0 ? "text-destructive" : ""
                      }`}
                    >
                      {f.deltaCents === 0 ? "—" : formatBRL(f.deltaCents)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right numeric ${
                        f.deltaDays > 0 ? "text-amber-500" : ""
                      }`}
                    >
                      {f.deltaDays === 0 ? "—" : `${f.deltaDays}d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
