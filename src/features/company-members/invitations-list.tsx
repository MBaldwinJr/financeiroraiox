import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelCompanyInvitation, listCompanyInvitations } from "./company-members.functions";

type DisplayStatus = "pending" | "accepted" | "expired" | "cancelled" | "failed";

const STATUS_LABELS: Record<DisplayStatus, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  expired: "Expirado",
  cancelled: "Cancelado",
  failed: "Falhou",
};

function displayStatus(status: string, expiresAt: string): DisplayStatus {
  if (status === "pending" && new Date(expiresAt).getTime() < Date.now()) return "expired";
  return (status in STATUS_LABELS ? status : "failed") as DisplayStatus;
}

export function InvitationsList({ companyId }: { readonly companyId: string }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listCompanyInvitations);
  const cancel = useServerFn(cancelCompanyInvitation);
  const invitations = useQuery({
    queryKey: ["company-invitations", companyId],
    queryFn: () => list({ data: { companyId } }),
  });
  const mutation = useMutation({
    mutationFn: (invitationId: string) => cancel({ data: { companyId, invitationId } }),
    onSuccess: () => {
      toast.success("Convite cancelado");
      queryClient.invalidateQueries({ queryKey: ["company-invitations", companyId] });
    },
    onError: (error) => toast.error("Não foi possível cancelar", { description: error.message }),
  });

  const rows = invitations.data ?? [];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Convites</p>
      {invitations.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {invitations.isError && <p className="text-xs text-destructive">Erro ao carregar convites.</p>}
      {!invitations.isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum convite gerado ainda.</p>
      )}
      {rows.map((inv) => {
        const status = displayStatus(inv.status, inv.expires_at);
        return (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate">{inv.invite_type === "link" ? "Convite por link" : inv.email}</p>
              <p className="text-xs text-muted-foreground">
                {inv.role === "admin" ? "Administrador" : "Colaborador"} · criado em{" "}
                {new Date(inv.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status === "accepted" ? "default" : status === "pending" ? "secondary" : "outline"}>
                {STATUS_LABELS[status]}
              </Badge>
              {status === "pending" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (window.confirm("Cancelar este convite? O link deixará de funcionar.")) mutation.mutate(inv.id);
                  }}
                >
                  Cancelar convite
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
