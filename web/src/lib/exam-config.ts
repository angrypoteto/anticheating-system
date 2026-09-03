export type TimerConfig = {
  /** Whole-exam limit in minutes. 0 means untimed. */
  totalMinutes: number;
  /** Optional per-question limit in seconds; null when unused. */
  perQuestionSeconds: number | null;
};

export type LockdownConfig = {
  fullscreenRequired: boolean;
  blockCopyPaste: boolean;
  /** Flags allowed before the session is auto-submitted. */
  maxStrikes: number;
  honeypot: boolean;
};

export const DEFAULT_TIMER: TimerConfig = {
  totalMinutes: 60,
  perQuestionSeconds: null,
};

export const DEFAULT_LOCKDOWN: LockdownConfig = {
  fullscreenRequired: true,
  blockCopyPaste: true,
  maxStrikes: 3,
  honeypot: true,
};

export function parseTimer(value: unknown): TimerConfig {
  const v = (value ?? {}) as Partial<TimerConfig>;
  return {
    totalMinutes: Number.isFinite(v.totalMinutes)
      ? Math.max(0, Number(v.totalMinutes))
      : DEFAULT_TIMER.totalMinutes,
    perQuestionSeconds:
      v.perQuestionSeconds == null || !Number.isFinite(v.perQuestionSeconds)
        ? null
        : Math.max(1, Number(v.perQuestionSeconds)),
  };
}

export function parseLockdown(value: unknown): LockdownConfig {
  const v = (value ?? {}) as Partial<LockdownConfig>;
  return {
    fullscreenRequired: v.fullscreenRequired ?? DEFAULT_LOCKDOWN.fullscreenRequired,
    blockCopyPaste: v.blockCopyPaste ?? DEFAULT_LOCKDOWN.blockCopyPaste,
    maxStrikes: Number.isFinite(v.maxStrikes)
      ? Math.max(1, Number(v.maxStrikes))
      : DEFAULT_LOCKDOWN.maxStrikes,
    honeypot: v.honeypot ?? DEFAULT_LOCKDOWN.honeypot,
  };
}
