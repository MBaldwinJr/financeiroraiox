import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { CommercialPage } from "@/features/commercial/commercial-page";

export const Route = createFileRoute("/_authenticated/comercial")({
  head: () => ({
    meta: [{ title: "Performance Comercial — Finance Vision Pro" }],
  }),
  component: () => (
    <AppShell>
      <CommercialPage />
    </AppShell>
  ),
});
