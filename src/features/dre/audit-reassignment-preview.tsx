import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calculator, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { getAuditReassignmentPreview } from "./dre-audit.functions";

interface Props {
  companyId: string;
  categoryId: string;
  selectedIds: string[];
  submitting: boolean;
  onApply: () => void;
}

/**
 * É necessário gerar uma prévia para esta seleção exata antes de aplicar.
 * O endpoint de escrita faz novamente as validações de empresa e tipo.
 */
export function AuditReassignmentPreview({
  companyId,
  categoryId,
  selectedIds,
  submitting,
  onApply,
}: Props) {
  const fetcher = useServerFn(getAuditReassignmentPreview);
  const sortedIds = [...selectedIds].sort();
  const selectionKey = JSON.stringify([companyId, categoryId, sortedIds]);
  const [requestedKey, setRequestedKey] = useState<string | null>(null);

  useEffect(() => {
    setRequestedKey(null);
  }, [selectionKey]);

  const query = useQuery({
    queryKey: ["audit-reassignment-preview", selectionKey],
    enabled: requestedKey === selectionKey && selectedIds.length > 0 && !!categoryId,
    queryFn: () => fetcher({
      data: { companyId, categoryId, transactionIds: sortedIds },
    }),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const validPreview = requestedKey === selectionKey
    && query.isSuccess
    && !query.isFetching
    && query.data?.selectedCount === selectedIds.length;
  const impact = validPreview ? query.data : null;
  const noImpact = impact?.differences.every((line) => line.deltaCents === 0) ?? false;

  return (
    <div className="w-full space-y-3 rounded-xl border border-border/80 bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedIds.length === 0 || submitting || query.isFetching}
          onClick={() => setRequestedKey(selectionKey)}
        >
          <Calculator className="mr-1 h-4 w-4" aria-hidden="true" />
          {query.isFetching ? "Calculando…" : "Simular impacto na DRE"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!validPreview || submitting}
          onClick={() => {
            if (!impact) return;
            const difference = impact.differences.find((row) => row.line === "lucro_liquido");
            const message = [
              "Confirma a reclassificação dos " + impact.selectedCount + " lançamentos?",
              "Destino: " + impact.destinationName + ".",
              "Variação simulada de Lucro Líquido na DRE: " + formatBRL(difference?.deltaCents ?? 0) + ".",
              "A simulação considera apenas a seleção, não os totais da empresa.",
              "Verifique os documentos antes de aplicar a alteração.",
            ].join("\n");
            if (confirm(message)) onApply();
          }}
        >
          Aplicar categoria após revisão
        </Button>
        {!validPreview && <span className="text-xs text-muted-foreground">Simule antes de aplicar</span>}
      </div>

      {query.isError && requestedKey === selectionKey && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
          A prévia não pôde ser gerada: {query.error.message}
        </p>
      )}
      {impact && (
        <section aria-label="Prévia de reclassificação" className="space-y-3">
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            Prévia calculada sem alterar dados. Os valores abaixo são a contribuição dos
            { " " }{impact.selectedCount} lançamentos selecionados na DRE — NÃO são o total da empresa.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Indicador</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Antes</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Depois (hipótese)</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Variação</th>
                </tr>
              </thead>
              <tbody>
                {impact.differences.map((line) => (
                  <tr key={line.line} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 font-medium">{line.label}</th>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(line.beforeCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(line.afterCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatBRL(line.deltaCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {impact.withoutCompetenciaCount > 0 && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {impact.withoutCompetenciaCount} lançamento(s) sem competência não entram na simulação da DRE.
              Não preencha datas automaticamente sem conferir o fato gerador.
            </p>
          )}
          {!impact.destinationHasDreLine && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              O destino está fora das linhas calculadas pela DRE.
              Confirme se é realmente patrimonial ou se precisa de mapeamento contábil.
            </p>
          )}
          {noImpact && (
            <p className="text-xs text-muted-foreground">
              A simulação não altera nenhum dos indicadores exibidos. Isso não garante que o enquadramento esteja correto.
            </p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            A prévia usa a classificação de destino e o motor contábil atual; não é parecer fiscal,
            não altera a DRE e não substitui aprovação documental.
          </p>
        </section>
      )}
    </div>
  );
}
