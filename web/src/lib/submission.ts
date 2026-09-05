import type { FlagType } from "@/lib/departure";

export type SubmitReason =
  | "MANUAL"
  | "TIME_UP"
  | "EXAM_CLOSED"
  | "STRIKES"
  | "INSTRUCTOR";

const REASONS: SubmitReason[] = [
  "MANUAL",
  "TIME_UP",
  "EXAM_CLOSED",
  "STRIKES",
  "INSTRUCTOR",
];

export function parseReason(value: unknown): SubmitReason | null {
  return REASONS.includes(value as SubmitReason) ? (value as SubmitReason) : null;
}

/**
 * What to tell the student about why their paper ended.
 *
 * The same sentence has to appear the moment it happens and again whenever they
 * come back to the exam, so it lives here rather than in either page. "You have
 * already submitted this exam. Score: 0%" was true of all five endings, and
 * useless in every one of them: a student stopped for leaving the window has
 * been accused of something and cannot tell that from having run out of time.
 */
export function explainSubmission(
  reason: SubmitReason | null,
  { strikes = 0, maxStrikes = 3 }: { strikes?: number; maxStrikes?: number } = {},
): { headline: string; detail: string | null; blamed: boolean } {
  switch (reason) {
    case "MANUAL":
      return {
        headline: "You submitted this exam",
        detail: null,
        blamed: false,
      };
    case "TIME_UP":
      return {
        headline: "Time ran out",
        detail:
          "The exam was submitted for you when the clock reached zero. Everything you had answered was saved and marked.",
        blamed: false,
      };
    case "EXAM_CLOSED":
      return {
        headline: "The exam closed while you were working",
        detail:
          "Your teacher's closing time passed, so what you had answered was submitted and marked. Ask them if you were cut short.",
        blamed: false,
      };
    case "STRIKES":
      return {
        headline: "Submitted after leaving the exam window",
        detail:
          `The exam allows ${maxStrikes} ${maxStrikes === 1 ? "warning" : "warnings"} for leaving its window — switching tabs, ` +
          `leaving fullscreen, or clicking away to another app. ` +
          `${strikes >= maxStrikes ? `You reached ${strikes}, so the paper was submitted as it stood.` : "The limit was reached, so the paper was submitted as it stood."} ` +
          `If you think this was wrong, show your teacher: they can see each warning and can set them aside.`,
        blamed: true,
      };
    case "INSTRUCTOR":
      return {
        headline: "Your teacher ended this sitting",
        detail:
          "An instructor submitted this paper on your behalf. Whatever you had answered was marked. Ask them why if you were not expecting it.",
        blamed: false,
      };
    default:
      return {
        headline: "This exam has been submitted",
        detail: null,
        blamed: false,
      };
  }
}

/** How a single departure reads to the person who made it. */
export function describeFlag(type: FlagType | string): string {
  switch (type) {
    case "TAB_SWITCH":
      return "moved to another tab or window";
    case "FULLSCREEN_EXIT":
      return "left fullscreen";
    case "WINDOW_BLUR":
      return "clicked away from the exam";
    case "HONEYPOT":
      return "a hidden field was filled in";
    default:
      return "left the exam window";
  }
}
