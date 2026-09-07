/**
 * The tracker that decides when a student has left the paper.
 *
 * strikes.mjs proves the database counts departures correctly. Nothing proved
 * the browser reports them — and that is the half a student can outrun. It
 * takes its own timers, so this drives it on a fake clock and never waits.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const { createDepartureTracker, worstOf, isMoreTelling } = await import(
  new URL("../../src/lib/departure.ts", import.meta.url).href
);

let checks = 0;
const bugs = [];
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const head = (n) => console.log(`\n== ${n} ==`);

/** A clock this test owns, so nothing here depends on real time passing. */
function fakeClock() {
  let now = 0;
  let seq = 1;
  const due = new Map();
  return {
    setTimer(fn, ms) {
      const id = seq++;
      due.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer(id) {
      due.delete(id);
    },
    tick(ms) {
      now += ms;
      for (const [id, task] of [...due]) {
        if (task.at <= now) {
          due.delete(id);
          task.fn();
        }
      }
    },
    get pending() {
      return due.size;
    },
  };
}

function make(upgradeMs = 800) {
  const clock = fakeClock();
  const sent = [];
  const tracker = createDepartureTracker({
    onStrike: (type) => sent.push(type),
    upgradeMs,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { clock, sent, tracker };
}

head("a departure is reported the moment it happens");
{
  const { sent, tracker } = make();
  tracker.leave("WINDOW_BLUR");
  t(sent.length === 1, "reported without waiting for a timer", `sent: ${sent.join(", ")}`);
  t(sent[0] === "WINDOW_BLUR", "and reported as what was actually seen");
  t(tracker.isAway, "the tracker knows the student is away");
}

head("the hole that let a quick look away go unrecorded");
{
  // This is the regression that matters. The tracker used to collect a burst
  // for 400ms before reporting, and a return inside that window cancelled the
  // report — so leaving and coming straight back was recorded as nothing.
  const { clock, sent, tracker } = make();
  tracker.leave("TAB_SWITCH");
  clock.tick(50);
  tracker.back();
  clock.tick(5_000);
  t(sent.length === 1, "leaving and returning in 50ms is still one strike", `sent: ${sent.length}`);
  t(!tracker.isAway, "and the tracker is re-armed for the next one");
}

head("one departure, however many events the browser fires");
{
  const { clock, sent, tracker } = make();
  // The real order on an alt-tab out of fullscreen.
  tracker.leave("WINDOW_BLUR");
  tracker.leave("TAB_SWITCH");
  tracker.leave("FULLSCREEN_EXIT");
  clock.tick(10);
  t(sent.length === 2, "sent twice at most, not once per event", `sent: ${sent.join(", ")}`);
  t(sent[0] === "WINDOW_BLUR", "the first thing seen is reported first");
  t(sent[1] === "TAB_SWITCH", "then upgraded to the truer word for it");
  t(
    !sent.includes("FULLSCREEN_EXIT"),
    "a weaker word after a stronger one is not sent again",
  );
}

head("upgrades stop when the server would stop merging");
{
  const { clock, sent, tracker } = make(800);
  tracker.leave("WINDOW_BLUR");
  clock.tick(900);
  tracker.leave("TAB_SWITCH");
  t(sent.length === 1, "a late signal is not sent as a second strike", `sent: ${sent.join(", ")}`);
}

head("staying away does not accumulate strikes");
{
  const { clock, sent, tracker } = make();
  tracker.leave("TAB_SWITCH");
  for (let i = 0; i < 20; i++) {
    clock.tick(1_000);
    tracker.leave("WINDOW_BLUR");
  }
  t(sent.length === 1, "twenty seconds away is still one strike", `sent: ${sent.length}`);
}

head("coming back and leaving again is a second departure");
{
  const { clock, sent, tracker } = make();
  tracker.leave("TAB_SWITCH");
  clock.tick(1_000);
  tracker.back();
  clock.tick(1_000);
  tracker.leave("TAB_SWITCH");
  t(sent.length === 2, "two departures, two strikes", `sent: ${sent.length}`);
}

head("nothing fires after the paper is gone");
{
  const { clock, sent, tracker } = make();
  tracker.leave("WINDOW_BLUR");
  tracker.dispose();
  clock.tick(5_000);
  tracker.leave("TAB_SWITCH");
  t(sent.length === 1, "a disposed tracker sends no upgrade", `sent: ${sent.join(", ")}`);
  t(clock.pending === 0, "and leaves no timer behind");
}

head("naming a departure");
t(worstOf(new Set(["WINDOW_BLUR", "TAB_SWITCH"])) === "TAB_SWITCH", "a tab switch outranks a blur");
t(
  worstOf(new Set(["WINDOW_BLUR", "FULLSCREEN_EXIT"])) === "FULLSCREEN_EXIT",
  "leaving fullscreen outranks a blur",
);
t(worstOf(new Set([])) === "WINDOW_BLUR", "an empty set still names something");
t(worstOf(new Set(["HONEYPOT"])) === "WINDOW_BLUR", "an unranked kind falls back rather than throwing");
t(isMoreTelling("TAB_SWITCH", "WINDOW_BLUR"), "tab switch is more telling than a blur");
t(!isMoreTelling("WINDOW_BLUR", "TAB_SWITCH"), "and not the other way round");
t(!isMoreTelling("TAB_SWITCH", "TAB_SWITCH"), "the same word is not an upgrade");
t(!isMoreTelling("HONEYPOT", "WINDOW_BLUR"), "a honeypot is not an upgrade of a departure");

console.log(`\n${checks} checks, ${bugs.length} problem${bugs.length === 1 ? "" : "s"}`);
if (bugs.length) {
  console.log("");
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(1);
}
