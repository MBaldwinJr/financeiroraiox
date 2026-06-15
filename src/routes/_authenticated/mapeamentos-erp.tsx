import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ErpMappingsReviewPage } from "@/features/import/erp-mappings-review-page";

export const Route = createFileRoute("/_authenticated/mapeamentos-erp")({
  head: () => ({ meta: [{ title: "Mapeamentos ERP — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <ErpMappingsReviewPage />
    </AppShell>
  ),
});
