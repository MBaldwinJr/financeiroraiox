import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ErpPdfImportPage } from "@/features/import/erp-pdf-import-page";

export const Route = createFileRoute("/_authenticated/importar-erp")({
  head: () => ({ meta: [{ title: "Importar PDF do ERP — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <ErpPdfImportPage />
    </AppShell>
  ),
});
