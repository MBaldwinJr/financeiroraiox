import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { getDreAudit, type DreAuditIssue } from "./dre-audit.functions";

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

export function DreAuditPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const year = useMemo(() => new Date(range.start).getFullYear(), [range.start]);
  const fetchAudit = useServerFn(getDreAudit);

  const { data, isLoading } = useQuery({
    queryKey: ["dre-audit", companyId, year],
    enabled: Boolean(companyId),
    queryFn: () => fetchAudit({ data: { companyId: companyId!, year } }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria da DRE</h1>
        <p className="text-sm text-muted-foreground">
          Detecta lançamentos que podem distorcer a DRE — sem categoria, sem competência ou contas patrimoniais indevidas.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando auditoria…</p>}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Lançamentos analisados</CardTitle>
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
                  <Badge
                    key={reason}
                    variant={REASON_TONE[reason] === "critical" ? "destructive" : "secondary"}
                  >
                    {REASON_LABELS[reason]}: {data.byReason[reason]}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Lançamentos com inconsistência (top 500)</CardTitle>
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
                          <Badge
                            variant={
                              REASON_TONE[issue.reason] === "critical" ? "destructive" : "secondary"
                            }
                          >
                            {REASON_LABELS[issue.reason]}
                          </Badge>
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
  );
}
