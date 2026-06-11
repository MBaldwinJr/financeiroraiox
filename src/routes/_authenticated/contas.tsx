import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { BankAccountsPage } from "@/features/accounts/accounts-page";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({ meta: [{ title: "Contas Bancárias — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <BankAccountsPage />
    </AppShell>
  ),
});
