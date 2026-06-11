import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Wallet } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createBankAccount, listBankAccounts } from "@/features/catalog/catalog.functions";
import { formatBRL, toCents } from "@/lib/money";

export function BankAccountsPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const list = useServerFn(listBankAccounts);
  const create = useServerFn(createBankAccount);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("0");

  const accounts = useQuery({
    queryKey: ["bank-accounts", companyId],
    queryFn: () => list({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          companyId: companyId!,
          name,
          type: "bank",
          initialBalance: toCents(Number(balance) || 0),
        },
      }),
    onSuccess: () => {
      toast.success("Conta criada");
      setOpen(false);
      setName("");
      setBalance("0");
      qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas Bancárias</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre caixa, bancos e carteiras digitais.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nova conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova conta</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                mut.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Nubank"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Saldo inicial (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={mut.isPending || !name}>
                {mut.isPending ? "Salvando…" : "Criar conta"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(accounts.data ?? []).map((a) => (
          <Card key={a.id} className="glass-card">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/15 text-info">
                <Wallet className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{a.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Saldo inicial</p>
              <p className="numeric mt-1 text-xl font-bold">
                {formatBRL(a.initial_balance_cents)}
              </p>
              <p className="mt-2 text-xs uppercase text-muted-foreground">{a.type}</p>
            </CardContent>
          </Card>
        ))}
        {accounts.data && accounts.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
        )}
      </section>
    </div>
  );
}
