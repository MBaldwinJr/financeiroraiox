import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { getAnalytics } from "@/features/analytics/analytics.functions";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge } from "@/components/charts/gauge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function RaioXPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const fetcher = useServerFn(getAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", companyId, range.year, range.month],
    queryFn: () =>
      fetcher({ data: { companyId: companyId!, year: range.year, month: range.month } }),
    enabled: !!companyId,
  });

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;
  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">Analisando saúde financeira…</p>;

  const { score } = data;
  const gradeColor =
    score.grade === "Excelente"
      ? "text-success"
      : score.grade === "Atenção"
        ? "text-warning"
        : "text-destructive";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Raio-X Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Score consolidado da saúde financeira da empresa em {range.year}.
        </p>
      </header>
      <FilterBar />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Score Geral</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <Gauge value={score.total} label={score.grade} />
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Diagnóstico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <p className={cn("numeric text-5xl font-black", gradeColor)}>{score.total}</p>
              <p className={cn("pb-1 text-lg font-semibold", gradeColor)}>{score.grade}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {score.grade === "Excelente" &&
                "Sua empresa apresenta indicadores robustos. Continue acompanhando a estabilidade do caixa e oportunidades de crescimento."}
              {score.grade === "Atenção" &&
                "Há pontos de atenção em alguns indicadores. Revise as categorias com menor pontuação abaixo."}
              {score.grade === "Crítico" &&
                "Indicadores críticos detectados. Recomendamos revisar margem, despesas fixas e estabilidade de caixa imediatamente."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {score.components.map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium">{c.label}</span>
                    <span className={cn("numeric text-xs font-bold", scoreColor(c.score))}>
                      {Math.round(c.score)}
                    </span>
                  </div>
                  <Progress value={c.score} className="h-1.5" />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Peso {Math.round(c.weight * 100)}%
                  </p>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function scoreColor(v: number): string {
  if (v >= 80) return "text-success";
  if (v >= 60) return "text-warning";
  return "text-destructive";
}
