import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsPage } from "@/features/settings/settings-page";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});
