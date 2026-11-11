// Helper to paginate Supabase PostgREST queries past the default 1000-row limit.
// Builder factory must return a fresh query each call (range is applied per page).

export const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}


/** Supabase paginates deterministically only when callers specify .order(...).
 * Retrieves the first page with an exact count, then reads remaining pages in
 * bounded parallel batches. Falls back to sequential mode if count is absent.
 * No module/user data is cached on the server; caller's authenticated RLS applies.
 */
export async function fetchAllRowsConcurrent<T>(
  build: (
    from: number,
    to: number,
    withCount: boolean,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>,
  pageSize: number = PAGE_SIZE,
  concurrency = 3,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error("Tamanho de página inválido");
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error("Concorrência da paginação deve estar entre 1 e 4");
  }
  const first = await build(0, pageSize - 1, true);
  if (first.error) throw new Error(first.error.message);
  const all = [...(first.data ?? [])];
  if (all.length < pageSize) {
    if (first.count != null && first.count !== all.length) {
      throw new Error("Resultado alterado durante a paginação. Recarregue os indicadores.");
    }
    return all;
  }

  if (first.count == null) {
    // Database proxies can omit count. Avoid guessing how many pages exist.
    let from = pageSize;
    while (true) {
      const result = await build(from, from + pageSize - 1, false);
      if (result.error) throw new Error(result.error.message);
      const rows = result.data ?? [];
      all.push(...rows);
      if (rows.length < pageSize) return all;
      from += pageSize;
    }
  }

  const count = first.count;
  if (count < all.length) {
    throw new Error("Contagem inconsistente durante a paginação.");
  }
  const offsets: number[] = [];
  for (let from = pageSize; from < count; from += pageSize) offsets.push(from);

  for (let i = 0; i < offsets.length; i += concurrency) {
    const batchOffsets = offsets.slice(i, i + concurrency);
    const pages = await Promise.all(batchOffsets.map(async (from) => {
      const page = await build(from, from + pageSize - 1, false);
      if (page.error) throw new Error(page.error.message);
      const rows = page.data ?? [];
      const expected = Math.min(pageSize, count - from);
      if (rows.length !== expected) {
        throw new Error("Resultado alterado durante a paginação. Recarregue os indicadores.");
      }
      return rows;
    }));
    for (const page of pages) all.push(...page);
  }
  return all;
}
