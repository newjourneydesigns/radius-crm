// Fetch every row of a Supabase query, working around the PostgREST `max-rows`
// cap (1000 on this project). Each request returns at most one page, so we walk
// pages with .range() until a short page signals the end.
//
// Usage:
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from('table').select('*').eq('campaign_id', id).range(from, to));

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
