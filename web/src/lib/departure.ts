export type FlagType =
  | "TAB_SWITCH"
  | "FULLSCREEN_EXIT"
  | "WINDOW_BLUR"
  | "HONEYPOT"
  /** Sharing stopped while the exam was recording the screen. */
  | "SCREEN_SHARE_ENDED"
  /** A browser extension touched the exam page. Evidence, never a strike. */
  | "EXTENSION_DETECTED"
  /** Print Screen, or the Windows/Command + Shift screenshot shortcut. */
  | "SCREENSHOT";

/** Leaving for another tab or app says more than losing focus to a notification. */
const PRECEDENCE: FlagType[] = ["TAB_SWITCH", "FULLSCREEN_EXIT", "WINDOW_BLUR"];

export function worstOf(kinds: Set<FlagType>): FlagType {
  return PRECEDENCE.find((k) => kinds.has(k)) ?? "WINDOW_BLUR";
}

/** Is `a` a more telling description of a departure than `b`? */
export function isMoreTelling(a: FlagType, b: FlagType): boolean {
  const rank = (k: FlagType) => {
    const i = PRECEDENCE.indexOf(k);
    return i === -1 ? PRECEDENCE.length : i;
  };
  return rank(a) < rank(b);
}

/**
 * One departure is one strike, however many events the browser fires for it —
 * and it is recorded the instant the first of them arrives.
 *
 * Alt-tabbing out of a fullscreen exam raises three listeners within
 * milliseconds: the window blurs, the document goes hidden, and fullscreen
 * ends. Counting each of those spent a whole three-strike allowance on a single
 * glance away, which is what the merging here exists to stop.
 *
 * It used to merge by WAITING — collecting the burst for 400ms and reporting
 * once it went quiet. That had a hole big enough to cheat through: returning
 * inside those 400ms CANCELLED the pending report, so a quick flick to another
 * window and back was recorded as nothing at all. The delay was not just
 * latency; it was an amnesty.
 *
 * So it reports immediately and merges afterwards. The first signal of a
 * departure is sent the moment it lands. For a short window after, a *more
 * telling* signal for the same departure is sent too — the browser often
 * reports the blur before it reports the tab switch, and the second is the
 * truer word for what happened. The server collapses everything inside its own
 * ten-second window into one strike, so sending twice cannot cost a student
 * twice; it only improves the name on the record.
 *
 * Nothing further is sent until the student is actually back on the paper.
 */
export function createDepartureTracker({
  onStrike: initialOnStrike = () => {},
  upgradeMs = 800,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: {
  onStrike?: (type: FlagType) => void;
  /**
   * How long after a departure a truer name for it is still worth sending.
   * Comfortably inside the server's ten-second merge, so an upgrade can never
   * land as a second strike.
   */
  upgradeMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}) {
  let onStrike = initialOnStrike;
  let away = false;
  let reported: FlagType | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopUpgrading = () => {
    if (timer) clearTimer(timer);
    timer = null;
  };

  return {
    /**
     * Point it at the current handler. The tracker outlives any one render, so
     * it is told where to report rather than holding a reference that would go
     * stale — or a ref, which cannot be read while rendering.
     */
    setOnStrike(fn: (type: FlagType) => void) {
      onStrike = fn;
    },

    /** A signal that the student has left. Reported at once. */
    leave(type: FlagType) {
      if (!away) {
        away = true;
        reported = type;
        onStrike(type);
        timer = setTimer(() => {
          timer = null;
        }, upgradeMs);
        return;
      }

      // Already counted for this departure. Only a better word for the same
      // event is worth another call, and only while the server would still
      // merge it.
      if (timer && reported && isMoreTelling(type, reported)) {
        reported = type;
        onStrike(type);
      }
    },

    /**
     * Back on the paper: the next departure is a new one.
     *
     * Returning never unsays what was already recorded — that was the hole.
     * It only closes the upgrade window and re-arms the tracker.
     */
    back() {
      stopUpgrading();
      away = false;
      reported = null;
    },

    dispose() {
      stopUpgrading();
    },

    /** For tests and for the warning banner. */
    get isAway() {
      return away;
    },

    /** What this departure has been called so far, for tests. */
    get reportedAs() {
      return reported;
    },
  };
}
