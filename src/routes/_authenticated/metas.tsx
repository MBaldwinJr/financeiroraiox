import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { StubPage } from "@/components/layout/stub-page";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({ meta: [{ title: "Metas — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <StubPage
        title="Metas Financeiras"
        description="Defina metas mensais e anuais de receita, lucro e redução de despesas."
        hint="O módulo de metas será liberado em breve com acompanhamento de progresso e alertas."
      />
    </AppShell>
  ),
});
