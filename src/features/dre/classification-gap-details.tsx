import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatBRL, formatDate, MONTH_LABELS } from "@/lib/money";
import type { ClassificationGap } from "./dre-audit.domain";
import { getAuditClassificationDetails } from "./dre-audit-details.functions";

interface Props {
  companyId: string;
  year: number;
  group: ClassificationGap;
  onClose: () => void;
}

/** Consulta detalhes exclusivamente quando o usuário abre uma categoria. */
export function ClassificationGapDetails({ companyId, year, group, onClose }: Props) {
  const [month, setMonth] = useState<string>("all");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const fetcher = useServerFn(getAuditClassificationDetails);
  const selectedMonth = month === "all" ? null : Number(month);

  const query = useQuery({
    queryKey: ["dre-audit-details", companyId, year, group.categoryId, month, search, page],
    queryFn: () => fetcher({
      data: { companyId, year, month: selectedMonth, categoryId: group.categoryId, search, page },
    }),
    staleTime: 30_000,
  });

  const total = query.data?.total ?? 0;
  const offset = page * 25;
  const shown = query.data?.rows.length ?? 0;

  return (
    <Card className="mt-4 border-blue-200 bg-secondary/20">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Analisar lançamentos: {group.categoryName}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Consulta detalhada somente de leitura, por competência. Nenhuma classificação será alterada.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <X className="mr-1 h-4 w-4" aria-hidden="true" /> Fechar
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px]">
            <label htmlFor="audit-detail-month" className="mb-1 block text-xs text-muted-foreground">Competência</label>
            <Select value={month} onValueChange={(v) => { setMonth(v); setPage(0); }}>
              <SelectTrigger id="audit-detail-month" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ano inteiro ({year})</SelectItem>
                {MONTH_LABELS.map((label, index) => (
                  <SelectItem key={label} value={String(index + 1)}>{label}/{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(draftSearch.trim());
              setPage(0);
            }}
            className="flex min-w-[240px] flex-1 gap-2"
          >
            <Input
              aria-label="Filtrar descrição"
              placeholder="Buscar na descrição..."
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              maxLength={100}
              className="h-9"
            />
            <Button type="submit" size="sm" variant="outline" aria-label="Buscar lançamentos">
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && <p role="status" className="text-sm text-muted-foreground">Carregando lançamentos…</p>}
        {query.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-destructive">
            <span>Falha na consulta: {query.error.message}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Tentar novamente</Button>
          </div>
        )}
        {query.data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{total === 0 ? "Nenhum registro encontrado" : `${offset + 1}–${offset + shown} de ${total} lançamentos`}</span>
              <span>Ordenados por maior valor; sem edição ou exclusão nesta consulta</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.rows.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs">{entry.competencia ? formatDate(entry.competencia) : "Não informada"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(entry.date)}</TableCell>
                      <TableCell className="min-w-[220px] max-w-[460px] text-xs">{entry.description ?? "Sem descrição"}</TableCell>
                      <TableCell className="text-xs">{entry.kind === "expense" ? "Despesa" : "Receita"}</TableCell>
                      <TableCell className="text-xs">{entry.status === "paid" ? "Liquidado" : "Pendente"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums font-medium">{formatBRL(entry.amount_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage((v) => Math.max(0, v - 1))}>Anterior</Button>
              <Button type="button" size="sm" variant="outline" disabled={offset + shown >= total || query.isFetching} onClick={() => setPage((v) => v + 1)}>Próxima</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
