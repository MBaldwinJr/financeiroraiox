import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Layers } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent } from "@/components/ui/card";
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
import { createCostCenter, listCostCenters } from "@/features/catalog/catalog.functions";

export function CostCentersPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const list = useServerFn(listCostCenters);
  const create = useServerFn(createCostCenter);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const ccs = useQuery({
    queryKey: ["cost-centers", companyId],
    queryFn: () => list({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const mut = useMutation({
    mutationFn: () => create({ data: { companyId: companyId!, name } }),
    onSuccess: () => {
      toast.success("Centro criado");
      setOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["cost-centers", companyId] });
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centros de Custos</h1>
          <p className="text-sm text-muted-foreground">
            Organize despesas e receitas por setor da empresa.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo centro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo centro de custo</DialogTitle>
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
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={mut.isPending || !name}>
                Criar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(ccs.data ?? []).map((c) => (
          <Card key={c.id} className="glass-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">Setor</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
