/**
 * Guarda adicional de aplicação para operações financeiras sensíveis.
 * Não substitui políticas RLS: o banco deve reforçar a mesma restrição.
 */
export type CompanyAuditRole = "owner" | "admin" | "member" | null;

export function canMutateAudit(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function assertCanMutateAudit(role: string | null | undefined): void {
  if (!canMutateAudit(role)) {
    throw new Error("Apenas proprietário ou administrador podem alterar lançamentos pela Auditoria DRE.");
  }
}

/**
 * Consulta a associação real do usuário autenticado à empresa selecionada.
 * O cliente deve usar o JWT do usuário e políticas RLS, nunca service_role.
 */
export async function requireAuditMutationRole(
  supabase: {
    from: (table: "company_members") => any;
  },
  companyId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar as permissões da auditoria.");
  assertCanMutateAudit(data?.role);
}
