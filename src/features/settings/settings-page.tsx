import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { listMyCompanies } from "@/features/companies/companies.functions";
import { CompanyMembersCard } from "@/features/company-members/company-members.ui";
import { useCompanyStore } from "@/stores/company-store";

export function SettingsPage() {
  const [email, setEmail] = useState("");
  const activeCompanyId = useCompanyStore((state) => state.activeCompanyId);
  const setActiveCompanyId = useCompanyStore((state) => state.setActiveCompanyId);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  const list = useServerFn(listMyCompanies);
  const companies = useQuery({ queryKey: ["companies"], queryFn: () => list() });
  const selectedCompany = useMemo(() => {
    const rows = companies.data ?? [];
    return rows.find((company) => company.id === activeCompanyId) ?? rows[0] ?? null;
  }, [companies.data, activeCompanyId]);

  useEffect(() => {
    if (selectedCompany && selectedCompany.id !== activeCompanyId) {
      setActiveCompanyId(selectedCompany.id);
    }
  }, [selectedCompany, activeCompanyId, setActiveCompanyId]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Conta, empresas e usuários vinculados.</p>
      </header>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sua conta</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            <span className="text-muted-foreground">Email: </span>
            <span className="font-medium">{email}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Empresa ativa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            value={selectedCompany?.id ?? ""}
            onChange={(event) => setActiveCompanyId(event.target.value || null)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {(companies.data ?? []).map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} — {company.role}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedCompany && (
        <CompanyMembersCard
          companyId={selectedCompany.id}
          canManage={selectedCompany.role === "owner" || selectedCompany.role === "admin"}
        />
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Suas empresas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(companies.data ?? []).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <span>{c.name}</span>
                <span className="text-xs uppercase text-muted-foreground">{c.role}</span>
              </li>
            ))}
            {companies.data && companies.data.length === 0 && (
              <p className="text-muted-foreground">Nenhuma empresa.</p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
