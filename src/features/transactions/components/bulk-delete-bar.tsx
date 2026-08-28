import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  bulkDeleteTransactions,
  bulkDeleteTransactionsByFilter,
} from "@/features/transactions/transactions.functions";

export interface BulkDeleteFilter {
  readonly companyId: string;
  readonly year: number;
  readonly month: number | null;
  readonly kind: "revenue" | "expense";
  readonly search?: string | undefined;
  readonly categoryIds: readonly string[];
  readonly costCenterIds: readonly string[];
  readonly bankAccountIds: readonly string[];
  readonly paymentMethods: readonly ("cash" | "pix" | "boleto" | "cheque" | "card")[];
}

interface Props {
  readonly filter: BulkDeleteFilter;
  readonly filteredCount: number;
  readonly duplicateCount: number;
  readonly selectedIds: readonly string[];
  readonly onSelectDuplicates: () => void;
  readonly onClearSelection: () => void;
}

export function BulkDeleteBar({
  filter,
  filteredCount,
  duplicateCount,
  selectedIds,
  onSelectDuplicates,
  onClearSelection,
}: Props) {
  const queryClient = useQueryClient();
  const deleteIds = useServerFn(bulkDeleteTransactions);
  const deleteByFilter = useServerFn(bulkDeleteTransactionsByFilter);

  const afterDelete = (deleted: number) => {
    toast.success(`${deleted} lançamento(s) excluído(s).`);
    onClearSelection();
    void queryClient.invalidateQueries();
  };

  const selectionMut = useMutation({
    mutationFn: () =>
      deleteIds({ data: { companyId: filter.companyId, ids: [...selectedIds] } }),
    onSuccess: (r) => afterDelete(r.deleted),
    onError: (e: Error) => toast.error(e.message),
  });

  const filterMut = useMutation({
    mutationFn: () =>
      deleteByFilter({
        data: {
          companyId: filter.companyId,
          year: filter.year,
          month: filter.month,
          kind: filter.kind,
          search: filter.search,
          categoryIds: [...filter.categoryIds],
          costCenterIds: [...filter.costCenterIds],
          bankAccountIds: [...filter.bankAccountIds],
          paymentMethods: [...filter.paymentMethods],
        },
      }),
    onSuccess: (r) => afterDelete(r.deleted),
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = selectionMut.isPending || filterMut.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/20 p-3">
      <Badge variant="secondary" className="numeric">
        {selectedIds.length} selecionado(s)
      </Badge>

      <Button
        variant="outline"
        size="sm"
        onClick={onSelectDuplicates}
        disabled={duplicateCount === 0 || busy}
        aria-label="Selecionar lançamentos duplicados"
      >
        <Copy className="mr-1 h-4 w-4" />
        Marcar duplicados ({duplicateCount})
      </Button>

      {selectedIds.length > 0 && (
        <Button variant="ghost" size="sm" onClick={onClearSelection} disabled={busy}>
          Limpar seleção
        </Button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ConfirmDelete
          disabled={selectedIds.length === 0 || busy}
          pending={selectionMut.isPending}
          label={`Excluir selecionados (${selectedIds.length})`}
          title="Excluir lançamentos selecionados?"
          description={`${selectedIds.length} lançamento(s) serão removidos. Esta ação pode ser revertida apenas pelo suporte.`}
          onConfirm={() => selectionMut.mutate()}
        />
        <ConfirmDelete
          disabled={filteredCount === 0 || busy}
          pending={filterMut.isPending}
          variant="outline"
          label={`Excluir tudo do filtro (${filteredCount})`}
          title="Excluir todos os lançamentos do filtro atual?"
          description={`Todos os ${filteredCount} lançamentos que correspondem ao período, categoria, centro de custo, conta e forma de pagamento selecionados serão removidos.`}
          onConfirm={() => filterMut.mutate()}
        />
      </div>
    </div>
  );
}

function ConfirmDelete({
  disabled,
  pending,
  label,
  title,
  description,
  onConfirm,
  variant = "destructive",
}: {
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly onConfirm: () => void;
  readonly variant?: "destructive" | "outline";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size="sm" disabled={disabled}>
          {pending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-1 h-4 w-4" />
          )}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
