import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DreGroupDetailPage } from "@/features/dre/dre-group-detail-page";
import type { DreGroupKey } from "@/features/dre/dre-group.functions";

const VALID_GROUPS: DreGroupKey[] = [
  "revenue",
  "cmv",
  "supplier",
  "freight",
  "fixed",
  "variable",
  "operational",
  "other",
];

export const Route = createFileRoute("/_authenticated/dre/$group")({
  head: () => ({ meta: [{ title: "Detalhe DRE — Finance Vision BI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { group } = Route.useParams();
  if (!VALID_GROUPS.includes(group as DreGroupKey)) throw notFound();
  return (
    <AppShell>
      <DreGroupDetailPage group={group as DreGroupKey} />
    </AppShell>
  );
}
