/**
 * Deleting an exam, and deleting an account.
 *
 * The two operations in the system that cannot be undone, so they are checked
 * against the real database: that they remove everything they should, that they
 * leave nothing dangling, that they refuse what would orphan data, and — most
 * of all — that nobody can delete somebody else's.
 *
 * Cleans up after itself, including when it fails partway.
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
const made = { users: [], exams: [], sections: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const sec = (n) => console.log(`\n== ${n} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mk = async (tag, role, name) => {
  const email = `dl-${tag}-${S}@example.com`, pw = `Dl!${S}${tag}`;
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

/** A published exam with a sitting on it: the case that could not be deleted at all. */
const mkExam = async (owner, student, title) => {
  const { data: e, error } = await svc.from("exams").insert({
    title, created_by_id: owner.id, status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id").single();
  if (error) throw new Error("exam: " + error.message);
  made.exams.push(e.id);

  const { data: q } = await svc.from("questions").insert({
    exam_id: e.id, type: "MULTIPLE_CHOICE", prompt: "Q?", choices: ["A", "B"], order: 1,
  }).select("id").single();
  await svc.from("question_answers").insert({ question_id: q.id, correct_answer: "B" });
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", e.id);
  await svc.from("exam_access").insert({ exam_id: e.id, student_id: student.id });

  const { data: sitting } = await svc.from("exam_sessions")
    .insert({ exam_id: e.id, student_id: student.id, status: "IN_PROGRESS" })
    .select("id").single();
  await svc.from("answers").insert({ session_id: sitting.id, question_id: q.id, response: "A" });
  await student.client.rpc("record_flag", {
    p_session_id: sitting.id, p_type: "TAB_SWITCH", p_question_id: q.id,
  });
  return { id: e.id, questionId: q.id, sessionId: sitting.id };
};

const countOf = async (table, column, value) => {
  const { count } = await svc.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  return count ?? 0;
};

try {
  sec("Cast");
  const teacher = await mk("t", "INSTRUCTOR", "Delete Teacher");
  const other = await mk("o", "INSTRUCTOR", "Other Teacher");
  const admin = await mk("a", "ADMIN", "Delete Admin");
  const student = await mk("s", "STUDENT", "Delete Student");
  ok("two teachers, an administrator and a student");

  sec("An exam nobody could delete before");

  const exam = await mkExam(teacher, student, `Delete drill ${S}`);
  t(await countOf("exam_sessions", "exam_id", exam.id) === 1, "it is published, and it has been sat");

  const { data: peek, error: peekErr } = await teacher.client
    .rpc("exam_delete_summary", { p_exam_id: exam.id });
  const summary = (peek ?? [])[0];
  t(!peekErr && summary, "the owner can ask what deleting it would destroy", peekErr?.message);
  t(summary?.sittings === 1 && summary?.answers === 1 && summary?.questions === 1,
    "and is told the sittings, not just the questions",
    `${summary?.sittings} sittings, ${summary?.answers} answers, ${summary?.questions} questions`);

  const { error: nosyPeek } = await other.client.rpc("exam_delete_summary", { p_exam_id: exam.id });
  t(!!nosyPeek, "another teacher cannot even ask", nosyPeek?.message);

  const { error: nosyDelete } = await other.client.rpc("delete_exam", { p_exam_id: exam.id });
  t(!!nosyDelete, "and certainly cannot delete it", nosyDelete?.message);
  t(await countOf("exams", "id", exam.id) === 1, "it is still there after they tried");

  const { data: title, error: delErr } = await teacher.client
    .rpc("delete_exam", { p_exam_id: exam.id });
  t(!delErr && title === `Delete drill ${S}`, "the owner deletes it", delErr?.message);

  sec("And nothing of it left behind");

  t(await countOf("exams", "id", exam.id) === 0, "the exam");
  t(await countOf("questions", "exam_id", exam.id) === 0, "its questions — frozen though they were");
  t(await countOf("question_answers", "question_id", exam.questionId) === 0, "the answer key");
  t(await countOf("exam_sessions", "exam_id", exam.id) === 0, "the sittings");
  t(await countOf("answers", "session_id", exam.sessionId) === 0, "the answers");
  t(await countOf("flags", "session_id", exam.sessionId) === 0, "the flags");
  t(await countOf("exam_access", "exam_id", exam.id) === 0, "who had been given the link");
  made.exams = made.exams.filter((id) => id !== exam.id);

  const { error: twice } = await teacher.client.rpc("delete_exam", { p_exam_id: exam.id });
  t(/already been deleted/i.test(twice?.message ?? ""),
    "deleting it again says it has gone, not that it was never yours", twice?.message);

  sec("An administrator may delete anybody's exam");

  const second = await mkExam(teacher, student, `Delete drill B ${S}`);
  const { error: adminDel } = await admin.client.rpc("delete_exam", { p_exam_id: second.id });
  t(!adminDel, "including one they did not write", adminDel?.message);
  t(await countOf("exams", "id", second.id) === 0, "and it is gone");
  made.exams = made.exams.filter((id) => id !== second.id);

  sec("Accounts that must not be deleted");

  const third = await mkExam(teacher, student, `Delete drill C ${S}`);

  const blockedBy = async (who, id) => {
    const { data } = await who.client.rpc("account_delete_summary", { p_user_id: id });
    return (data ?? [])[0]?.blocked_by ?? null;
  };

  t(await blockedBy(admin, teacher.id) === "exams",
    "one that wrote exams is refused, and says which");
  const { error: authorErr } = await admin.client.rpc("purge_account", { p_user_id: teacher.id });
  t(/wrote exams/i.test(authorErr?.message ?? ""),
    "with an error a person can act on", authorErr?.message);

  t(await blockedBy(admin, admin.id) === "self", "and you cannot delete yourself");
  const { error: selfErr } = await admin.client.rpc("purge_account", { p_user_id: admin.id });
  t(!!selfErr, "even by asking the database directly", selfErr?.message);

  const { data: sect } = await svc.from("sections")
    .insert({ subject: `Delete ${S}`, name: `Section ${S}`, instructor_id: other.id })
    .select("id").single();
  made.sections.push(sect.id);
  t(await blockedBy(admin, other.id) === "sections", "one that teaches a class is refused too");

  sec("Who may delete an account at all");

  const { error: teacherAsk } = await teacher.client
    .rpc("account_delete_summary", { p_user_id: student.id });
  t(!!teacherAsk, "a teacher cannot even ask about one", teacherAsk?.message);
  const { error: teacherPurge } = await teacher.client
    .rpc("purge_account", { p_user_id: student.id });
  t(!!teacherPurge, "nor delete one", teacherPurge?.message);
  const { error: studentPurge } = await student.client
    .rpc("purge_account", { p_user_id: other.id });
  t(!!studentPurge, "and a student certainly cannot", studentPurge?.message);

  sec("Deleting a student, and their results with them");

  const before = await blockedBy(admin, student.id);
  t(before === null, "a student who wrote no exams can go", `blocked_by: ${before}`);

  const { data: sum } = await admin.client.rpc("account_delete_summary", { p_user_id: student.id });
  t((sum ?? [])[0]?.sittings === 1, "and is counted first", `${(sum ?? [])[0]?.sittings} sitting`);

  const { data: email, error: purgeErr } = await admin.client
    .rpc("purge_account", { p_user_id: student.id });
  t(!purgeErr && email === student.email, "the data goes", purgeErr?.message);
  t(await countOf("exam_sessions", "student_id", student.id) === 0, "their sittings");
  t(await countOf("audit_log", "actor_id", student.id) === 0,
    "and the audit rows that used to block the delete outright");

  const { error: authDel } = await svc.auth.admin.deleteUser(student.id);
  t(!authDel, "so the login itself now deletes", authDel?.message);
  made.users = made.users.filter((id) => id !== student.id);

  // The exam they had sat is still there, minus them.
  t(await countOf("exams", "id", third.id) === 1, "the exam they sat is untouched");
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
    await svc.from("lesson_files").delete().eq("exam_id", id);
    await svc.from("exams").delete().eq("id", id);
  }
  for (const id of made.sections) {
    await svc.from("enrollments").delete().eq("section_id", id);
    await svc.from("sections").delete().eq("id", id);
  }
  let stuck = 0;
  for (const id of made.users) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.from("enrollments").delete().eq("student_id", id);
    await svc.from("exam_access").delete().eq("student_id", id);
    await svc.from("sections").update({ instructor_id: null }).eq("instructor_id", id);
    await svc.from("flags").update({ resolved_by_id: null }).eq("resolved_by_id", id);
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) stuck++;
  }
  t(stuck === 0, "test data removed", stuck ? `${stuck} account(s) left behind` : "");

  console.log(`\n${checks} checks, ${bugs.length} failing`);
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(bugs.length ? 1 : 0);
}
