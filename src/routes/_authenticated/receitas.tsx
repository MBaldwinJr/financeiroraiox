import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { KindTransactionsPage } from "@/features/transactions/kind-transactions-page";

export const Route = createFileRoute("/_authenticated/receitas")({
  head: () => ({ meta: [{ title: "Receitas — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <KindTransactionsPage
        kind="revenue"
        title="Receitas"
        description="Análise detalhada de entradas por categoria e período."
      />
    </AppShell>
  ),
});
