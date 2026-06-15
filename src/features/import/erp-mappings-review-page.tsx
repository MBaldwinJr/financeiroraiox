import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Search, AlertTriangle, CheckCircle2 } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { listCategories } from "@/features/catalog/catalog.functions";
import {
  listErpMappings,
  saveErpMappings,
} from "@/features/import/erp-mappings.functions";

const NONE_VALUE = "__none";

type RowState = {
  erpCode: string;
  erpName: string;
  categoryId: string | null;
  defaultKind: "revenue" | "expense";
  dirty: boolean;
};

export function ErpMappingsReviewPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [edits, setEdits] = useState<Record<string, RowState>>({});

  const fetchCategories = useServerFn(listCategories);
  const fetchMappings = useServerFn(listErpMappings);
  const saveMappingsFn = useServerFn(saveErpMappings);

  const categoriesQ = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => fetchCategories({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const mappingsQ = useQuery({
    queryKey: ["erp-mappings", companyId],
    queryFn: () => fetchMappings({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const rows = useMemo<RowState[]>(() => {
    const base = (mappingsQ.data ?? []).map((m) => {
      const key = m.erp_code;
      const e = edits[key];
      return (
        e ?? {
          erpCode: m.erp_code,
          erpName: m.erp_name ?? "",
          categoryId: m.category_id ?? null,
          defaultKind: (m.default_kind as "revenue" | "expense" | null) ?? "expense",
          dirty: false,
        }
      );
    });
    const q = filter.trim().toLowerCase();
    return base
      .filter((r) =>
        !q ? true : r.erpCode.toLowerCase().includes(q) || r.erpName.toLowerCase().includes(q),
      )
      .filter((r) => (onlyUnmapped ? !r.categoryId : true))
      .sort((a, b) => a.erpCode.localeCompare(b.erpCode));
  }, [mappingsQ.data, edits, filter, onlyUnmapped]);

  const dirtyCount = Object.values(edits).filter((e) => e.dirty).length;
  const unmappedCount = (mappingsQ.data ?? []).filter((m) => !m.category_id).length;
  const totalCount = mappingsQ.data?.length ?? 0;

  function patchRow(key: string, p: Partial<RowState>) {
    setEdits((prev) => {
      const current =
        prev[key] ??
        (() => {
          const m = mappingsQ.data?.find((x) => x.erp_code === key);
          if (!m) return null;
          return {
            erpCode: m.erp_code,
            erpName: m.erp_name ?? "",
            categoryId: m.category_id ?? null,
            defaultKind: (m.default_kind as "revenue" | "expense" | null) ?? "expense",
            dirty: false,
          } satisfies RowState;
        })();
      if (!current) return prev;
      return { ...prev, [key]: { ...current, ...p, dirty: true } };
    });
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = Object.values(edits)
        .filter((e) => e.dirty)
        .map((e) => ({
          erpCode: e.erpCode,
          erpName: e.erpName,
          categoryId: e.categoryId,
          defaultKind: e.defaultKind,
        }));
      if (!payload.length) throw new Error("Nada para salvar.");
      return saveMappingsFn({ data: { companyId: companyId!, mappings: payload } });
    },
    onSuccess: ({ saved, updatedTransactions }) => {
      toast.success(
        `${saved} mapeamento(s) salvos · ${updatedTransactions} lançamento(s) reclassificados.`,
      );
      setEdits({});
      qc.invalidateQueries({ queryKey: ["erp-mappings", companyId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dre"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mapeamentos ERP → Categoria</h1>
          <p className="text-sm text-muted-foreground">
            Revise como as contas do ERP estão ligadas às categorias do sistema. Ajustes aqui
            valem para futuras importações.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{totalCount} contas</Badge>
          <Badge variant={unmappedCount ? "destructive" : "default"}>
            {unmappedCount} sem categoria
          </Badge>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!dirtyCount || saveMut.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMut.isPending ? "Salvando…" : `Salvar ${dirtyCount || ""}`}
          </Button>
        </div>
      </header>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Buscar por código ou nome da conta ERP…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
          <Button
            variant={onlyUnmapped ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyUnmapped((v) => !v)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Somente sem categoria
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-secondary/80 text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Conta ERP</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Categoria do sistema</th>
                </tr>
              </thead>
              <tbody>
                {mappingsQ.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!mappingsQ.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhum mapeamento encontrado.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const opts = (categoriesQ.data ?? []).filter(
                    (c) => c.kind === r.defaultKind,
                  );
                  return (
                    <tr
                      key={r.erpCode}
                      className={`border-t border-border/40 ${r.dirty ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-2">
                        {r.categoryId ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">{r.erpCode}</td>
                      <td className="px-3 py-2 max-w-[320px] truncate">{r.erpName}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={r.defaultKind}
                          onValueChange={(v) =>
                            patchRow(r.erpCode, {
                              defaultKind: v as "revenue" | "expense",
                              categoryId: null,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="revenue">Receita</SelectItem>
                            <SelectItem value="expense">Despesa</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={r.categoryId ?? NONE_VALUE}
                          onValueChange={(v) =>
                            patchRow(r.erpCode, {
                              categoryId: v === NONE_VALUE ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[280px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>— Sem categoria</SelectItem>
                            {opts.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
