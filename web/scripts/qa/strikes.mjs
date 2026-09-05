/**
 * One departure is one strike — proved against the real database.
 *
 * This replays the sitting that went wrong on 5 September: four proctoring
 * signals inside 1.9 seconds, two of them numbered "strike 1", and a blank paper
 * auto-submitted. The counting used to live in a React ref that starts at zero
 * for every mount, so a reload or a second tab ran a tally of its own. It now
 * lives in record_flag(), and these are the rules it has to keep.
 *
 * Runs against the live project and cleans up after itself.
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const S = Date.now();
const made = { users: [], exams: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const section = (n) => console.log(`\n== ${n} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A signed-in actor. Sign-in is rate limited per IP, so it waits rather than fails. */
const mk = async (tag, role) => {
  const email = `st-${tag}-${S}@example.com`, pw = `St!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: `Strike ${tag}` }).eq("id", data.user.id);
  for (let a = 0; a < 8; a++) {
    const c = anon();
    const { error: e } = await c.auth.signInWithPassword({ email, password: pw });
    if (!e) return { id: data.user.id, client: c };
    if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
    await sleep(65_000);
  }
  throw new Error(`sign in ${tag}: still rate limited`);
};

const flag = (who, sessionId, type, questionId = null) =>
  who.client.rpc("record_flag", { p_session_id: sessionId, p_type: type, p_question_id: questionId });

const rows = async (sessionId) => {
  const { data } = await svc.from("flags")
    .select("type, strike_number, occurred_at, resolution")
    .eq("session_id", sessionId).order("occurred_at");
  return data ?? [];
};

try {
  section("Cast");
  const teacher = await mk("t", "INSTRUCTOR");
  const student = await mk("s", "STUDENT");
  const other = await mk("o", "STUDENT");
  ok("a teacher and two students signed in");

  const { data: exam, error: exErr } = await svc.from("exams").insert({
    title: `Strike drill ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id").single();
  if (exErr) throw new Error("exam: " + exErr.message);
  made.exams.push(exam.id);
  const { data: q } = await svc.from("questions").insert({
    exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: "Effective range?", choices: ["A", "B"], order: 1,
  }).select("id").single();
  if (!q) throw new Error("question insert failed");
  await svc.from("question_answers").insert({ question_id: q.id, correct_answer: "B" });
  // Questions are frozen once an exam is published, so publish after writing them.
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);

  const sit = async (who) => {
    const { data } = await svc.from("exam_sessions")
      .insert({ exam_id: exam.id, student_id: who.id, status: "IN_PROGRESS" })
      .select("id").single();
    return data.id;
  };
  const session = await sit(student);
  ok("a sitting is open");

  // ------------------------------------------------------- the recorded burst
  section("The burst that failed a student");

  // 13:43:22.741 WINDOW_BLUR #1 / 13:43:23.924 WINDOW_BLUR #1
  // 13:43:24.137 TAB_SWITCH  #2 / 13:43:24.630 FULLSCREEN_EXIT #3
  const replay = [
    ["WINDOW_BLUR", 0],
    ["WINDOW_BLUR", 1183],
    ["TAB_SWITCH", 213],
    ["FULLSCREEN_EXIT", 493],
  ];
  const counts = [];
  for (const [type, gap] of replay) {
    if (gap) await sleep(gap);
    const { data, error } = await flag(student, session, type, q.id);
    if (error) { bug(`recording ${type} failed`, error.message); break; }
    counts.push(data);
  }
  t(counts.length === 4 && counts.every((c) => c === 1),
    "one departure, four signals, one strike", `counts: ${counts.join(", ")}`);
  t((await rows(session)).length === 4,
    "all four signals are still written down — evidence is not thrown away");
  t((await rows(session)).every((r) => r.strike_number === 1),
    "and all four carry the same strike number");

  // ------------------------------------------------------------- second tab
  section("Two tabs of the same sitting, at the same instant");

  const burst = await Promise.all([
    flag(student, session, "WINDOW_BLUR", q.id),
    flag(student, session, "TAB_SWITCH", q.id),
    flag(student, session, "FULLSCREEN_EXIT", q.id),
  ]);
  t(burst.every((r) => !r.error && r.data === 1),
    "simultaneous tabs cannot each start their own tally",
    `counts: ${burst.map((r) => r.data ?? r.error?.message).join(", ")}`);

  // ------------------------------------------------------- a real second trip
  section("Leaving again, properly");

  await sleep(11_000); // past the settle window
  const { data: second } = await flag(student, session, "TAB_SWITCH", q.id);
  t(second === 2, "a departure after the settle window is a second strike", `count: ${second}`);

  const { data: stillSecond } = await flag(student, session, "WINDOW_BLUR", q.id);
  t(stillSecond === 2, "its own follow-up signals do not add a third", `count: ${stillSecond}`);

  // --------------------------------------------------------------- honeypot
  section("The honeypot is not a departure");

  const { data: hp } = await flag(student, session, "HONEYPOT", q.id);
  t(hp === 3, "a honeypot trip counts on its own, even inside a departure", `count: ${hp}`);

  // ------------------------------------------------------------- reload/seed
  section("Reloading the page");

  const { data: seeded } = await student.client.rpc("my_strikes", { p_session_id: session });
  t(seeded === 3, "a reload resumes the count instead of starting again at zero", `count: ${seeded}`);

  const { data: nosy } = await other.client.rpc("my_strikes", { p_session_id: session });
  t(nosy === 0, "and tells nobody else about it", `count: ${nosy}`);

  const { data: peek } = await student.client.from("flags").select("id").eq("session_id", session);
  t((peek ?? []).length === 0, "a student still cannot read the flags themselves");

  // ------------------------------------------------------- what they were told
  section("What the student is told they did");

  const { data: log } = await student.client.rpc("my_strike_log", { p_session_id: session });
  t((log ?? []).length === 3, "one line per strike, not one per signal",
    `${(log ?? []).length} lines from ${(await rows(session)).length} signals`);
  t((log ?? [])[0]?.kind === "TAB_SWITCH",
    "and each names the most telling signal of its departure", `first: ${(log ?? [])[0]?.kind}`);

  const { data: nosyLog } = await other.client.rpc("my_strike_log", { p_session_id: session });
  t((nosyLog ?? []).length === 0, "nobody else can read that log", `${(nosyLog ?? []).length} lines`);

  // --------------------------------------------------------------- voiding
  section("A teacher voids a warning");

  const all = await rows(session);
  await svc.from("flags").update({ resolution: "VOIDED", resolved_by_id: teacher.id })
    .eq("session_id", session).eq("strike_number", 1);
  const { data: afterVoid } = await student.client.rpc("my_strikes", { p_session_id: session });
  t(afterVoid === 2, "voiding hands the warning back", `${all.length} signals, count now ${afterVoid}`);

  // ------------------------------------------------------------- other people
  section("Whose sitting it is");

  const { error: notMine } = await flag(other, session, "TAB_SWITCH", q.id);
  t(!!notMine, "nobody can record a flag against somebody else's sitting", notMine?.message);

  await svc.from("exam_sessions").update({ status: "SUBMITTED", submitted_at: new Date().toISOString() })
    .eq("id", session);
  const { error: closed } = await flag(student, session, "TAB_SWITCH", q.id);
  t(!!closed, "nor against a sitting that is already over", closed?.message);

  // --------------------------------------------- the limit, end to end
  section("Three strikes, and only three");

  const fresh = await sit(other);
  let last = 0;
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(11_000);
    // Each trip out fires the same three-event burst a real browser fires.
    for (const type of ["WINDOW_BLUR", "TAB_SWITCH", "FULLSCREEN_EXIT"]) {
      const { data } = await flag(other, fresh, type, q.id);
      last = data;
    }
  }
  t(last === 3, "three trips out of the window are three strikes, not nine", `count: ${last}`);
  const ninish = await rows(fresh);
  t(ninish.length === 9, "with all nine signals kept for the monitor", `${ninish.length} rows`);
} catch (e) {
  bug("the run itself fell over", e.message);
} finally {
  section("Cleanup");
  for (const id of made.exams) {
    const { data: ss } = await svc.from("exam_sessions").select("id").eq("exam_id", id);
    for (const s of ss ?? []) {
      await svc.from("flags").delete().eq("session_id", s.id);
      await svc.from("answers").delete().eq("session_id", s.id);
    }
    await svc.from("exam_sessions").delete().eq("exam_id", id);
    const { data: qq } = await svc.from("questions").select("id").eq("exam_id", id);
    for (const q of qq ?? []) await svc.from("question_answers").delete().eq("question_id", q.id);
    await svc.from("questions").delete().eq("exam_id", id);
    await svc.from("exams").delete().eq("id", id);
  }
  for (const id of made.users) await svc.auth.admin.deleteUser(id).catch(() => {});
  ok("test data removed");

  console.log(`\n${checks} checks, ${bugs.length} failing`);
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(bugs.length ? 1 : 0);
}
