import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardPage } from "@/features/dashboard/dashboard-page";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <DashboardPage />
    </AppShell>
  ),
});
