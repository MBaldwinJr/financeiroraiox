import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { KindTransactionsPage } from "@/features/transactions/kind-transactions-page";

export const Route = createFileRoute("/_authenticated/despesas")({
  head: () => ({ meta: [{ title: "Despesas — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <KindTransactionsPage
        kind="expense"
        title="Despesas"
        description="Saídas por categoria, fornecedor e centro de custo."
      />
    </AppShell>
  ),
});
