import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { StubPage } from "@/components/layout/stub-page";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <StubPage
        title="Relatórios"
        description="Exporte DRE, fluxo de caixa e análises em PDF/Excel."
        hint="A geração de relatórios em PDF e Excel está sendo finalizada. Use a DRE para visualização interativa."
        redirectTo="/dre"
        redirectLabel="Abrir DRE"
      />
    </AppShell>
  ),
});
