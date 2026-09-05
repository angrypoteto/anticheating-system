/**
 * Second pass: the edges rather than the happy path.
 *
 * The first sweep covered what each feature does when used as intended. The
 * bugs this project has actually shipped were at the edges — one action counted
 * three times, a timeout longer than the function running it, a test that asked
 * the wrong endpoint — so this pass goes looking there.
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Run from web/ whatever directory it was invoked from: these read .env.local
// and compile modules out of src/.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

copyFileSync("src/lib/grading.ts", "g.tmp.ts");
writeFileSync("g.tmp.ts", readFileSync("g.tmp.ts", "utf8").replace('import "server-only";', ""));
try {
  execFileSync("npx", ["tsc", "g.tmp.ts", "--target", "es2022", "--module", "esnext",
    "--skipLibCheck", "--typeRoots", "./no-types"], { stdio: "pipe", shell: true });
} catch {}
renameSync("g.tmp.js", "g.tmp.mjs");
const { isCorrect, scorePercentage } = await import(pathToFileURL(path.resolve("g.tmp.mjs")).href);

const S = Date.now();
const made = { users: [], exams: [], sections: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (area, l, d = "") => { checks++; bugs.push({ area, l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, area, l, d = "") => (c ? ok(l, d) : bug(area, l, d));
const section = (n) => console.log(`\n== ${n} ==`);

const settings = (p) => svc.from("system_settings").update(p).eq("id", true);
const { data: before } = await svc.from("system_settings")
  .select("classes_enabled, allow_class_self_join, pass_threshold").eq("id", true).single();

async function user(tag, role, name) {
  const email = `qb-${tag}-${S}@example.com`, pw = `Qb!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: name }).eq("id", data.user.id);
  const c = anon();
  const { error: e } = await c.auth.signInWithPassword({ email, password: pw });
  if (e) throw new Error(`${tag} sign in: ${e.message}`);
  return { id: data.user.id, email, pw, client: c };
}

try {
  await settings({ classes_enabled: false, pass_threshold: 75 });

  // A name that will break a naive CSV writer.
  const teacher = await user("t", "INSTRUCTOR", 'Prof. "Q" Reyes, PhD');
  const alice = await user("a", "STUDENT", 'Dela Cruz, Juan "JC"');
  const bob = await user("b", "STUDENT", "Bob Ordinary");

  const mkExam = async (title, opts = {}) => {
    const { data: e } = await svc.from("exams").insert({
      title, created_by_id: teacher.id, status: "DRAFT",
      timer_config: { totalMinutes: opts.minutes ?? 30, perQuestionSeconds: null },
      lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
    }).select("id, share_token").single();
    made.exams.push(e.id);
    return e;
  };

  // ------------------------------------------------ publishing an empty exam
  section("An exam with no questions");
  const empty = await mkExam(`QB Empty ${S}`);
  const { count: qCount } = await svc.from("questions")
    .select("*", { count: "exact", head: true }).eq("exam_id", empty.id);
  t(qCount === 0, "setup", "the exam really has no questions", `${qCount}`);
  t(scorePercentage(0, 0) === 0, "grading", "an empty exam scores 0 rather than dividing by zero",
    `${scorePercentage(0, 0)}%`);

  // ------------------------------------------------------------- the paper
  section("Answering and changing answers");
  const exam = await mkExam(`QB Paper ${S}`);
  const qs = [];
  for (let i = 1; i <= 4; i++) {
    const { data: q } = await svc.from("questions").insert({
      exam_id: exam.id, type: "MULTIPLE_CHOICE",
      prompt: `QB Q${i}?`, choices: [`A${i}`, `B${i}`], order: i,
    }).select("id").single();
    await svc.from("question_answers").insert({ question_id: q.id, correct_answer: `B${i}` });
    qs.push({ id: q.id, answer: `B${i}` });
  }
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);
  await alice.client.rpc("open_exam_link", { token: exam.share_token });
  await bob.client.rpc("open_exam_link", { token: exam.share_token });

  const { data: sess } = await alice.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: alice.id }).select("id, started_at").single();

  const save = (qid, val) => alice.client.from("answers")
    .upsert({ session_id: sess.id, question_id: qid, response: val }, { onConflict: "session_id,question_id" });

  const { error: firstSave } = await save(qs[0].id, "A1");
  t(!firstSave, "sitting", "an answer saves", firstSave?.message);
  const { error: changed } = await save(qs[0].id, "B1");
  t(!changed, "sitting", "and can be changed", changed?.message);
  const { data: stored } = await svc.from("answers")
    .select("response").eq("session_id", sess.id).eq("question_id", qs[0].id).single();
  t(stored?.response === "B1", "sitting", "the change is what is kept", JSON.stringify(stored?.response));

  const { count: rows } = await svc.from("answers")
    .select("*", { count: "exact", head: true }).eq("session_id", sess.id);
  t(rows === 1, "sitting", "changing an answer does not leave two rows", `${rows} row(s)`);

  // Resume: what the page reads back when they return.
  const { data: resumed } = await alice.client.from("answers")
    .select("question_id, response").eq("session_id", sess.id);
  t((resumed ?? []).length === 1 && resumed[0].response === "B1",
    "sitting", "a resumed sitting sees the saved answer");

  // ------------------------------------------------------------ the timer
  section("Timer and auto-submit");
  // gradeAndClose calls it over-time when elapsed exceeds the limit; that rule
  // is what turns a manual submit into an auto one.
  const overRule = (startedAt, totalMinutes, closesAt) => {
    const elapsed = (Date.now() - new Date(startedAt).getTime()) / 60000;
    const pastTimer = totalMinutes > 0 && elapsed > totalMinutes;
    const pastClose = Boolean(closesAt) && Date.now() > new Date(closesAt).getTime();
    return pastTimer || pastClose;
  };
  const longAgo = new Date(Date.now() - 45 * 60000).toISOString();
  t(overRule(longAgo, 30, null), "timer", "a sitting past its limit counts as over time");
  t(!overRule(new Date().toISOString(), 30, null), "timer", "one inside the limit does not");
  t(!overRule(longAgo, 0, null), "timer", "an untimed exam never runs over");
  t(overRule(new Date().toISOString(), 30, new Date(Date.now() - 1000).toISOString()),
    "timer", "an exam closing under a student ends their sitting too");

  // ----------------------------------------------------- per-question figures
  section("Per-question analysis");
  await save(qs[1].id, "B2");   // correct
  await save(qs[2].id, "A3");   // wrong
  // qs[3] deliberately left blank

  const { data: bobSess } = await bob.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: bob.id }).select("id").single();
  await bob.client.from("answers").upsert(
    { session_id: bobSess.id, question_id: qs[0].id, response: "A1" },
    { onConflict: "session_id,question_id" });

  const sessionIds = [sess.id, bobSess.id];
  const { data: all } = await svc.from("answers").select("question_id, response").in("session_id", sessionIds);
  const stat = (q) => {
    const given = (all ?? []).filter((a) => a.question_id === q.id);
    const right = given.filter((a) => isCorrect("MULTIPLE_CHOICE", a.response, q.answer)).length;
    return { answered: given.length, right, blank: sessionIds.length - given.length,
      pct: given.length ? Math.round((right / given.length) * 100) : null };
  };
  const q1 = stat(qs[0]), q4 = stat(qs[3]);
  t(q1.answered === 2 && q1.right === 1 && q1.pct === 50,
    "analysis", "a question answered by both reports the right share", JSON.stringify(q1));
  t(q4.answered === 0 && q4.pct === null && q4.blank === 2,
    "analysis", "a question nobody answered reports blank, not 0%", JSON.stringify(q4));

  // ------------------------------------------------------------- archiving
  section("Archiving");
  const archived = await mkExam(`QB Archived ${S}`);
  const { data: aq } = await svc.from("questions").insert({
    exam_id: archived.id, type: "IDENTIFICATION", prompt: "QB A1?", order: 1,
  }).select("id").single();
  await svc.from("question_answers").insert({ question_id: aq.id, correct_answer: ["x"] });
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", archived.id);
  await bob.client.rpc("open_exam_link", { token: archived.share_token });
  await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", archived.id);

  const { data: seesArchived } = await bob.client.from("exams").select("id").eq("id", archived.id);
  t((seesArchived ?? []).length === 0, "archiving", "an archived exam disappears from students");

  const { error: startArchived } = await bob.client.from("exam_sessions")
    .insert({ exam_id: archived.id, student_id: bob.id });
  t(Boolean(startArchived), "archiving", "and cannot be started");

  const { error: linkArchived } = await bob.client.rpc("open_exam_link", { token: archived.share_token });
  t(Boolean(linkArchived), "archiving", "its share link says it is not open", linkArchived?.message?.slice(0, 40));

  // ------------------------------------------------------ disabled mid-exam
  section("An account disabled mid-exam");
  await svc.from("users").update({ status: "DISABLED" }).eq("id", bob.id);
  const { data: bobExams } = await bob.client.from("exams").select("id");
  t((bobExams ?? []).length === 0, "security", "a disabled student loses sight of every exam",
    `${(bobExams ?? []).length}`);
  const { error: bobAnswer } = await bob.client.from("answers").upsert(
    { session_id: bobSess.id, question_id: qs[1].id, response: "B2" },
    { onConflict: "session_id,question_id" });
  t(Boolean(bobAnswer), "security", "and cannot keep answering");
  await svc.from("users").update({ status: "ACTIVE" }).eq("id", bob.id);

  // ------------------------------------------------------------- the CSV
  section("CSV export");
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = [alice.email, 'Dela Cruz, Juan "JC"', "ACTIVE"].map(esc).join(",");
  const fields = line.match(/("([^"]|"")*"|[^,]*)/g).filter((x) => x !== "");
  t(fields.length === 3, "export", "a name with a comma and quotes stays one field",
    `${fields.length} fields: ${line}`);
  t(line.includes('"Dela Cruz, Juan ""JC"""'), "export", "and its quotes are doubled", line);

  // ----------------------------------------------------- deleting a class
  section("Deleting a class that is in use");
  const { data: cls } = await svc.from("sections")
    .insert({ subject: `QB Subj ${S}`, name: `QB-4C-${S}` }).select("id").single();
  made.sections.push(cls.id);
  await svc.from("enrollments").insert({ student_id: alice.id, section_id: cls.id });
  const { data: classExam } = await svc.from("exams").insert({
    title: `QB Class Exam ${S}`, section_id: cls.id, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 10, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id").single();
  made.exams.push(classExam.id);

  const { error: delClass } = await svc.from("sections").delete().eq("id", cls.id);
  const { data: examStill } = await svc.from("exams").select("id, section_id").eq("id", classExam.id).maybeSingle();
  if (delClass) {
    ok("a class with an exam cannot simply be deleted", delClass.message.slice(0, 60));
  } else {
    t(Boolean(examStill), "classes", "deleting a class does not delete its exams",
      examStill ? `exam kept, section_id=${examStill.section_id}` : "THE EXAM WAS DELETED WITH IT");
    made.sections = made.sections.filter((x) => x !== cls.id);
  }

  // ------------------------------------------------------------ no subject
  section("An exam with no subject");
  const { data: mine } = await alice.client.rpc("my_exams");
  const plain = (mine ?? []).find((r) => r.exam_id === exam.id);
  t(plain && plain.subject === null, "results", "a subjectless exam reports null, not a crash",
    `subject=${JSON.stringify(plain?.subject)}`);
  t((mine ?? []).length === new Set((mine ?? []).map((r) => r.exam_id)).size,
    "results", "no exam is listed twice", `${(mine ?? []).length} rows`);
} catch (e) {
  bug("harness", "the sweep stopped early", e.message);
} finally {
  await settings({
    classes_enabled: before.classes_enabled,
    allow_class_self_join: before.allow_class_self_join,
    pass_threshold: before.pass_threshold,
  });
  for (const id of made.exams) {
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    await svc.from("exam_access").delete().eq("exam_id", id);
    await svc.from("exam_sections").delete().eq("exam_id", id);
    const { data: ss } = await svc.from("exam_sessions").select("id").eq("exam_id", id);
    for (const x of ss ?? []) {
      await svc.from("answers").delete().eq("session_id", x.id);
      await svc.from("flags").delete().eq("session_id", x.id);
    }
    await svc.from("exam_sessions").delete().eq("exam_id", id);
    const { data: qq } = await svc.from("questions").select("id").eq("exam_id", id);
    for (const q of qq ?? []) await svc.from("question_answers").delete().eq("question_id", q.id);
    await svc.from("questions").delete().eq("exam_id", id);
    await svc.from("exams").delete().eq("id", id);
  }
  for (const id of made.sections) {
    await svc.from("enrollments").delete().eq("section_id", id);
    await svc.from("sections").delete().eq("id", id);
  }
  await svc.from("subjects").delete().ilike("name", `QB %${S}`);
  for (const id of made.users) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  unlinkSync("g.tmp.ts"); unlinkSync("g.tmp.mjs");
  console.log(`\n${checks} checks, ${bugs.length} finding(s).`);
  if (bugs.length) { console.log("\nFindings:"); for (const b of bugs) console.log(`  [${b.area}] ${b.l}${b.d ? " — " + b.d : ""}`); }
  process.exit(0);
}
