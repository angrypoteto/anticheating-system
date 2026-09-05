export type FlagType = "TAB_SWITCH" | "FULLSCREEN_EXIT" | "WINDOW_BLUR" | "HONEYPOT";

/** Leaving for another tab or app says more than losing focus to a notification. */
const PRECEDENCE: FlagType[] = ["TAB_SWITCH", "FULLSCREEN_EXIT", "WINDOW_BLUR"];

export function worstOf(kinds: Set<FlagType>): FlagType {
  return PRECEDENCE.find((k) => kinds.has(k)) ?? "WINDOW_BLUR";
}

/**
 * One departure is one strike, however many events the browser fires for it.
 *
 * Alt-tabbing out of a fullscreen exam raises three listeners within
 * milliseconds: the window blurs, the document goes hidden, and fullscreen
 * ends. Counting each of those spent a whole three-strike allowance on a single
 * glance away and auto-submitted the paper — which is what this exists to stop.
 *
 * So the events of one departure are collected briefly and counted once, and
 * nothing further counts until the student is actually back on the paper. The
 * settle window is short enough to be imperceptible and long enough that the
 * burst has finished.
 */
export function createDepartureTracker({
  onStrike,
  settleMs = 400,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: {
  onStrike: (type: FlagType) => void;
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}) {
  let away = false;
  let pending = new Set<FlagType>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    /** A signal that the student may have left. */
    leave(type: FlagType) {
      pending.add(type);
      // Already counted for this departure, or already collecting one.
      if (away || timer) return;

      timer = setTimer(() => {
        timer = null;
        away = true;
        const kinds = pending;
        pending = new Set();
        onStrike(worstOf(kinds));
      }, settleMs);
    },

    /** Back on the paper: the next departure is a new one. */
    back() {
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      away = false;
      pending = new Set();
    },

    dispose() {
      if (timer) clearTimer(timer);
      timer = null;
    },

    /** For tests and for the warning banner. */
    get isAway() {
      return away;
    },
  };
}
