import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCategory,
  createParty,
  listCategories,
  listParties,
} from "@/features/catalog/catalog.functions";
import { Badge } from "@/components/ui/badge";

const DRE_GROUPS = [
  { value: "revenue", label: "Receita" },
  { value: "cmv", label: "CMV" },
  { value: "supplier", label: "Fornecedores" },
  { value: "freight", label: "Fretes" },
  { value: "fixed", label: "Fixas" },
  { value: "variable", label: "Variáveis" },
  { value: "operational", label: "Operacional" },
  { value: "other", label: "Outras" },
] as const;

export function CatalogPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Cadastros</h1>
        <p className="text-sm text-muted-foreground">
          Categorias, clientes e fornecedores.
        </p>
      </header>
      <Tabs defaultValue="categories" className="space-y-4">
        <TabsList>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="parties">Clientes & Fornecedores</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="parties">
          <PartiesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategoriesPanel() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const list = useServerFn(listCategories);
  const create = useServerFn(createCategory);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"revenue" | "expense">("expense");
  const [dreGroup, setDreGroup] = useState<typeof DRE_GROUPS[number]["value"]>("operational");

  const cats = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => list({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const mut = useMutation({
    mutationFn: () =>
      create({ data: { companyId: companyId!, name, kind, dreGroup } }),
    onSuccess: () => {
      toast.success("Categoria criada");
      setOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["categories", companyId] });
    },
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Nova categoria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova categoria</DialogTitle>
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
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as "revenue" | "expense")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Receita</SelectItem>
                      <SelectItem value="expense">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Grupo DRE</Label>
                  <Select
                    value={dreGroup}
                    onValueChange={(v) => setDreGroup(v as typeof dreGroup)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DRE_GROUPS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={mut.isPending || !name}>
                  Criar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left">Nome</th>
              <th className="px-2 py-2 text-left">Tipo</th>
              <th className="px-2 py-2 text-left">Grupo DRE</th>
            </tr>
          </thead>
          <tbody>
            {(cats.data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border/40">
                <td className="px-2 py-2">{c.name}</td>
                <td className="px-2 py-2">
                  <Badge variant={c.kind === "revenue" ? "default" : "destructive"}>
                    {c.kind === "revenue" ? "Receita" : "Despesa"}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {DRE_GROUPS.find((g) => g.value === c.dre_group)?.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PartiesPanel() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const list = useServerFn(listParties);
  const create = useServerFn(createParty);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"client" | "supplier" | "both">("client");
  const [doc, setDoc] = useState("");

  const parties = useQuery({
    queryKey: ["parties", companyId],
    queryFn: () => list({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const mut = useMutation({
    mutationFn: () =>
      create({ data: { companyId: companyId!, name, kind, document: doc || null } }),
    onSuccess: () => {
      toast.success("Cadastro criado");
      setOpen(false);
      setName("");
      setDoc("");
      qc.invalidateQueries({ queryKey: ["parties", companyId] });
    },
  });
  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo cliente/fornecedor</DialogTitle>
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
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select
                    value={kind}
                    onValueChange={(v) => setKind(v as "client" | "supplier" | "both")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Cliente</SelectItem>
                      <SelectItem value="supplier">Fornecedor</SelectItem>
                      <SelectItem value="both">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>CPF/CNPJ (opcional)</Label>
                  <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={mut.isPending || !name}>
                  Criar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left">Nome</th>
              <th className="px-2 py-2 text-left">Tipo</th>
              <th className="px-2 py-2 text-left">Documento</th>
            </tr>
          </thead>
          <tbody>
            {(parties.data ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border/40">
                <td className="px-2 py-2">{p.name}</td>
                <td className="px-2 py-2 text-muted-foreground">{p.kind}</td>
                <td className="px-2 py-2 text-muted-foreground">{p.document ?? "—"}</td>
              </tr>
            ))}
            {parties.data && parties.data.length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-muted-foreground">
                  Nenhum cadastro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
