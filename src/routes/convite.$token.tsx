import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyStore } from "@/stores/company-store";
import { acceptLinkInvitation, getLinkInvitation } from "@/features/company-members/company-members.functions";
import { PENDING_INVITE_STORAGE_KEY } from "@/features/company-members/invitation-token";

export const Route = createFileRoute("/convite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Convite — Financeiro Raio-X" },
      { name: "description", content: "Aceite seu convite para participar de uma empresa no Financeiro Raio-X." },
      { property: "og:title", content: "Convite — Financeiro Raio-X" },
      { property: "og:description", content: "Você foi convidado para uma empresa no Financeiro Raio-X." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

const STATUS_MESSAGES: Record<string, string> = {
  expired: "Este convite expirou. Peça um novo link ao administrador.",
  cancelled: "Este convite foi cancelado.",
  accepted: "Este convite já foi utilizado.",
};

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const setActiveCompanyId = useCompanyStore((s) => s.setActiveCompanyId);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const get = useServerFn(getLinkInvitation);
  const accept = useServerFn(acceptLinkInvitation);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(Boolean(data.user)));
  }, []);

  const invitation = useQuery({
    queryKey: ["link-invitation", token],
    queryFn: () => get({ data: { token } }),
    enabled: authed === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: ({ companyId }) => {
      window.sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
      setActiveCompanyId(companyId);
      toast.success("Convite aceito!");
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (error) => toast.error("Não foi possível aceitar", { description: error.message }),
  });

  const inv = invitation.data;
  const blocked = inv && inv.status !== "pending" ? STATUS_MESSAGES[inv.status] ?? "Convite indisponível." : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="glass-card w-full max-w-md">
        <CardHeader>
          <CardTitle>Convite Financeiro Raio-X</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {authed === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {authed === false && (
            <>
              <p className="text-sm">Entre ou crie sua conta para aceitar o convite.</p>
              <Button
                className="w-full"
                onClick={() => {
                  window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, token);
                  navigate({ to: "/auth" });
                }}
              >
                Entrar ou criar conta
              </Button>
            </>
          )}
          {authed && invitation.isLoading && <p className="text-sm text-muted-foreground">Verificando convite…</p>}
          {authed && (invitation.isError || (invitation.isSuccess && !inv)) && (
            <p className="text-sm text-destructive">Convite inválido ou inexistente.</p>
          )}
          {inv && blocked && <p className="text-sm text-destructive">{blocked}</p>}
          {inv && !blocked && (
            <>
              <p className="text-sm">
                Você foi convidado para <strong>{inv.companyName}</strong> como <strong>{inv.roleLabel}</strong>.
              </p>
              <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "Aceitando…" : "Aceitar convite"}
              </Button>
            </>
          )}
          {authed && (
            <Link to="/dashboard" className="block text-center text-xs text-muted-foreground underline">
              Ir para o painel
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
