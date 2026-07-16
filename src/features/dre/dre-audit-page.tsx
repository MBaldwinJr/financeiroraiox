import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBRL } from "@/lib/money";
import { listCategories } from "@/features/catalog/catalog.functions";
import {
  fillMissingCompetencia,
  getDreAudit,
  reassignCategory,
  type DreAuditIssue,
} from "./dre-audit.functions";

const REASON_LABELS: Record<DreAuditIssue["reason"], string> = {
  sem_categoria: "Sem categoria",
  categoria_sem_dre_line: "Categoria sem linha da DRE",
  categoria_sem_account_class: "Categoria sem classe contábil",
  sem_competencia: "Sem competência",
  conta_patrimonial_em_dre: "Conta patrimonial (excluída da DRE)",
};

const REASON_TONE: Record<DreAuditIssue["reason"], "critical" | "warning" | "info"> = {
  sem_categoria: "critical",
  categoria_sem_dre_line: "critical",
  categoria_sem_account_class: "warning",
  sem_competencia: "warning",
  conta_patrimonial_em_dre: "info",
};

const REASON_HINTS: Record<DreAuditIssue["reason"], string> = {
  sem_categoria:
    "Lançamento sem categoria vinculada. Não entra em nenhuma linha da DRE — atribua uma categoria para que seja contabilizado corretamente.",
  categoria_sem_dre_line:
    "A categoria existe, mas não está mapeada a uma linha da DRE (Receita Bruta, CMV, Despesas Fixas, etc.). Sem esse mapeamento, o valor fica de fora do resultado. Ajuste em Mapeamentos ERP ou no cadastro da categoria.",
  categoria_sem_account_class:
    "A categoria não tem uma classe contábil CPC (receita, custo, despesa operacional, financeira…). Impede o agrupamento correto na DRE e em relatórios gerenciais.",
  sem_competencia:
    "Falta a data de competência (mês/ano em que a receita/despesa foi gerada). A DRE segue regime de competência; sem essa data o lançamento pode cair no mês errado. Use 'Preencher competência = data' para adotar a data do lançamento.",
  conta_patrimonial_em_dre:
    "Categoria classificada como conta patrimonial (Balanço) — Fornecedores, Empréstimos (principal), Compra de Imobilizado. São liquidações/movimentações de Ativo ou Passivo e NÃO devem impactar o resultado. Já são excluídas automaticamente da DRE e aparecem apenas no Fluxo de Caixa. Este item é informativo.",
};

export function DreAuditPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const year = useMemo(() => range.year, [range.year]);
  const fetchAudit = useServerFn(getDreAudit);
  const fetchCategories = useServerFn(listCategories);
  const fillCompetencia = useServerFn(fillMissingCompetencia);
  const reassign = useServerFn(reassignCategory);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetCategory, setTargetCategory] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["dre-audit", companyId, year],
    enabled: Boolean(companyId),
    queryFn: () => fetchAudit({ data: { companyId: companyId!, year } }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchCategories({ data: { companyId: companyId! } }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["dre-audit", companyId, year] });
    setSelected(new Set());
  };

  const fillMut = useMutation({
    mutationFn: (ids: string[]) =>
      fillCompetencia({ data: { companyId: companyId!, transactionIds: ids } }),
    onSuccess: (r) => {
      toast.success(`Competência preenchida em ${r.updated} lançamento(s).`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reassignMut = useMutation({
    mutationFn: (payload: { ids: string[]; categoryId: string }) =>
      reassign({
        data: {
          companyId: companyId!,
          transactionIds: payload.ids,
          categoryId: payload.categoryId,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Categoria atribuída a ${r.updated} lançamento(s).`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableIds = useMemo(
    () => Array.from(new Set((data?.issues ?? []).map((i) => i.id))),
    [data?.issues],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const selectedIds = Array.from(selected);
  const selectedMissingCompetencia = useMemo(() => {
    const s = new Set<string>();
    for (const i of data?.issues ?? []) {
      if (selected.has(i.id) && i.reason === "sem_competencia") s.add(i.id);
    }
    return Array.from(s);
  }, [data?.issues, selected]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria da DRE</h1>
        <p className="text-sm text-muted-foreground">
          Detecta lançamentos que podem distorcer a DRE — sem categoria, sem competência ou contas
          patrimoniais indevidas.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando auditoria…</p>}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Lançamentos analisados
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{data.totalTransactions}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Inconsistências</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-2xl font-semibold">
                {data.totalIssues === 0 ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" /> 0
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-6 w-6 text-amber-500" /> {data.totalIssues}
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Distribuição</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(Object.keys(data.byReason) as DreAuditIssue["reason"][]).map((reason) => (
                  <Tooltip key={reason}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={REASON_TONE[reason] === "critical" ? "destructive" : "secondary"}
                        className="cursor-help"
                      >
                        {REASON_LABELS[reason]}: {data.byReason[reason]}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                      {REASON_HINTS[reason]}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Lançamentos com inconsistência (top 500)</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {selectedIds.length} selecionado(s)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    selectedMissingCompetencia.length === 0 || fillMut.isPending
                  }
                  onClick={() => fillMut.mutate(selectedMissingCompetencia)}
                >
                  Preencher competência = data ({selectedMissingCompetencia.length})
                </Button>
                <Select value={targetCategory} onValueChange={setTargetCategory}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue placeholder="Reatribuir categoria…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.kind === "revenue" ? "Receita" : "Despesa"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={
                    !targetCategory || selectedIds.length === 0 || reassignMut.isPending
                  }
                  onClick={() =>
                    reassignMut.mutate({ ids: selectedIds, categoryId: targetCategory })
                  }
                >
                  Aplicar categoria
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma inconsistência encontrada no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleAll}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Competência</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.issues.map((issue) => (
                      <TableRow key={`${issue.id}-${issue.reason}`}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(issue.id)}
                            onCheckedChange={() => toggle(issue.id)}
                            aria-label="Selecionar linha"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{issue.date}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {issue.competencia ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate text-xs">
                          {issue.description ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{issue.categoryName ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatBRL(issue.amount_cents)}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant={
                                  REASON_TONE[issue.reason] === "critical"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="cursor-help"
                              >
                                {REASON_LABELS[issue.reason]}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs leading-relaxed">
                              {REASON_HINTS[issue.reason]}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
    </TooltipProvider>
  );
}
