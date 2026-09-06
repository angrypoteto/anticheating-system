/**
 * How much longer a generation has to run.
 *
 * The progress panel counted seconds upwards, which tells a teacher how long
 * they have been waiting and nothing about how long is left — the one thing
 * they want to know before deciding whether to sit there or go and do something
 * else. A number counting up past twenty is also the shape of a page that has
 * hung, which is exactly the impression this was built to avoid.
 *
 * The estimate is measured, not guessed, as soon as there is anything to
 * measure: each request that lands is evidence about the ones that have not.
 * Kept pure so the arithmetic can be tested.
 */

/** What one request tends to cost, before this run has measured anything. */
export const TYPICAL_REQUEST_MS = 18_000;

/** Up-front: what to tell someone before they press the button. */
export function estimateTotalMs(requests: number, perRequestMs = TYPICAL_REQUEST_MS): number {
  return Math.max(0, Math.floor(requests)) * perRequestMs;
}

/**
 * What is left, given what this run has actually done so far.
 *
 * One completed request is thin evidence — the first is often the slowest, as
 * the model warms up and the lesson is read — so it is averaged with the prior
 * until a second lands and the measurement can stand on its own.
 */
export function remainingMs({
  done,
  total,
  elapsedMs,
  perRequestMs = TYPICAL_REQUEST_MS,
}: {
  done: number;
  total: number;
  elapsedMs: number;
  perRequestMs?: number;
}): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (done >= total) return 0;

  const measured = done > 0 ? elapsedMs / done : null;
  const per =
    measured == null ? perRequestMs : done >= 2 ? measured : (measured + perRequestMs) / 2;

  return Math.max(0, (total - done) * per);
}

/** A duration a person would say out loud, never more precise than it is. */
export function humanDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "a few seconds";
  if (s < 90) return `${Math.round(s / 5) * 5} seconds`;
  const minutes = Math.round(s / 60);
  return `${minutes} minutes`;
}
