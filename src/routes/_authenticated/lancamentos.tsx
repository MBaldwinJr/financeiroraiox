import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionsPage } from "@/features/transactions/transactions-page";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <TransactionsPage />
    </AppShell>
  ),
});
