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
  PAGE_LIMIT_MS,
  RUN_BUDGET_MS,
  TYPICAL_REQUEST_MS,
  estimateTotalMs,
  formatClock,
  humanDuration,
  project,
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

section("What the order will cost, before it starts");

t(planBatches(5, 2).length === 1, "a small order is one request");
t(planBatches(40, 20).length === 4, "sixty questions is four", `${planBatches(40, 20).length}`);
t(estimateTotalMs(2) === 2 * TYPICAL_REQUEST_MS, "the estimate is per request");
t(estimateTotalMs(0) === 0, "nothing asked for takes no time");
t(estimateTotalMs(20) === RUN_BUDGET_MS,
  "and never promises more time than the run is allowed to take",
  `${estimateTotalMs(20) / 1000}s`);

section("Counting down, second by second");

// Nothing has landed yet, and the first request has been out for the whole run.
const at = (s) => project({ done: 0, total: 4, elapsedMs: s * 1000, sinceLastMs: s * 1000 });

const t0 = at(0).remainingMs;
const t5 = at(5).remainingMs;
const t10 = at(10).remainingMs;
t(t5 < t0 && t10 < t5, "the figure falls as the seconds pass",
  `${Math.round(t0 / 1000)}s → ${Math.round(t5 / 1000)}s → ${Math.round(t10 / 1000)}s`);
t(Math.abs((t0 - t5) - 5000) < 250, "by about a second a second", `${Math.round((t0 - t5) / 1000)}s in 5s`);

section("Adjusting to how the run is actually going");

// A request that has already run longer than expected is evidence about the
// ones behind it: a slow connection, or a busy model.
const slow = project({ done: 0, total: 4, elapsedMs: 40_000, sinceLastMs: 40_000 });
t(slow.perRequestMs >= 40_000,
  "a request running long raises the expectation for the rest",
  `${Math.round(slow.perRequestMs / 1000)}s each`);
t(slow.remainingMs === PAGE_LIMIT_MS - 40_000,
  "but the answer is still bounded by the time the request actually has left",
  `${Math.round(slow.remainingMs / 1000)}s left of the 60s the platform allows`);

// Without that bound the same run projects a shade over two minutes onto a page
// that will be killed in twenty seconds.
const unbounded = 3 * slow.perRequestMs;
t(unbounded > PAGE_LIMIT_MS,
  "which is the difference between an estimate and a fiction",
  `raw arithmetic said ${Math.round(unbounded / 1000)}s`);

// And the other way: a fast connection should not be held to the prior.
const quick = project({ done: 2, total: 4, elapsedMs: 12_000, sinceLastMs: 2_000 });
t(quick.perRequestMs === 5_000, "two quick requests set a quick expectation",
  `${quick.perRequestMs}ms each`);
t(quick.remainingMs < 2 * TYPICAL_REQUEST_MS, "and the estimate comes down with them",
  `${Math.round(quick.remainingMs / 1000)}s left`);

const firstOne = project({ done: 1, total: 4, elapsedMs: 31_000, sinceLastMs: 1_000 });
t(firstOne.perRequestMs > 18_000 && firstOne.perRequestMs < 30_000,
  "one measurement is blended with the prior, not believed outright",
  `${Math.round(firstOne.perRequestMs / 1000)}s each`);

section("What it never does");

t(project({ done: 3, total: 4, elapsedMs: 60_000, sinceLastMs: 30_000 }).remainingMs > 0,
  "it never reaches zero while a request is still out");
t(project({ done: 4, total: 4, elapsedMs: 70_000, sinceLastMs: 5_000 }).remainingMs === 0,
  "but it is zero once they have all landed");
t(project({ done: 0, total: 0, elapsedMs: 0, sinceLastMs: 0 }) === null,
  "and claims nothing when there is nothing to measure");
t(project({ done: 0, total: 4, elapsedMs: 0, sinceLastMs: -50 }).remainingMs > 0,
  "a clock that ran backwards does not produce a negative estimate");

section("The bar");

const early = project({ done: 0, total: 4, elapsedMs: 1_000, sinceLastMs: 1_000 });
const later = project({ done: 0, total: 4, elapsedMs: 9_000, sinceLastMs: 9_000 });
t(later.fraction > early.fraction,
  "it advances between landings, so twenty seconds does not look frozen",
  `${Math.round(early.fraction * 100)}% → ${Math.round(later.fraction * 100)}%`);
t(later.fraction < 1 / 4,
  "but never finishes a request that has not landed",
  `${(later.fraction * 100).toFixed(1)}% of a 25% segment`);
t(project({ done: 3, total: 4, elapsedMs: 80_000, sinceLastMs: 40_000 }).fraction <= 0.97,
  "and never shows a full bar while still waiting");

section("Saying it out loud");

t(humanDuration(3_000) === "a few seconds", "under ten seconds is not worth a number");
t(humanDuration(37_000) === "35 seconds", "seconds are rounded to five", humanDuration(37_000));
t(humanDuration(125_000) === "2 minutes", "and longer waits to minutes", humanDuration(125_000));
t(humanDuration(-5) === "a few seconds", "a negative estimate never escapes");

t(formatClock(45_000) === "0:45", "the clock reads like a clock", formatClock(45_000));
t(formatClock(65_000) === "1:05", "past a minute too", formatClock(65_000));
t(formatClock(-1) === "0:00", "and never goes negative", formatClock(-1));

console.log(`\n${checks} checks, ${bugs.length} failing`);
for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
process.exit(bugs.length ? 1 : 0);
