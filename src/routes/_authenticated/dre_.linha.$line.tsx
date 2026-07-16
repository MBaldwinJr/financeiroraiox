import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DreLineDetailPage } from "@/features/dre/dre-line-detail-page";
import { STORED_DRE_LINES, type StoredDreLine } from "@/features/dre/dre-line.functions";

export const Route = createFileRoute("/_authenticated/dre_/linha/$line")({
  head: () => ({ meta: [{ title: "Detalhe da Linha DRE — Finance Vision BI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { line } = Route.useParams();
  if (!(STORED_DRE_LINES as readonly string[]).includes(line)) throw notFound();
  return (
    <AppShell>
      <DreLineDetailPage line={line as StoredDreLine} />
    </AppShell>
  );
}
