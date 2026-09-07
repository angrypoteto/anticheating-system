/**
 * Opening a closed exam for one person.
 *
 * Reopening a sitting used to put a student back into a paper they still could
 * not write in, because answering asks whether the *exam* is open and the
 * teacher had closed it. The remedy on offer was to reopen the window for the
 * whole class, which is not what anybody means by an allowance.
 *
 * What matters here is the pair: the excused student can answer, and everybody
 * else in the same closed exam still cannot. One without the other is useless.
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
const sec = (n) => console.log(`\n== ${n} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mk = async (tag, role, name) => {
  const email = `ex-${tag}-${S}@example.com`, pw = `Ex!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: name }).eq("id", data.user.id);
  for (let a = 0; a < 8; a++) {
    const c = anon();
    const { error: e } = await c.auth.signInWithPassword({ email, password: pw });
    if (!e) return { id: data.user.id, email, client: c };
    if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
    await sleep(65_000);
  }
  throw new Error(`sign in ${tag}: still rate limited`);
};

/** Can this student write into their sitting right now? */
const canAnswer = async (who, sessionId, questionId, value) => {
  const { error } = await who.client.from("answers").upsert(
    { session_id: sessionId, question_id: questionId, response: value },
    { onConflict: "session_id,question_id" },
  );
  return { ok: !error, why: error?.message ?? "" };
};

try {
  sec("A closed exam with two students still in it");

  const teacher = await mk("t", "INSTRUCTOR", "Extension Teacher");
  const other = await mk("o", "INSTRUCTOR", "Other Teacher");
  const excused = await mk("s", "STUDENT", "Excused Student");
  const everyone = await mk("e", "STUDENT", "Ordinary Student");

  const { data: exam, error: exErr } = await svc.from("exams").insert({
    title: `Extension drill ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id").single();
  if (exErr) throw new Error("exam: " + exErr.message);
  made.exams.push(exam.id);

  const { data: q } = await svc.from("questions").insert({
    exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: "Q?", choices: ["A", "B"], order: 1,
  }).select("id").single();
  await svc.from("question_answers").insert({ question_id: q.id, correct_answer: "B" });

  // Published and open, so both can start.
  await svc.from("exams").update({
    status: "PUBLISHED", published_at: new Date().toISOString(),
    opens_at: null, closes_at: null,
  }).eq("id", exam.id);

  const sit = async (who) => {
    const { data } = await svc.from("exam_sessions")
      .insert({ exam_id: exam.id, student_id: who.id, status: "IN_PROGRESS" })
      .select("id").single();
    return data.id;
  };
  const excusedSitting = await sit(excused);
  const otherSitting = await sit(everyone);

  const first = await canAnswer(excused, excusedSitting, q.id, "A");
  t(first.ok, "while it is open, they can both answer", first.why);

  sec("The teacher closes it");

  await svc.from("exams").update({ closes_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", exam.id);

  const shut = await canAnswer(excused, excusedSitting, q.id, "B");
  t(!shut.ok, "and neither of them can write any more", shut.why || "the write went through");

  sec("An allowance for one of them");

  const { data: until, error: extErr } = await teacher.client
    .rpc("extend_sitting", { p_session_id: excusedSitting, p_minutes: 30 });
  t(!extErr && typeof until === "string", "the teacher grants time to one sitting", extErr?.message);
  t(new Date(until) > new Date(), "which runs from now", until);

  const nowAllowed = await canAnswer(excused, excusedSitting, q.id, "B");
  t(nowAllowed.ok, "that student can write again", nowAllowed.why);

  const stillShut = await canAnswer(everyone, otherSitting, q.id, "B");
  t(!stillShut.ok,
    "and the exam is still closed to everybody else — which is the whole point",
    stillShut.why || "the other student wrote too");

  sec("Whose allowance it is to give");

  const { error: nosy } = await other.client
    .rpc("extend_sitting", { p_session_id: otherSitting, p_minutes: 30 });
  t(!!nosy, "a teacher who does not own the exam cannot grant one", nosy?.message);

  const { error: selfServe } = await excused.client
    .rpc("extend_sitting", { p_session_id: excusedSitting, p_minutes: 480 });
  t(!!selfServe, "and a student certainly cannot grant their own", selfServe?.message);

  const stillOn = await canAnswer(excused, excusedSitting, q.id, "A");
  t(stillOn.ok, "the allowance they were given still stands", stillOn.why);

  sec("Bounds");

  const { data: silly } = await teacher.client
    .rpc("extend_sitting", { p_session_id: excusedSitting, p_minutes: 100000 });
  const hours = (new Date(silly) - Date.now()) / 3_600_000;
  t(hours <= 8.05, "a slip of the keyboard cannot grant a week", `${hours.toFixed(1)} hours`);

  const { data: tiny } = await teacher.client
    .rpc("extend_sitting", { p_session_id: excusedSitting, p_minutes: 0 });
  const mins = (new Date(tiny) - Date.now()) / 60_000;
  t(mins >= 4.9, "nor an allowance too short to be one", `${mins.toFixed(1)} minutes`);

  sec("Taking it back");

  const { error: endErr } = await teacher.client
    .rpc("end_extension", { p_session_id: excusedSitting });
  t(!endErr, "the teacher can end it early", endErr?.message);

  const shutAgain = await canAnswer(excused, excusedSitting, q.id, "B");
  t(!shutAgain.ok, "and the student is shut out again at once",
    shutAgain.why || "the write went through");

  sec("An allowance that has run out");

  /**
   * Expired according to the database, not according to this laptop.
   *
   * This used to write `Date.now() - 1000`, which asks a question on the
   * client's clock and has it answered on the server's. This machine runs
   * about two seconds ahead, so "one second ago" arrived as one second in the
   * FUTURE, the allowance was still live, and the check failed while the rule
   * was working perfectly.
   *
   * extend_sitting returns a timestamp the database computed, so the offset
   * between the two clocks falls out of it. A minute of margin then makes the
   * test independent of how well anybody's clock is synchronised.
   */
  const { data: stamped } = await teacher.client
    .rpc("extend_sitting", { p_session_id: excusedSitting, p_minutes: 0 });
  const dbNow = new Date(stamped).getTime() - 5 * 60_000;
  await svc.from("exam_sessions")
    .update({ reopened_until: new Date(dbNow - 60_000).toISOString() })
    .eq("id", excusedSitting);
  const expired = await canAnswer(excused, excusedSitting, q.id, "A");
  t(!expired.ok, "expires on its own, with nobody having to remember it",
    expired.why || "the write went through");

  sec("An archived paper");

  await svc.from("exam_sessions")
    .update({ reopened_until: new Date(dbNow + 3_600_000).toISOString() })
    .eq("id", excusedSitting);
  await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", exam.id);
  const archived = await canAnswer(excused, excusedSitting, q.id, "B");
  t(!archived.ok,
    "an allowance is a way past the clock, not a way into an archived exam",
    archived.why || "the write went through");
} catch (e) {
  bug("the run itself fell over", e.message);
} finally {
  sec("Cleanup");
  for (const id of made.exams) {
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    await svc.from("exam_sections").delete().eq("exam_id", id);
    await svc.from("exam_access").delete().eq("exam_id", id);
    const { data: ss } = await svc.from("exam_sessions").select("id").eq("exam_id", id);
    for (const x of ss ?? []) {
      await svc.from("flags").delete().eq("session_id", x.id);
      await svc.from("answers").delete().eq("session_id", x.id);
    }
    await svc.from("exam_sessions").delete().eq("exam_id", id);
    const { data: qq } = await svc.from("questions").select("id").eq("exam_id", id);
    for (const x of qq ?? []) await svc.from("question_answers").delete().eq("question_id", x.id);
    await svc.from("questions").delete().eq("exam_id", id);
    await svc.from("exams").delete().eq("id", id);
  }
  let stuck = 0;
  for (const id of made.users) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.from("enrollments").delete().eq("student_id", id);
    await svc.from("exam_access").delete().eq("student_id", id);
    await svc.from("sections").update({ instructor_id: null }).eq("instructor_id", id);
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) stuck++;
  }
  t(stuck === 0, "test data removed", stuck ? `${stuck} account(s) left behind` : "");

  console.log(`\n${checks} checks, ${bugs.length} failing`);
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(bugs.length ? 1 : 0);
}
