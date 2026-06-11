import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { AiCopilotPage } from "@/features/ai-copilot/ai-copilot-page";

export const Route = createFileRoute("/_authenticated/ia")({
  head: () => ({ meta: [{ title: "IA Financeira — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <AiCopilotPage />
    </AppShell>
  ),
});
