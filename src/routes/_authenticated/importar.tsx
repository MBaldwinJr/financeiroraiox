import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ImportPage } from "@/features/import/import-page";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({ meta: [{ title: "Importar — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <ImportPage />
    </AppShell>
  ),
});
