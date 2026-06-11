import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { StubPage } from "@/components/layout/stub-page";

export const Route = createFileRoute("/_authenticated/despesas")({
  head: () => ({ meta: [{ title: "Despesas — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <StubPage
        title="Despesas"
        description="Análise detalhada de saídas por categoria, fornecedor e centro de custo."
        hint="Use a tela de Lançamentos com filtro de Tipo = Despesa enquanto a página dedicada é finalizada."
        redirectTo="/lancamentos"
        redirectLabel="Abrir Lançamentos"
      />
    </AppShell>
  ),
});
