import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLinkInvitation } from "./company-members.functions";

interface GeneratedLink {
  readonly url: string;
  readonly companyName: string;
}

export function LinkInvitePanel({ companyId }: { readonly companyId: string }) {
  const [role, setRole] = useState<"member" | "admin">("member");
  const [generated, setGenerated] = useState<GeneratedLink | null>(null);
  const queryClient = useQueryClient();
  const create = useServerFn(createLinkInvitation);

  const mutation = useMutation({
    mutationFn: () => create({ data: { companyId, role } }),
    onSuccess: (result) => {
      setGenerated({
        url: `${window.location.origin}/convite/${result.token}`,
        companyName: result.companyName,
      });
      queryClient.invalidateQueries({ queryKey: ["company-invitations", companyId] });
    },
    onError: (error) => toast.error("Não foi possível gerar o link", { description: error.message }),
  });

  const copy = useCallback(async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }, [generated]);

  const whatsappHref = generated
    ? `https://wa.me/?text=${encodeURIComponent(
        `Você foi convidado para participar da empresa ${generated.companyName} no Financeiro Raio-X. Acesse pelo link para entrar: ${generated.url}`,
      )}`
    : "";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[180px_auto]">
        <select
          aria-label="Papel do convidado"
          value={role}
          onChange={(event) => setRole(event.target.value as "member" | "admin")}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="member">Colaborador</option>
          <option value="admin">Administrador</option>
        </select>
        {!generated && (
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Link2 className="mr-2 h-4 w-4" />
            {mutation.isPending ? "Gerando…" : "Gerar link de convite"}
          </Button>
        )}
      </div>

      {generated && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <Input readOnly value={generated.url} aria-label="Link de convite" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>
              <Copy className="mr-2 h-4 w-4" /> Copiar link
            </Button>
            <Button variant="secondary" asChild>
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> Enviar pelo WhatsApp
              </a>
            </Button>
            <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" /> Gerar novo link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Válido por 7 dias e para uma única pessoa.</p>
        </div>
      )}
    </div>
  );
}
