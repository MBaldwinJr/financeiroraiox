import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { listMyCompanies } from "@/features/companies/companies.functions";

export function SettingsPage() {
  const [email, setEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  const list = useServerFn(listMyCompanies);
  const companies = useQuery({ queryKey: ["companies"], queryFn: () => list() });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Conta e empresas vinculadas.</p>
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
