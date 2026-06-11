import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { MetasPage } from "@/features/goals/metas-page";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({ meta: [{ title: "Metas — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <MetasPage />
    </AppShell>
  ),
});
