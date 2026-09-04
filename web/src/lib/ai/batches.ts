/**
 * How many questions to ask for in a single model call.
 *
 * There is no cap on the total — a teacher writing a 60-item finals paper
 * should be able to ask for 60. But one call cannot produce 60 good ones: the
 * reply runs past the model's output limit and the later items degrade into
 * repeats of the earlier ones. So a large order is split into calls, and the
 * parts are merged with duplicates dropped.
 */
export const PER_CALL = 15;

export type Batch = { mc: number; ident: number };

/**
 * Split an order into calls, none larger than PER_CALL.
 *
 * Multiple-choice is filled first, so the mix a teacher asked for is preserved
 * in total even though an individual call may be all of one kind.
 */
export function planBatches(mc: number, ident: number, perCall = PER_CALL): Batch[] {
  const batches: Batch[] = [];
  let m = Math.max(0, Math.floor(mc));
  let i = Math.max(0, Math.floor(ident));

  while (m + i > 0) {
    const takeMc = Math.min(m, perCall);
    const takeIdent = takeMc < perCall ? Math.min(i, perCall - takeMc) : 0;
    batches.push({ mc: takeMc, ident: takeIdent });
    m -= takeMc;
    i -= takeIdent;
  }

  return batches;
}

/**
 * Merge the drafts from several calls into one list.
 *
 * Separate calls see the same lesson material and do repeat themselves, so the
 * same question can come back twice with different wording of the same stem.
 * Matching on the trimmed, case-folded prompt catches the common case without
 * pretending to be a similarity check.
 */
export function mergeDrafts<T extends { prompt: string }>(batches: T[][]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const batch of batches) {
    for (const q of batch) {
      const key = q.prompt.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(q);
    }
  }

  return merged;
}
