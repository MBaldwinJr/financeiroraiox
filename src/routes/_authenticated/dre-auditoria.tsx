import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DreAuditPage } from "@/features/dre/dre-audit-page";

export const Route = createFileRoute("/_authenticated/dre-auditoria")({
  head: () => ({ meta: [{ title: "Auditoria DRE — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <DreAuditPage />
    </AppShell>
  ),
});
