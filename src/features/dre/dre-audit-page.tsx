import { useEffect, useMemo, useState } from "react";
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
import type { ClassificationGap } from "./dre-audit.domain";
import { ClassificationGapDetails } from "./classification-gap-details";
import { AuditReassignmentPreview } from "./audit-reassignment-preview";
import {
  fillMissingCompetencia,
  getDreAudit,
  reassignCategory,
  deleteBulkTransactions,
  type DreAuditIssue,
} from "./dre-audit.functions";

const REASON_LABELS: Record<DreAuditIssue["reason"], string> = {
  sem_categoria: "Sem categoria",
  categoria_sem_dre_line: "Categoria sem linha válida da DRE",
  categoria_sem_account_class: "Categoria sem classe contábil",
  sem_competencia: "Sem competência",
  conta_patrimonial_em_dre: "Conta patrimonial (excluída da DRE)",
  duplicidade_detectada: "Duplicidade detectada",
};

const REASON_TONE: Record<DreAuditIssue["reason"], "critical" | "warning" | "info"> = {
  sem_categoria: "critical",
  categoria_sem_dre_line: "critical",
  categoria_sem_account_class: "warning",
  sem_competencia: "warning",
  conta_patrimonial_em_dre: "info",
  duplicidade_detectada: "critical",
};

const REASON_HINTS: Record<DreAuditIssue["reason"], string> = {
  sem_categoria:
    "Lançamento sem categoria vinculada. Não entra em nenhuma linha da DRE — atribua uma categoria para que seja contabilizado corretamente.",
  categoria_sem_dre_line:
    "A categoria está sem linha válida da DRE ou marcada como 'não aplicável' apesar de não ser patrimonial. O lançamento fica fora da DRE contábil. Revise o enquadramento antes de alterar a categoria.",
  categoria_sem_account_class:
    "A categoria não tem uma classe contábil CPC (receita, custo, despesa operacional, financeira…). Impede o agrupamento correto na DRE e em relatórios gerenciais.",
  sem_competencia:
    "Falta a data de competência (mês/ano em que a receita/despesa foi gerada). A DRE segue regime de competência; sem essa data o lançamento pode cair no mês errado. Use 'Preencher competência = data' para adotar a data do lançamento.",
  conta_patrimonial_em_dre:
    "Conta patrimonial (Balanço) — fornecedores, principal de empréstimos ou imobilizado. É excluída do resultado. Seu efeito no saldo de caixa depende de conciliação de liquidações e contas bancárias, ainda não homologada. Item informativo.",
  duplicidade_detectada:
    "Há lançamentos com a mesma impressão digital. Isso pode indicar uma importação duplicada, mas não comprova duplicidade. Confronte extratos e documentos antes de marcar algum registro como excluído.",
};

export function DreAuditPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const year = useMemo(() => range.year, [range.year]);
  const fetchAudit = useServerFn(getDreAudit);
  const fetchCategories = useServerFn(listCategories);
  const fillCompetencia = useServerFn(fillMissingCompetencia);
  const reassign = useServerFn(reassignCategory);
  const deleteBulk = useServerFn(deleteBulkTransactions);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetCategory, setTargetCategory] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<ClassificationGap | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setTargetCategory("");
    setSelectedGroup(null);
  }, [companyId, year]);

  const { data, isLoading, isError, error, refetch } = useQuery({
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
    // Alterações explícitas feitas na auditoria afetam DRE, Dashboard, relatórios e IA.
    void queryClient.invalidateQueries();
    setSelected(new Set());
    setSelectedGroup(null);
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

  const deleteMut = useMutation({
    mutationFn: (ids: string[]) =>
      deleteBulk({ data: { companyId: companyId!, transactionIds: ids } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} lançamento(s) marcado(s) como excluído(s).`);
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

  const selectedKind = useMemo(() => {
    const selectedKinds = new Set(
      (data?.issues ?? [])
        .filter((issue) => selected.has(issue.id))
        .map((issue) => issue.kind),
    );
    return selectedKinds.size === 1 ? [...selectedKinds][0] : null;
  }, [data?.issues, selected]);

  useEffect(() => {
    setTargetCategory("");
  }, [selectedKind]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria da DRE</h1>
        <p className="text-sm text-muted-foreground">
          Identifica lançamentos sem categoria, sem competência ou fora da classificação contábil.
          Contas patrimoniais corretamente excluídas não são tratadas como inconsistências.
        </p>
      </div>

      {isLoading && <p role="status" className="text-sm text-muted-foreground">Carregando auditoria…</p>}
      {isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">Não foi possível carregar a Auditoria DRE: {error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

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
                {(Object.keys(data.byReason) as DreAuditIssue["reason"][])
                  .filter((reason) => data.byReason[reason] > 0)
                  .map((reason) => (
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

          {data.unmappedGroups.length > 0 && (
            <Card>
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Categorias pendentes de enquadramento na DRE</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Totais de todos os lançamentos analisados, não apenas dos 500 exemplos abaixo.
                  Clique em Investigar para ver grupos por descrição, valores e lançamentos.
                  Os sinais não substituem documentação contábil. Nenhuma reclassificação é automática.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Linha DRE atual</TableHead>
                        <TableHead className="text-right">Lançamentos</TableHead>
                        <TableHead className="text-right">Despesas</TableHead>
                        <TableHead className="text-right">Receitas</TableHead>
                        <TableHead className="text-right">Investigação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.unmappedGroups.map((group) => (
                        <TableRow key={group.categoryId ?? "sem-categoria"}>
                          <TableCell className="font-medium">{group.categoryName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {group.dreLine ?? "Sem linha"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{group.count}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(group.expenseCents)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(group.revenueCents)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              aria-expanded={selectedGroup?.categoryId === group.categoryId}
                              onClick={() => {
                                setSelectedGroup((current) => current?.categoryId === group.categoryId ? null : group);
                              }}
                            >
                              {selectedGroup?.categoryId === group.categoryId ? "Fechar" : "Investigar"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {selectedGroup && companyId && (
                  <ClassificationGapDetails
                    key={selectedGroup.categoryId ?? "sem-categoria"}
                    companyId={companyId}
                    year={year}
                    group={selectedGroup}
                    onClose={() => setSelectedGroup(null)}
                  />
                )}
              </CardContent>
            </Card>
          )}

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
                  onClick={() => {
                    if (confirm(`Preencher a competência de ${selectedMissingCompetencia.length} lançamento(s) usando a data do registro? Isso pode afetar a DRE. Confirme apenas após verificar que as datas correspondem ao fato gerador.`)) {
                      fillMut.mutate(selectedMissingCompetencia);
                    }
                  }}
                >
                  Preencher competência = data ({selectedMissingCompetencia.length})
                </Button>
                <Select value={targetCategory} onValueChange={setTargetCategory} disabled={!selectedKind}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue placeholder="Reatribuir categoria…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c.kind === selectedKind).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.kind === "revenue" ? "Receita" : "Despesa"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedIds.length > 0 && !selectedKind && (
                  <span className="text-xs text-amber-600">
                    Para reclassificar, selecione apenas receitas ou apenas despesas.
                  </span>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={selectedIds.length === 0 || deleteMut.isPending}
                  onClick={() => {
                    if (confirm(`Deseja marcar como excluídos os ${selectedIds.length} lançamentos selecionados? Os registros não serão apagados fisicamente.`)) {
                      deleteMut.mutate(selectedIds);
                    }
                  }}
                >
                  Marcar como excluídos
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedIds.length > 0 && selectedKind && targetCategory && companyId && (
                <AuditReassignmentPreview
                  companyId={companyId}
                  categoryId={targetCategory}
                  selectedIds={selectedIds}
                  submitting={reassignMut.isPending}
                  onApply={() => reassignMut.mutate({ ids: selectedIds, categoryId: targetCategory })}
                />
              )}
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
