/**
 * Making a request fit the provider that has to answer it.
 *
 * Every call carried the whole lesson — up to 120,000 characters, around 30,000
 * tokens. Gemini takes that without complaint. Groq's free tier allows 8,000
 * tokens a minute, so it answered 413 and, because a 413 was treated as a bad
 * request rather than a busy key, the whole generation stopped there:
 *
 *   groq: 413 {"error":{"message":"Request too large for model
 *   `openai/gpt-oss-120b` ... tokens per minute (TPM): Limit 8000,
 *   Requested 19160"}}
 *
 * No number of retries fixes that. The request has to get smaller.
 *
 * Kept apart from the request code, and free of any server-only import, so the
 * arithmetic can be tested rather than reasoned about.
 */

/** As much lesson as any provider has been asked to read in one go. */
export const MAX_LESSON_CHARS = 120_000;

/** Below this there is not enough material left to write a question from. */
export const MIN_LESSON_CHARS = 2_000;

/**
 * The slice of the lesson one call should read.
 *
 * When the whole thing fits, every call sees all of it. When it does not, each
 * call gets a different part — four requests covering four sections of the
 * material, rather than writing the same questions about the first section four
 * times and having three quarters of them dropped as repeats.
 */
export function lessonWindow(text: string, maxChars: number, window = 0): string {
  const cap = Math.max(1, Math.floor(maxChars));
  if (text.length <= cap) return text;

  const windows = Math.ceil(text.length / cap);
  const start = (((window % windows) + windows) % windows) * cap;
  return text.slice(start, start + cap);
}

/** A provider saying, in its own words, that the request was too big. */
export function tooLarge(status: number, detail: string): boolean {
  if (status === 413) return true;
  return (
    status === 400 &&
    /too large|context length|maximum context|tokens per minute|reduce the length/i.test(detail)
  );
}

/**
 * How much of the previous request to attempt next, from the provider's own
 * numbers where it gives them.
 *
 * Groq's 413 says "Limit 8000, Requested 19160", which is exactly how far over
 * the request was — halving blindly would take three more calls to discover the
 * same thing, and each costs a teacher twenty seconds. The margin is because the
 * limit counts the reply too, and the prompt around the lesson is not free.
 */
export function shrinkFactor(detail: string): number {
  const m = detail.match(/limit[^0-9]{0,12}(\d+)[^0-9]{1,24}requested[^0-9]{0,12}(\d+)/i);
  if (m) {
    const limit = Number(m[1]);
    const requested = Number(m[2]);
    if (limit > 0 && requested > limit) {
      return Math.min(0.9, Math.max(0.05, (limit / requested) * 0.7));
    }
  }
  return 0.4;
}

/** The next lesson budget after a too-large refusal, or null if there is no room left. */
export function nextBudget(used: number, detail: string): number | null {
  const next = Math.floor(used * shrinkFactor(detail));
  if (next < MIN_LESSON_CHARS || next >= used) return null;
  return next;
}

/**
 * A provider's error, in words a teacher can act on.
 *
 * The raw reply is a wall of JSON with an organisation id in it; shown in red
 * under the form it reads as a fault in the system rather than a limit on the
 * free tier, which is the one thing the teacher could actually do something
 * about.
 */
export function explainProviderError(raw: string): string {
  const s = raw.toLowerCase();

  if (/tokens per minute|tpm/.test(s)) {
    return (
      "The AI provider's free tier allows only so many words a minute, and this " +
      "order went over it. Ask for fewer questions at a time, or wait a minute " +
      "and generate the rest — what came back so far is kept."
    );
  }
  if (/413|too large|context length|maximum context/.test(s)) {
    return (
      "The lesson file is too long for this provider to read in one go. Try a " +
      "shorter file, or split it and generate from each part."
    );
  }
  if (/rate limit|429|quota/.test(s)) {
    return (
      "The AI provider is rate-limiting this key. Wait a minute and try again, " +
      "or add another provider key in the admin console."
    );
  }
  if (/503|overloaded|unavailable|busy/.test(s)) {
    return (
      "The model is busy at the provider's end. This usually clears in a minute " +
      "— try again, or add a key for a second provider so there is somewhere to " +
      "fall back to."
    );
  }
  if (/401|403|api key|unauthor|permission denied/.test(s)) {
    return "That provider key was refused. Check it in the admin console.";
  }
  return raw;
}
