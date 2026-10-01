// PostgREST answers a request with at most `max_rows` rows (1000 on this
// project, both supabase/config.toml and the hosted project) and reports no
// error when it cuts a result short. A `.select()` without a range therefore
// silently loses everything past row 1000.
//
// fetchAllRows keeps asking for the next range until it holds as many rows as
// PostgREST's exact count says exist, so it does not depend on knowing the
// server's limit: a page that comes back shorter than requested just means a
// smaller next step.
//
// The query passed in must
//   - select with `{ count: 'exact' }`, and
//   - order by a unique key (append `id` as a tiebreaker). Without a total
//     order, rows can repeat or go missing across a page boundary.

export const FETCH_PAGE_SIZE = 1000

type PageResult<Row, Err> = { data: Row[] | null; error: Err | null; count: number | null }

export async function fetchAllRows<Row, Err extends { code?: string }>(
  page: (from: number, to: number) => PromiseLike<PageResult<Row, Err>>,
  retryIfChanged = true,
): Promise<{ data: Row[] | null; error: Err | null }> {
  const rows: Row[] = []
  let total: number | null = null
  for (;;) {
    const { data, error, count } = await page(rows.length, rows.length + FETCH_PAGE_SIZE - 1)
    // The row count moved between two pages (another device added or deleted
    // rows), or the next range now starts past the end (PGRST103). Offsets
    // have shifted under us, so a row may have been repeated or skipped:
    // read again from the top, once.
    const changed = rows.length > 0 && (error ? error.code === 'PGRST103' : count !== total)
    if (changed && retryIfChanged) return fetchAllRows(page, false)
    if (error) {
      if (changed) break
      // Never hand back a partial list as if it were complete.
      return { data: null, error }
    }
    total = count
    rows.push(...(data ?? []))
    if (!data?.length || (count !== null && rows.length >= count)) break
  }
  return { data: rows, error: null }
}
