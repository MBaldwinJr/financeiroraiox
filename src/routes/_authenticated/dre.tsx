import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DrePage } from "@/features/dre/dre-page";

export const Route = createFileRoute("/_authenticated/dre")({
  head: () => ({ meta: [{ title: "DRE — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <DrePage />
    </AppShell>
  ),
});
