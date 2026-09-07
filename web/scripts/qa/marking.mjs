/**
 * Marking — the one path in the product nothing had ever tested.
 *
 * The exam-day simulation drove sixty students through starting, answering and
 * being flagged, and stopped at the point where a paper gets a mark. Every
 * other QA script closes a session by writing SUBMITTED straight into the row,
 * which exercises the database and not the marking. So the code that decides
 * whether a student passed had no test at all.
 *
 * This imports the real module rather than a copy of it, and feeds it the
 * shapes the database actually produces — correct_answer is jsonb, so a key
 * arrives as whatever JSON it was stored as, not always a string.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

/**
 * grading.ts opens with `import "server-only"`, which is a build-time guard
 * against pulling server code into a client bundle. It is right for the app and
 * meaningless here, so the resolver is taught to answer it with nothing —
 * rather than copying the module and testing the copy, which is how a test
 * ends up passing on code that does not ship.
 */
const { register } = await import("node:module");
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(spec, ctx, next) {
         if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
         return next(spec, ctx);
       }`,
    ),
  import.meta.url,
);

const { isCorrect, scorePercentage } = await import(
  new URL("../../src/lib/grading.ts", import.meta.url).href
);

let checks = 0;
const bugs = [];
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const head = (n) => console.log(`\n== ${n} ==`);

const MC = "MULTIPLE_CHOICE";
const ID = "IDENTIFICATION";

head("multiple choice");
t(isCorrect(MC, "Network", "Network"), "the right choice is right");
t(!isCorrect(MC, "Transport", "Network"), "a wrong choice is wrong");
t(isCorrect(MC, "network", "Network"), "case does not decide a mark");
t(isCorrect(MC, "  Network  ", "Network"), "stray whitespace does not decide a mark");
t(isCorrect(MC, "Data  link", "Data link"), "a doubled space does not decide a mark");
t(!isCorrect(MC, "", "Network"), "an empty response is not a mark");
t(!isCorrect(MC, null, "Network"), "an unanswered question is not a mark");
t(!isCorrect(MC, undefined, "Network"), "a missing response is not a mark");

head("identification");
t(isCorrect(ID, "router", "router"), "the single accepted spelling");
t(isCorrect(ID, "Router", ["router", "gateway"]), "any accepted spelling counts");
t(isCorrect(ID, " GATEWAY ", ["router", "gateway"]), "case and spacing forgiven on a list");
t(!isCorrect(ID, "switch", ["router", "gateway"]), "an unaccepted answer is wrong");
t(!isCorrect(ID, "", ["router"]), "an empty identification is not a mark");
t(!isCorrect(ID, null, ["router"]), "an unanswered identification is not a mark");

head("what jsonb actually hands back");
// correct_answer is jsonb. A key stored as a number, an object or null comes
// back as one — and none of those may ever score.
t(!isCorrect(MC, "3", 3), "a numeric key does not match a typed number");
t(!isCorrect(MC, "Network", null), "a missing key never marks anything correct");
t(!isCorrect(ID, "router", null), "a missing identification key never marks correct");
t(!isCorrect(MC, "Network", { text: "Network" }), "an object key never marks correct");
t(!isCorrect(ID, "router", [null, 7]), "a list of non-strings never marks correct");
t(!isCorrect(ID, "7", [7]), "a numeric entry in the accepted list does not match");

head("percentages");
t(scorePercentage(0, 20) === 0, "nothing right is 0%");
t(scorePercentage(20, 20) === 100, "everything right is 100%");
t(scorePercentage(15, 20) === 75, "fifteen of twenty is 75%");
t(scorePercentage(1, 3) === 33.33, "a third rounds to two places", String(scorePercentage(1, 3)));
t(scorePercentage(2, 3) === 66.67, "two thirds round up", String(scorePercentage(2, 3)));
t(scorePercentage(0, 0) === 0, "an empty paper is 0%, not a division by zero");
t(scorePercentage(5, 0) === 0, "marks with no questions cannot exceed 100");

head("the pass mark, at the boundary");
// The threshold is 75 and the comparison lives with the caller; what matters
// here is that a score exactly on the mark is representable and exact.
const onTheMark = scorePercentage(15, 20);
t(onTheMark === 75 && onTheMark >= 75, "exactly the pass mark reads as a pass", String(onTheMark));
const justUnder = scorePercentage(14, 20);
t(justUnder === 70 && justUnder < 75, "one mark short is short", String(justUnder));
// 3 of 4 is 75 exactly; floating point must not make it 74.99999.
t(scorePercentage(3, 4) === 75, "three of four is exactly 75, not a rounding artefact");

console.log(`\n${checks} checks, ${bugs.length} problem${bugs.length === 1 ? "" : "s"}`);
if (bugs.length) {
  console.log("");
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(1);
}
