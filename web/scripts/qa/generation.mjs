/**
 * The two sums behind question generation: making a request fit, and saying how
 * long the rest will take.
 *
 * Both are pure, so they are checked here rather than by watching a spinner and
 * hoping. The Groq refusal used below is the real one, copied from the console:
 *
 *   413 Request too large for model `openai/gpt-oss-120b` ... service tier
 *   `on_demand` on tokens per minute (TPM): Limit 8000, Requested 19160
 *
 * Run with plain node — these modules import nothing.
 */
import {
  MAX_LESSON_CHARS,
  MIN_LESSON_CHARS,
  explainProviderError,
  lessonWindow,
  nextBudget,
  shrinkFactor,
  tooLarge,
} from "../../src/lib/ai/fit.ts";
import {
  TYPICAL_REQUEST_MS,
  estimateTotalMs,
  humanDuration,
  remainingMs,
} from "../../src/lib/ai/eta.ts";
import { planBatches } from "../../src/lib/ai/batches.ts";

const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const section = (n) => console.log(`\n== ${n} ==`);

const GROQ_413 =
  'groq: 413 {"error":{"message":"Request too large for model `openai/gpt-oss-120b` in ' +
  'organization `org_01kxm8c8m8f02802sqec77383z` service tier `on_demand` on tokens per ' +
  'minute (TPM): Limit 8000, Requested 19160","type":"tokens","code":"rate_limit_exceeded"}}';

section("Recognising a refusal for size");

t(tooLarge(413, "anything"), "413 is too large, whatever it says");
t(tooLarge(400, "This model's maximum context length is 8192 tokens"),
  "so is a 400 that names the context length");
t(tooLarge(400, GROQ_413), "and one that names a per-minute token limit");
t(!tooLarge(400, "invalid api key"), "an ordinary bad request is not");
t(!tooLarge(503, "model overloaded"), "and neither is a busy model");

section("How far to cut");

const factor = shrinkFactor(GROQ_413);
t(factor > 0.25 && factor < 0.32,
  "the provider's own numbers set the cut", `factor ${factor.toFixed(3)}`);
t(shrinkFactor("no numbers here") === 0.4,
  "without numbers it halves and a bit more", "factor 0.400");

// The refusal said 19,160 tokens were sent. At about four characters a token
// that is a lesson of roughly 76,000 characters.
const wasChars = 19_160 * 4;
const next = nextBudget(wasChars, GROQ_413);
const nextTokens = next / 4;
t(next != null && nextTokens + 1500 < 8000,
  "one cut lands inside the limit, with room for the reply",
  `${next} chars ≈ ${Math.round(nextTokens)} tokens, limit 8000`);

t(nextBudget(MIN_LESSON_CHARS + 10, GROQ_413) === null,
  "there is a floor: below it there is nothing to write questions from");

// The factor is capped below 1, so every cut is a real cut — a retry loop that
// asked for the same size again would spend the whole budget learning nothing.
const marginal = nextBudget(50_000, "Limit 8000, Requested 8001");
t(marginal !== null && marginal < 50_000,
  "even a marginal overshoot comes back smaller", `${marginal} from 50,000`);
t(shrinkFactor("Limit 8000, Requested 8001") < 1,
  "because the cut can never be a no-op");

section("Which part of the lesson each request reads");

// Deliberately non-repeating: a lesson of "abcdefghij" over and over would make
// every 2,500-character slice identical, and the test would pass without the
// windows ever having moved.
const lesson = Array.from({ length: 10_000 }, (_, i) =>
  String.fromCharCode(33 + (i % 90)),
).join("");
t(lessonWindow(lesson, MAX_LESSON_CHARS) === lesson,
  "when the whole thing fits, every request reads all of it");

const w0 = lessonWindow(lesson, 2500, 0);
const w1 = lessonWindow(lesson, 2500, 1);
const w3 = lessonWindow(lesson, 2500, 3);
t(w0.length === 2500 && w1.length === 2500, "a slice is the size it was asked for");
t(w0 !== w1 && w1 !== w3, "consecutive requests read different parts");
t(lessonWindow(lesson, 2500, 4) === w0, "and it wraps rather than running off the end");
t(lessonWindow(lesson, 2500, -1) === w3, "a negative index still lands on a real slice");
t(w0 + w1 + lessonWindow(lesson, 2500, 2) + w3 === lesson,
  "four slices of a quarter cover the whole lesson");

section("What a teacher is told went wrong");

const said = explainProviderError(GROQ_413);
t(!/org_01kxm/.test(said), "no organisation id in front of a teacher");
t(!/\{"error"/.test(said), "and no raw JSON");
t(/minute/.test(said) && /fewer/.test(said),
  "it names the limit and what to do about it", said.slice(0, 60) + "…");
t(explainProviderError("groq: 503 model is overloaded").includes("busy"),
  "a busy model reads as a busy model");
t(explainProviderError("something nobody anticipated") === "something nobody anticipated",
  "and anything unrecognised is passed through rather than swallowed");

section("How long it will take");

t(planBatches(5, 2).length === 1, "a small order is one request");
t(planBatches(40, 20).length === 4, "sixty questions is four", `${planBatches(40, 20).length}`);

t(estimateTotalMs(4) === 4 * TYPICAL_REQUEST_MS, "the up-front estimate is per request");
t(estimateTotalMs(0) === 0, "nothing asked for takes no time");

t(remainingMs({ done: 0, total: 4, elapsedMs: 0 }) === 4 * TYPICAL_REQUEST_MS,
  "before anything lands, the prior stands alone");

const afterOne = remainingMs({ done: 1, total: 4, elapsedMs: 30_000 });
t(afterOne > 3 * TYPICAL_REQUEST_MS && afterOne < 3 * 30_000,
  "one slow request moves the estimate without being believed outright",
  `${Math.round(afterOne / 1000)}s`);

const afterTwo = remainingMs({ done: 2, total: 4, elapsedMs: 60_000 });
t(afterTwo === 60_000, "by the second, the measurement stands on its own", `${afterTwo}ms`);

t(remainingMs({ done: 4, total: 4, elapsedMs: 80_000 }) === 0, "nothing left when it is done");
t(remainingMs({ done: 0, total: 0, elapsedMs: 0 }) === null,
  "and nothing claimed when there is nothing to measure");

section("Saying it out loud");

t(humanDuration(3_000) === "a few seconds", "under ten seconds is not worth a number");
t(humanDuration(37_000) === "35 seconds", "seconds are rounded to five", humanDuration(37_000));
t(humanDuration(125_000) === "2 minutes", "and longer waits to minutes", humanDuration(125_000));
t(humanDuration(-5) === "a few seconds", "a negative estimate never escapes");

console.log(`\n${checks} checks, ${bugs.length} failing`);
for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
process.exit(bugs.length ? 1 : 0);
