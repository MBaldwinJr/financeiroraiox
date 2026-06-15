import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";

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
  diagnoseImportJob,
  recategorizeTransactions,
} from "@/features/import/import-jobs.functions";
import { listCategories } from "@/features/catalog/catalog.functions";
import { formatBRL } from "@/lib/money";

interface Props {
  jobId: string;
  companyId: string;
}

export function ImportDiagnostic({ jobId, companyId }: Props) {
  const qc = useQueryClient();
  const diagnoseFn = useServerFn(diagnoseImportJob);
  const recategorizeFn = useServerFn(recategorizeTransactions);
  const fetchCategories = useServerFn(listCategories);

  const catsQ = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => fetchCategories({ data: { companyId } }),
  });

  const diagQ = useQuery({
    queryKey: ["import-diagnostic", jobId],
    queryFn: () => diagnoseFn({ data: { jobId } }),
  });

  const [targetByIntended, setTargetByIntended] = useState<Record<string, string>>({});

  const recatMut = useMutation({
    mutationFn: ({ ids, categoryId }: { ids: string[]; categoryId: string }) =>
      recategorizeFn({ data: { companyId, transactionIds: ids, categoryId } }),
    onSuccess: ({ updated }) => {
      toast.success(`${updated} lançamento(s) recategorizado(s).`);
      qc.invalidateQueries();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao recategorizar."),
  });

  const groupsByIntended = useMemo(() => {
    const m = new Map<
      string,
      { intended: string; items: typeof diagQ.data extends { divergent: infer A } ? A : never }
    >();
    (diagQ.data?.divergent ?? []).forEach((d) => {
      const key = d.intendedCategoryName ?? "—";
      const g = m.get(key) ?? { intended: key, items: [] as never };
      (g.items as unknown[]).push(d);
      m.set(key, g);
    });
    return [...m.values()];
  }, [diagQ.data]);

  if (diagQ.isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando duplicados…
        </CardContent>
      </Card>
    );
  }
  if (!diagQ.data) return null;

  const {
    byCategory,
    totalImportCents,
    netImportCents,
    duplicateImportRows,
    duplicateImportCents,
    duplicateImportGroups,
    matchedCount,
    importedCount,
  } = diagQ.data;

  return (
    <Card className="glass-card mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Diagnóstico — onde estão os duplicados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">PDF bruto: {importedCount} linhas · {formatBRL(totalImportCents)}</Badge>
          <Badge variant="outline">
            Duplicados no PDF: {duplicateImportRows} linhas · {formatBRL(duplicateImportCents)}
          </Badge>
          <Badge variant="outline">Base líquida do DRE: {formatBRL(netImportCents)}</Badge>
          <Badge variant="outline">Encontradas no sistema: {matchedCount}</Badge>
        </div>

        {duplicateImportGroups.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Linhas repetidas dentro do próprio PDF
            </p>
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Documento</th>
                    <th className="px-3 py-2 text-left">Descrição</th>
                    <th className="px-3 py-2 text-right">Repetições</th>
                    <th className="px-3 py-2 text-right">Valor duplicado</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateImportGroups.map((g) => (
                    <tr
                      key={`${g.date}-${g.erpCode ?? ""}-${g.docNumber ?? ""}-${g.description}`}
                      className="border-t border-border/40"
                    >
                      <td className="px-3 py-1.5 numeric whitespace-nowrap">{g.date}</td>
                      <td className="px-3 py-1.5 numeric whitespace-nowrap">{g.docNumber ?? "—"}</td>
                      <td className="px-3 py-1.5">{g.description}</td>
                      <td className="px-3 py-1.5 text-right numeric">
                        {g.duplicateRows} de {g.occurrences}
                      </td>
                      <td className="px-3 py-1.5 text-right numeric">
                        {formatBRL(g.duplicateAmountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              O total bruto do PDF inclui essas repetições. A importação grava uma única vez cada
              lançamento idêntico; por isso o DRE usa a base líquida.
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Categorias atuais dos lançamentos já existentes
          </p>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Categoria atual</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((b) => (
                  <tr key={b.categoryName} className="border-t border-border/40">
                    <td className="px-3 py-1.5">{b.categoryName}</td>
                    <td className="px-3 py-1.5 text-right numeric">{b.count}</td>
                    <td className="px-3 py-1.5 text-right numeric">{formatBRL(b.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Diferenças entre o relatório e o DRE acontecem quando lançamentos do mesmo PDF foram
            registrados antes em outra categoria.
          </p>
        </div>

        {groupsByIntended.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Divergências de categoria ({(diagQ.data.divergent ?? []).length})
            </p>
            <div className="space-y-2">
              {groupsByIntended.map((g) => {
                const items = g.items as unknown as Array<{
                  transactionId: string;
                  date: string;
                  amountCents: number;
                  currentCategoryName: string;
                }>;
                const total = items.reduce((a, x) => a + x.amountCents, 0);
                const targetId = targetByIntended[g.intended] ?? "";
                return (
                  <div
                    key={g.intended}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-secondary/20 p-2"
                  >
                    <div className="text-xs">
                      <span className="font-medium">Importado como:</span> {g.intended} ·{" "}
                      <span className="text-muted-foreground">
                        {items.length} lançamento(s) · {formatBRL(total)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={targetId}
                        onValueChange={(v) =>
                          setTargetByIntended((p) => ({ ...p, [g.intended]: v }))
                        }
                      >
                        <SelectTrigger className="h-7 w-[200px] text-xs">
                          <SelectValue placeholder="Mover para…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(catsQ.data ?? [])
                            .filter((c) => c.kind === "expense")
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!targetId || recatMut.isPending}
                        onClick={() =>
                          recatMut.mutate({
                            ids: items.map((i) => i.transactionId),
                            categoryId: targetId,
                          })
                        }
                      >
                        <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Mover
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
