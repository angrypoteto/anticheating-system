/**
 * Read every row a query matches, a page at a time.
 *
 * A reply is capped at 1,000 rows unless a range is asked for, and nothing says
 * so: the request succeeds, the array looks reasonable, and every figure
 * computed from it is quietly wrong. Fifty students answering twenty-five
 * questions is 1,250 answers, so a single ordinary exam crosses it — the
 * per-question analysis was reporting percentages over the first thousand
 * answers and calling them the class's.
 *
 * A count is not enough to protect against this, because the count is right
 * while the rows are short. Anything that aggregates has to page.
 */
const PAGE = 1000;

/**
 * `make` is handed a range and must return that slice of the query, e.g.
 *
 *     readAll((from, to) =>
 *       admin.from("answers").select("question_id, response")
 *         .in("session_id", ids).range(from, to))
 */
export async function readAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  /** A ceiling, so a runaway query cannot page forever. */
  cap = 200_000,
): Promise<{ rows: T[]; error: string | null; truncated: boolean }> {
  const rows: T[] = [];

  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) return { rows, error: error.message, truncated: false };

    const page = data ?? [];
    rows.push(...page);

    // A short page is the last one. An exactly-full page might not be.
    if (page.length < PAGE) return { rows, error: null, truncated: false };
  }

  return { rows, error: null, truncated: true };
}

/** The rows alone, for use inside a Promise.all alongside ordinary queries. */
export function readAllRows<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  return readAll<T>(make).then((r) => r.rows);
}
