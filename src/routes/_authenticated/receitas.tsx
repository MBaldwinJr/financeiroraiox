import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { StubPage } from "@/components/layout/stub-page";

export const Route = createFileRoute("/_authenticated/receitas")({
  head: () => ({ meta: [{ title: "Receitas — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <StubPage
        title="Receitas"
        description="Detalhamento de entradas, comparativos e previsões."
        hint="Use a tela de Lançamentos com o filtro de Tipo = Receita para visualizar os registros enquanto a página dedicada é finalizada."
        redirectTo="/lancamentos"
        redirectLabel="Abrir Lançamentos"
      />
    </AppShell>
  ),
});
