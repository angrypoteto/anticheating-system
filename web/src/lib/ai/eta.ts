/**
 * How much longer a generation has to run.
 *
 * The panel used to count seconds upwards, which tells a teacher how long they
 * have waited and nothing about how long is left — and a number climbing past
 * twenty is also what a hung page looks like, which is the impression the panel
 * exists to avoid.
 *
 * The first attempt at a fix estimated only from completed requests, so between
 * one landing and the next the figure sat still, and — because the time spent
 * waiting was being averaged into the cost of a request that had not finished —
 * it drifted *upward*. A countdown that goes up is worse than no countdown.
 *
 * So the run is projected from two clocks: how long the finished requests took,
 * and how long the current one has been out. The second ticks every second, so
 * the estimate falls every second, and a request running long raises the
 * expectation for the ones behind it rather than pretending they will be quick.
 *
 * Pure, so the arithmetic is tested rather than watched.
 */

/** What one request tends to cost, before this run has measured anything. */
export const TYPICAL_REQUEST_MS = 18_000;

/**
 * All the time the server action has for the whole run.
 *
 * The page is capped at 60 seconds by the platform, and the action stops
 * starting requests with under six to go, so no estimate should ever promise
 * more than this however many requests were asked for. Exported so the action
 * and the estimate cannot drift apart.
 */
export const RUN_BUDGET_MS = 52_000;

/**
 * The platform's own limit on the request, after which it is killed outright.
 *
 * Nothing the run does can outlast this, so no estimate may promise past it. A
 * projection of two minutes on a request that will be dead in twenty seconds is
 * not an estimate, it is a fiction.
 */
export const PAGE_LIMIT_MS = 60_000;

/** Up-front: what to tell someone before they press the button. */
export function estimateTotalMs(requests: number, perRequestMs = TYPICAL_REQUEST_MS): number {
  const wanted = Math.max(0, Math.floor(requests)) * perRequestMs;
  // A long order does not take longer than the run is allowed to last; it comes
  // back short instead, which the form says.
  return Math.min(wanted, RUN_BUDGET_MS);
}

export type RunShape = {
  /** Requests finished so far. */
  done: number;
  /** Requests in the whole order. */
  total: number;
  /** Since the run started. */
  elapsedMs: number;
  /** Since the last request landed — or since the start, if none has. */
  sinceLastMs: number;
  perRequestMs?: number;
};

export type Projection = {
  /** Best guess at what one request costs, revised as the run goes. */
  perRequestMs: number;
  /** How much longer. Falls each second between completions. */
  remainingMs: number;
  /** 0–1, advancing within a request rather than only when one lands. */
  fraction: number;
};

export function project({
  done,
  total,
  elapsedMs,
  sinceLastMs,
  perRequestMs = TYPICAL_REQUEST_MS,
}: RunShape): Projection | null {
  if (!Number.isFinite(total) || total <= 0) return null;

  const finished = Math.min(Math.max(done, 0), total);
  if (finished >= total) return { perRequestMs, remainingMs: 0, fraction: 1 };

  const since = Math.max(0, sinceLastMs);

  // What the finished requests cost: everything except the one still out.
  const completedMs = Math.max(0, elapsedMs - since);
  const measured = finished > 0 ? completedMs / finished : null;

  // One measurement is thin — the first request is usually the slowest, since
  // it is the one that reads the lesson — so it is averaged with the prior
  // until a second lands and the measurement can stand on its own.
  const baseline =
    measured == null
      ? perRequestMs
      : finished >= 2
        ? measured
        : (measured + perRequestMs) / 2;

  // A request already running longer than expected is evidence in itself: a
  // slow connection, or a busy model. The ones behind it will cost the same, so
  // the expectation rises rather than holding to a deadline already gone.
  const per = Math.max(baseline, since);

  // Never zero while a request is still out. A countdown that reaches zero and
  // sits there is the same lie as a bar stuck at 100%.
  const floor = Math.min(3_000, per * 0.1);
  const inFlight = Math.max(per - since, floor);
  const queued = Math.max(0, total - finished - 1) * per;

  // Whatever the arithmetic says, the run cannot outlive the request carrying
  // it. Without this, four slow requests projected two minutes onto a page that
  // the platform kills at sixty seconds.
  const ceiling = Math.max(floor, PAGE_LIMIT_MS - Math.max(0, elapsedMs));

  const within = per > 0 ? Math.min(0.95, since / per) : 0;

  return {
    perRequestMs: per,
    remainingMs: Math.min(inFlight + queued, ceiling),
    // Held short of the end: the last request is only finished once the drafts
    // are back, and this cannot see that.
    fraction: Math.min(0.97, (finished + within) / total),
  };
}

/** A duration a person would say out loud, never more precise than it is. */
export function humanDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "a few seconds";
  if (s < 90) return `${Math.round(s / 5) * 5} seconds`;
  return `${Math.round(s / 60)} minutes`;
}

/** A running clock, for something that should visibly tick. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
