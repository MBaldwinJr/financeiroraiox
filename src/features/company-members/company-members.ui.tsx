import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompanyStore } from "@/stores/company-store";
import { inviteCompanyMember, listCompanyMembers } from "./company-members.functions";

export function CompanyMembersCard({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteCompanyMember);
  const list = useServerFn(listCompanyMembers);
  const members = useQuery({
    queryKey: ["company-members", companyId],
    queryFn: () => list({ data: { companyId } }),
  });

  const mutation = useMutation({
    mutationFn: () => invite({ data: { companyId, email, role } }),
    onSuccess: () => {
      toast.success("Convite enviado", { description: `Um convite foi enviado para ${email}.` });
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["company-members", companyId] });
    },
    onError: (error) => toast.error("Não foi possível enviar o convite", { description: error.message }),
  });

  if (!canManage) return null;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Usuários da empresa</CardTitle>
        <p className="text-xs text-muted-foreground">
          Convide colaboradores por e-mail e defina o nível de acesso.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid gap-3 md:grid-cols-[1fr_160px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!email.trim() || mutation.isPending) return;
            mutation.mutate();
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@empresa.com.br"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as "member" | "admin")}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="member">Colaborador</option>
            <option value="admin">Administrador</option>
          </select>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "Enviando…" : "Convidar usuário"}
          </button>
        </form>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Usuários atuais</p>
          {(members.data ?? []).map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{member.user_id}</span>
              <span className="text-xs uppercase text-muted-foreground">{member.role}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function CompanySelector() {
  const activeCompanyId = useCompanyStore((state) => state.activeCompanyId);
  return <span className="hidden" data-active-company={activeCompanyId ?? ""} />;
}
