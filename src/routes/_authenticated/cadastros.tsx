import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { CatalogPage } from "@/features/catalog/catalog-page";

export const Route = createFileRoute("/_authenticated/cadastros")({
  head: () => ({ meta: [{ title: "Cadastros — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <CatalogPage />
    </AppShell>
  ),
});
