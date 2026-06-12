import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, Save, Loader2, Trash2 } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { listCategories } from "@/features/catalog/catalog.functions";
import {
  enqueueImportJob,
  getImportJob,
} from "@/features/import/import-jobs.functions";
import {
  listErpMappings,
  saveErpMappings,
} from "@/features/import/erp-mappings.functions";
import { parseErpPdf, type ErpParsedRow } from "@/features/import/erp-pdf-parser";
import { formatBRL } from "@/lib/money";

interface ReviewRow extends ErpParsedRow {
  id: string;
  include: boolean;
  categoryName: string | null;
}

const NONE_VALUE = "__none";

export function ErpPdfImportPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const qc = useQueryClient();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [tab, setTab] = useState<"review" | "mappings">("review");

  const fetchCategories = useServerFn(listCategories);
  const categoriesQ = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => fetchCategories({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const fetchMappings = useServerFn(listErpMappings);
  const mappingsQ = useQuery({
    queryKey: ["erp-mappings", companyId],
    queryFn: () => fetchMappings({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const importFn = useServerFn(importTransactions);
  const saveMappingsFn = useServerFn(saveErpMappings);

  const importMut = useMutation({
    mutationFn: async () => {
      const selected = rows.filter((r) => r.include);
      if (!selected.length) throw new Error("Selecione ao menos uma linha.");
      return importFn({
        data: {
          companyId: companyId!,
          rows: selected.map((r) => ({
            date: r.date,
            description: r.description,
            amountCents: r.amountCents,
            kind: r.kind,
            paymentMethod: null,
            categoryName: r.categoryName,
            partyName: r.partyName,
            notes: `[ERP ${r.erpCode}] ${r.erpName}${r.docNumber ? ` · Doc ${r.docNumber}` : ""}`,
          })),
        },
      });
    },
    onSuccess: ({ inserted }) => {
      toast.success(`${inserted} lançamentos importados.`);
      setRows([]);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na importação."),
  });

  const saveMappingsMut = useMutation({
    mutationFn: (entries: Map<string, { name: string; categoryName: string | null; kind: "revenue" | "expense" }>) => {
      const cats = categoriesQ.data ?? [];
      const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
      const payload = [...entries.entries()].map(([erpCode, v]) => ({
        erpCode,
        erpName: v.name,
        categoryId: v.categoryName ? (byName.get(v.categoryName.toLowerCase()) ?? null) : null,
        defaultKind: v.kind,
      }));
      return saveMappingsFn({ data: { companyId: companyId!, mappings: payload } });
    },
    onSuccess: ({ saved }) => {
      toast.success(`${saved} mapeamento(s) salvo(s). Próximos PDFs virão pré-preenchidos.`);
      qc.invalidateQueries({ queryKey: ["erp-mappings", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar mapeamentos."),
  });

  const categoryById = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    (categoriesQ.data ?? []).forEach((c) => m.set(c.id, { id: c.id, name: c.name }));
    return m;
  }, [categoriesQ.data]);

  async function handleFile(file: File) {
    if (!companyId) return;
    setParsing(true);
    try {
      const parsed = await parseErpPdf(file);
      const mappings = mappingsQ.data ?? [];
      const mapByCode = new Map(mappings.map((m) => [m.erp_code, m]));
      const reviewed: ReviewRow[] = parsed.map((p, i) => {
        const mp = mapByCode.get(p.erpCode);
        const catName = mp?.category_id ? (categoryById.get(mp.category_id)?.name ?? null) : null;
        return {
          ...p,
          id: `${i}-${p.erpCode}-${p.date}`,
          include: true,
          categoryName: catName,
          kind: (mp?.default_kind as "revenue" | "expense" | null) ?? p.kind,
        };
      });
      setRows(reviewed);
      toast.success(`${reviewed.length} lançamentos extraídos do PDF.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler o PDF.");
    } finally {
      setParsing(false);
    }
  }

  function patch(id: string, patchObj: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patchObj } : r)));
  }

  function applyCategoryToCode(erpCode: string, categoryName: string | null) {
    setRows((prev) => prev.map((r) => (r.erpCode === erpCode ? { ...r, categoryName } : r)));
  }

  function persistAllMappings() {
    const grouped = new Map<
      string,
      { name: string; categoryName: string | null; kind: "revenue" | "expense" }
    >();
    rows.forEach((r) => {
      if (!grouped.has(r.erpCode)) {
        grouped.set(r.erpCode, {
          name: r.erpName,
          categoryName: r.categoryName,
          kind: r.kind,
        });
      }
    });
    if (!grouped.size) {
      toast.info("Nada para salvar.");
      return;
    }
    saveMappingsMut.mutate(grouped);
  }

  const selectedCount = rows.filter((r) => r.include).length;
  const totalCents = rows
    .filter((r) => r.include)
    .reduce((acc, r) => acc + (r.kind === "revenue" ? r.amountCents : -r.amountCents), 0);

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar PDF do ERP</h1>
          <p className="text-sm text-muted-foreground">
            Suba o relatório "Plano de Contas com Valores" do seu ERP. Reveja, ajuste categorias
            e importe em lote.
          </p>
        </div>
      </header>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> Arquivo PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept="application/pdf,.pdf"
            disabled={parsing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {parsing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo PDF…
            </p>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="review">Revisar lançamentos ({rows.length})</TabsTrigger>
              <TabsTrigger value="mappings">Mapeamento por conta</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{selectedCount} selecionados</Badge>
              <Badge variant={totalCents >= 0 ? "default" : "destructive"}>
                Resultado: {formatBRL(totalCents)}
              </Badge>
              <Button
                variant="outline"
                onClick={persistAllMappings}
                disabled={saveMappingsMut.isPending}
              >
                <Save className="mr-2 h-4 w-4" /> Salvar mapeamentos
              </Button>
              <Button onClick={() => importMut.mutate()} disabled={importMut.isPending || !selectedCount}>
                <Upload className="mr-2 h-4 w-4" />
                {importMut.isPending ? "Importando…" : `Importar ${selectedCount}`}
              </Button>
            </div>
          </div>

          <TabsContent value="review" className="mt-4">
            <ReviewTable
              rows={rows}
              categories={categoriesQ.data ?? []}
              onPatch={patch}
              onRemove={(id) => setRows((p) => p.filter((r) => r.id !== id))}
            />
          </TabsContent>

          <TabsContent value="mappings" className="mt-4">
            <MappingsTable
              rows={rows}
              categories={categoriesQ.data ?? []}
              onApply={applyCategoryToCode}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type CategoryOpt = { id: string; name: string; kind: "revenue" | "expense" };

function ReviewTable({
  rows,
  categories,
  onPatch,
  onRemove,
}: {
  rows: ReviewRow[];
  categories: CategoryOpt[];
  onPatch: (id: string, p: Partial<ReviewRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-secondary/80 text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-2 py-2 text-left">✓</th>
                <th className="px-2 py-2 text-left">Data</th>
                <th className="px-2 py-2 text-left">Conta ERP</th>
                <th className="px-2 py-2 text-left">Descrição</th>
                <th className="px-2 py-2 text-left">Tipo</th>
                <th className="px-2 py-2 text-left">Categoria</th>
                <th className="px-2 py-2 text-right">Valor</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const opts = categories.filter((c) => c.kind === r.kind);
                return (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-secondary/20">
                    <td className="px-2 py-1.5">
                      <Checkbox
                        checked={r.include}
                        onCheckedChange={(v) => onPatch(r.id, { include: Boolean(v) })}
                      />
                    </td>
                    <td className="px-2 py-1.5 numeric whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {r.erpCode}
                      </span>
                      <p className="truncate max-w-[160px] text-[11px]">{r.erpName}</p>
                    </td>
                    <td className="px-2 py-1.5 min-w-[220px]">
                      <Input
                        value={r.description}
                        onChange={(e) => onPatch(r.id, { description: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={r.kind}
                        onValueChange={(v) =>
                          onPatch(r.id, {
                            kind: v as "revenue" | "expense",
                            categoryName: null,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue">Receita</SelectItem>
                          <SelectItem value="expense">Despesa</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={r.categoryName ?? NONE_VALUE}
                        onValueChange={(v) =>
                          onPatch(r.id, { categoryName: v === NONE_VALUE ? null : v })
                        }
                      >
                        <SelectTrigger className="h-7 w-[180px] text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>— Sem categoria</SelectItem>
                          {opts.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right numeric whitespace-nowrap ${
                        r.kind === "revenue" ? "text-success" : "text-destructive"
                      }`}
                    >
                      {r.kind === "revenue" ? "+" : "−"}
                      {formatBRL(r.amountCents)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onRemove(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface CodeGroup {
  erpCode: string;
  erpName: string;
  count: number;
  totalCents: number;
  kind: "revenue" | "expense";
  categoryName: string | null;
}

function MappingsTable({
  rows,
  categories,
  onApply,
}: {
  rows: ReviewRow[];
  categories: CategoryOpt[];
  onApply: (erpCode: string, categoryName: string | null) => void;
}) {
  const grouped = useMemo<CodeGroup[]>(() => {
    const m = new Map<string, CodeGroup>();
    rows.forEach((r) => {
      const g = m.get(r.erpCode);
      if (g) {
        g.count += 1;
        g.totalCents += r.amountCents;
      } else {
        m.set(r.erpCode, {
          erpCode: r.erpCode,
          erpName: r.erpName,
          count: 1,
          totalCents: r.amountCents,
          kind: r.kind,
          categoryName: r.categoryName,
        });
      }
    });
    return [...m.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [rows]);

  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-secondary/80 text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Conta ERP</th>
                <th className="px-3 py-2 text-right">Linhas</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Categoria (aplica em todas)</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => {
                const opts = categories.filter((c) => c.kind === g.kind);
                return (
                  <tr key={g.erpCode} className="border-t border-border/40">
                    <td className="px-3 py-2 font-mono text-[11px]">{g.erpCode}</td>
                    <td className="px-3 py-2">{g.erpName}</td>
                    <td className="px-3 py-2 text-right numeric">{g.count}</td>
                    <td className="px-3 py-2 text-right numeric">{formatBRL(g.totalCents)}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={g.categoryName ?? NONE_VALUE}
                        onValueChange={(v) => onApply(g.erpCode, v === NONE_VALUE ? null : v)}
                      >
                        <SelectTrigger className="h-8 w-[260px]">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>— Sem categoria</SelectItem>
                          {opts.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
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
  );
}
