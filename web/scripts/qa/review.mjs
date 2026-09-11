/**
 * A teacher's mark overrules the key — and only a teacher can make one.
 *
 * Reviewing a paper lets whoever manages the exam mark an answer right or
 * wrong themselves, and the score follows. The mark lives on the answer row,
 * which the student writes while they sit, so the danger is obvious: a student
 * posting marked_correct = true beside their own answer. This proves the
 * database refuses that every way it could be tried, that the teacher's mark
 * does move the score, and that handing an answer back to the key undoes it.
 *
 * The score is recomputed by the real rescoreSession(), not a copy of it.
 * Runs against the live project and cleans up after itself.
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
Object.assign(process.env, env);

/**
 * grade-session.ts is server code: it opens with `import "server-only"` and
 * reaches its neighbours through the "@/" alias. Both are the build's business,
 * so the resolver answers the first with nothing and maps the second to src/.
 */
const { register } = await import("node:module");
register(
  "data:text/javascript," +
    encodeURIComponent(
      `const SRC = ${JSON.stringify(pathToFileURL(path.join(root, "src")).href)};
       export async function resolve(spec, ctx, next) {
         if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
         if (spec.startsWith("@/")) return next(SRC + "/" + spec.slice(2) + ".ts", ctx);
         return next(spec, ctx);
       }`,
    ),
  import.meta.url,
);
const { rescoreSession } = await import(new URL("../../src/lib/grade-session.ts", import.meta.url).href);

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
  const email = `rv-${tag}-${S}@example.com`, pw = `Rv!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: `Review ${tag}` }).eq("id", data.user.id);
  for (let a = 0; a < 8; a++) {
    const c = anon();
    const { error: e } = await c.auth.signInWithPassword({ email, password: pw });
    if (!e) return { id: data.user.id, client: c };
    if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
    await sleep(65_000);
  }
  throw new Error(`sign in ${tag}: still rate limited`);
};

const answer = async (sessionId, questionId) =>
  (await svc.from("answers")
    .select("response, marked_correct, marked_by_id, marked_at")
    .eq("session_id", sessionId).eq("question_id", questionId).maybeSingle()).data;

const scoreOf = async (sessionId) =>
  (await svc.from("exam_sessions").select("score").eq("id", sessionId).single()).data?.score;

try {
  section("Cast");
  const teacher = await mk("t", "INSTRUCTOR");
  const stranger = await mk("x", "INSTRUCTOR");
  const student = await mk("s", "STUDENT");
  ok("a teacher, another teacher and a student signed in");

  const { data: exam, error: exErr } = await svc.from("exams").insert({
    title: `Review drill ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: false, blockCopyPaste: true, maxStrikes: 3, honeypot: false },
  }).select("id").single();
  if (exErr) throw new Error("exam: " + exErr.message);
  made.exams.push(exam.id);

  // Four questions: one right by the key, one identification spelt a little
  // off (wrong by the key, right to a person), one plainly wrong, one blank.
  const { data: qs, error: qErr } = await svc.from("questions").insert([
    { exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: "Two plus two?", choices: ["3", "4"], order: 1 },
    { exam_id: exam.id, type: "IDENTIFICATION", prompt: "Powerhouse of the cell?", order: 2 },
    { exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: "Capital of France?", choices: ["Paris", "Rome"], order: 3 },
    { exam_id: exam.id, type: "IDENTIFICATION", prompt: "Largest planet?", order: 4 },
  ]).select("id, order");
  if (qErr) throw new Error("questions: " + qErr.message);
  const q = Object.fromEntries(qs.map((r) => [r.order, r.id]));
  await svc.from("question_answers").insert([
    { question_id: q[1], correct_answer: "4" },
    { question_id: q[2], correct_answer: ["Mitochondria"] },
    { question_id: q[3], correct_answer: "Paris" },
    { question_id: q[4], correct_answer: ["Jupiter"] },
  ]);
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);

  const { data: sitting } = await svc.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: student.id, status: "IN_PROGRESS" })
    .select("id").single();
  const sid = sitting.id;
  ok("a sitting is open");

  // ------------------------------------------------------ the student's side
  section("A student cannot mark their own paper");

  const { error: insErr } = await student.client.from("answers").insert({
    session_id: sid, question_id: q[2], response: "Mitocondria", marked_correct: true,
  });
  t(!insErr, "the answer itself is saved", insErr?.message);
  let a2 = await answer(sid, q[2]);
  t(a2?.marked_correct === null && a2?.marked_by_id === null,
    "a mark sent with a new answer is dropped", JSON.stringify(a2));

  await student.client.from("answers")
    .update({ marked_correct: true, marked_by_id: student.id, marked_at: new Date().toISOString() })
    .eq("session_id", sid).eq("question_id", q[2]);
  a2 = await answer(sid, q[2]);
  t(a2?.marked_correct === null && a2?.marked_by_id === null && a2?.marked_at === null,
    "a mark written onto an existing answer is put back", JSON.stringify(a2));

  await student.client.from("answers")
    .update({ response: "Mitochondrion", marked_correct: true })
    .eq("session_id", sid).eq("question_id", q[2]);
  a2 = await answer(sid, q[2]);
  t(a2?.response === "Mitochondrion" && a2?.marked_correct === null,
    "changing the answer still works, the mark riding along with it does not", JSON.stringify(a2));

  const { error: upErr } = await student.client.from("answers").upsert(
    { session_id: sid, question_id: q[1], response: "4", marked_correct: false },
    { onConflict: "session_id,question_id" },
  );
  t(!upErr && (await answer(sid, q[1]))?.marked_correct === null,
    "the runner's own upsert path drops a mark too", upErr?.message);
  await student.client.from("answers").insert({ session_id: sid, question_id: q[3], response: "Rome" });
  // Question 4 is left blank.

  const { error: selfRpc } = await student.client.rpc("mark_answer", {
    p_session_id: sid, p_question_id: q[3], p_correct: true,
  });
  t(Boolean(selfRpc), "mark_answer() refuses the student", selfRpc?.message);

  const { error: liveErr } = await teacher.client.rpc("mark_answer", {
    p_session_id: sid, p_question_id: q[2], p_correct: true,
  });
  t(Boolean(liveErr) && /still being sat/i.test(liveErr.message),
    "a paper still being sat cannot be marked, even by its teacher", liveErr?.message);

  // ---------------------------------------------------------- handed in
  section("Handed in, and marked by the key");

  await svc.from("exam_sessions")
    .update({ status: "SUBMITTED", submitted_at: new Date().toISOString() }).eq("id", sid);
  let r = await rescoreSession(sid);
  t(r.ok && r.correct === 1 && r.total === 4 && r.score === 25,
    "the key alone gives 1 of 4", JSON.stringify(r));
  t((await scoreOf(sid)) === 25, "and that is the score on the sitting");

  const { error: afterErr } = await student.client.from("answers")
    .update({ marked_correct: true }).eq("session_id", sid).eq("question_id", q[3]);
  t((await answer(sid, q[3]))?.marked_correct === null,
    "after hand-in the student cannot touch a mark either", afterErr?.message ?? "no error, but nothing changed");

  // ---------------------------------------------------------- the teacher
  section("The teacher checks the paper");

  const { error: otherErr } = await stranger.client.rpc("mark_answer", {
    p_session_id: sid, p_question_id: q[2], p_correct: true,
  });
  t(Boolean(otherErr), "a teacher who does not manage the exam is refused", otherErr?.message);

  const { error: markErr } = await teacher.client.rpc("mark_answer", {
    p_session_id: sid, p_question_id: q[2], p_correct: true,
  });
  t(!markErr, "the exam's teacher marks the misspelling correct", markErr?.message);
  a2 = await answer(sid, q[2]);
  t(a2?.marked_correct === true && a2?.marked_by_id === teacher.id && Boolean(a2?.marked_at),
    "the mark records who made it and when", JSON.stringify(a2));
  r = await rescoreSession(sid);
  t(r.ok && r.correct === 2 && r.score === 50, "the score follows: 2 of 4", JSON.stringify(r));
  t((await scoreOf(sid)) === 50, "and the sitting now says 50%");

  await teacher.client.rpc("mark_answer", { p_session_id: sid, p_question_id: q[1], p_correct: false });
  r = await rescoreSession(sid);
  t(r.ok && r.correct === 1 && r.score === 25,
    "a teacher can mark a key-correct answer wrong as well", JSON.stringify(r));

  const { error: blankErr } = await teacher.client.rpc("mark_answer", {
    p_session_id: sid, p_question_id: q[4], p_correct: true,
  });
  t(Boolean(blankErr) && /left blank/i.test(blankErr.message),
    "a blank question has nothing to mark", blankErr?.message);

  await teacher.client.rpc("mark_answer", { p_session_id: sid, p_question_id: q[1], p_correct: null });
  const a1 = await answer(sid, q[1]);
  t(a1?.marked_correct === null && a1?.marked_by_id === null && a1?.marked_at === null,
    "handing an answer back to the key clears the mark entirely", JSON.stringify(a1));
  r = await rescoreSession(sid);
  t(r.ok && r.correct === 2 && r.score === 50, "and the key's verdict counts again", JSON.stringify(r));

  // A reopened sitting handed in again must keep the teacher's marks.
  const { data: readBack } = await teacher.client.from("answers")
    .select("question_id, marked_correct").eq("session_id", sid);
  t(readBack?.find((x) => x.question_id === q[2])?.marked_correct === true,
    "the teacher can read the marks back through their own session");
} catch (e) {
  bug("the run itself fell over", e.message);
} finally {
  section("Cleanup");
  for (const id of made.exams) {
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    const { data: ss } = await svc.from("exam_sessions").select("id").eq("exam_id", id);
    for (const s of ss ?? []) {
      await svc.from("flags").delete().eq("session_id", s.id);
      await svc.from("answers").delete().eq("session_id", s.id);
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
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) stuck++;
  }
  t(stuck === 0, "test data removed", stuck ? `${stuck} account(s) left behind` : "");

  console.log(`\n${checks} checks, ${bugs.length} failing`);
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(bugs.length ? 1 : 0);
}
