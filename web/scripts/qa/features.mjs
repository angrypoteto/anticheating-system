/**
 * A test pass over every feature, against the live project.
 *
 * Findings are collected rather than asserted, so one failure does not stop the
 * sweep. Everything acts through a real signed-in session where a user would,
 * and through the service role only where the application legitimately does.
 *
 * Sign-ins are rate-limited to 30 per five minutes per IP, so accounts are few
 * and their sessions are reused.
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

// The app's own grading, so a scoring bug shows up rather than being masked.
copyFileSync("src/lib/grading.ts", "g.tmp.ts");
writeFileSync("g.tmp.ts", readFileSync("g.tmp.ts", "utf8").replace('import "server-only";', ""));
try {
  execFileSync("npx", ["tsc", "g.tmp.ts", "--target", "es2022", "--module", "esnext",
    "--skipLibCheck", "--typeRoots", "./no-types"], { stdio: "pipe", shell: true });
} catch {}
if (!existsSync("g.tmp.js")) { console.log("could not compile grading.ts"); process.exit(1); }
renameSync("g.tmp.js", "g.tmp.mjs");
const { isCorrect, scorePercentage } = await import(pathToFileURL(path.resolve("g.tmp.mjs")).href);

const S = Date.now();
const made = { users: [], exams: [], sections: [], subjects: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (area, l, d = "") => {
  checks++; bugs.push({ area, l, d });
  console.log(`  BUG  ${l}${d ? " — " + d : ""}`);
};
const t = (cond, area, l, d = "") => (cond ? ok(l, d) : bug(area, l, d));
const section = (n) => console.log(`\n== ${n} ==`);

const settings = (patch) => svc.from("system_settings").update(patch).eq("id", true);
const { data: before } = await svc.from("system_settings")
  .select("classes_enabled, allow_class_self_join, allowed_email_domains, pass_threshold").eq("id", true).single();

async function user(tag, role) {
  const email = `qa-${tag}-${S}@example.com`, pw = `Qa!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`create ${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({
    role, status: "ACTIVE", full_name: `QA ${tag}`,
  }).eq("id", data.user.id);
  const c = anon();
  const { error: e } = await c.auth.signInWithPassword({ email, password: pw });
  if (e) throw new Error(`sign in ${tag}: ${e.message}`);
  return { id: data.user.id, email, pw, client: c };
}

try {
  await settings({ classes_enabled: true, allow_class_self_join: true, allowed_email_domains: "", pass_threshold: 75 });

  const admin = await user("admin", "ADMIN");
  const teacher = await user("teacher", "INSTRUCTOR");
  const other = await user("other", "INSTRUCTOR");
  const alice = await user("alice", "STUDENT");
  const bob = await user("bob", "STUDENT");

  // ---------------------------------------------------------------- classes
  section("Classes and enrolment");

  const { data: cls, error: clsErr } = await admin.client.from("sections")
    .insert({ subject: `QA Subject ${S}`, name: `QA-4C-${S}` }).select("id, join_code").single();
  t(!clsErr && cls, "classes", "an admin creates a class with no teacher", clsErr?.message);
  if (cls) made.sections.push(cls.id);

  const { error: assignErr } = await admin.client.from("sections")
    .update({ instructor_id: teacher.id }).eq("id", cls.id);
  t(!assignErr, "classes", "and staffs it afterwards", assignErr?.message);

  const { error: joinErr } = await alice.client.rpc("join_class", { code: cls.join_code });
  t(!joinErr, "classes", "a student joins by code", joinErr?.message);

  const { error: badCode } = await alice.client.rpc("join_class", { code: "NOPE99" });
  t(Boolean(badCode), "classes", "a wrong code is refused");

  await settings({ allow_class_self_join: false });
  const { error: closedJoin } = await bob.client.rpc("join_class", { code: cls.join_code });
  t(Boolean(closedJoin), "classes", "with self-join off, a code is refused", closedJoin?.message?.slice(0, 40));
  await settings({ allow_class_self_join: true });

  // ---------------------------------------------------------------- subjects
  section("Subjects");
  const { data: subj, error: subjErr } = await teacher.client
    .from("subjects").insert({ name: `QA Physics ${S}` }).select("id, name").single();
  t(!subjErr && subj, "subjects", "a teacher adds a subject", subjErr?.message);
  if (subj) made.subjects.push(subj.id);

  const { error: dupSubj } = await teacher.client.from("subjects").insert({ name: `qa physics ${S}` });
  t(Boolean(dupSubj), "subjects", "a rival spelling is refused");

  const { error: studentSubj } = await alice.client.from("subjects").insert({ name: `QA Sneak ${S}` });
  t(Boolean(studentSubj), "subjects", "a student cannot add a subject");

  // ---------------------------------------------------------------- exams
  section("Building and publishing");

  const { data: exam, error: examErr } = await teacher.client.from("exams").insert({
    title: `QA Midterm ${S}`, section_id: cls.id, created_by_id: teacher.id,
    subject_id: subj?.id ?? null, status: "DRAFT",
    timer_config: { totalMinutes: 30, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id, share_token").single();
  t(!examErr && exam, "exams", "a teacher creates an exam", examErr?.message);
  if (exam) made.exams.push(exam.id);
  t(Boolean(exam?.share_token) && /^[A-Za-z0-9_-]+$/.test(exam.share_token || ""),
    "exams", "it gets a URL-safe share token", exam?.share_token);

  await teacher.client.from("exam_sections").insert({ exam_id: exam.id, section_id: cls.id });

  const qs = [];
  for (let i = 1; i <= 4; i++) {
    const mc = i <= 2;
    const { data: q, error: qErr } = await teacher.client.from("questions").insert({
      exam_id: exam.id, type: mc ? "MULTIPLE_CHOICE" : "IDENTIFICATION",
      prompt: `QA Q${i}?`, choices: mc ? [`A${i}`, `B${i}`] : null, order: i,
    }).select("id, type").single();
    if (qErr) { bug("exams", `question ${i} could not be added`, qErr.message); break; }
    const answer = mc ? `B${i}` : [`term${i}`];
    await teacher.client.from("question_answers").insert({ question_id: q.id, correct_answer: answer });
    qs.push({ ...q, answer });
  }
  t(qs.length === 4, "exams", "questions and answer keys are written", `${qs.length}/4`);

  const { data: peek } = await alice.client.from("question_answers").select("question_id");
  t((peek ?? []).length === 0, "security", "a student cannot read the answer key", `${(peek ?? []).length} rows`);

  const { data: draftSeen } = await alice.client.from("exams").select("id").eq("id", exam.id);
  t((draftSeen ?? []).length === 0, "exams", "a draft is invisible to students");

  await teacher.client.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);

  const { error: unpublish } = await teacher.client.from("exams").update({ status: "DRAFT" }).eq("id", exam.id);
  t(Boolean(unpublish), "exams", "a published exam cannot return to draft");

  const { error: editQ } = await teacher.client.from("questions")
    .update({ prompt: "changed after publishing" }).eq("id", qs[0].id);
  t(Boolean(editQ), "exams", "published questions are frozen");

  // ---------------------------------------------------------------- window
  section("Availability window");

  const soon = (m) => new Date(Date.now() + m * 60000).toISOString();
  const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

  await svc.from("exams").update({ opens_at: soon(60), closes_at: null }).eq("id", exam.id);
  const { error: earlyStart } = await alice.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: alice.id });
  t(Boolean(earlyStart), "window", "an exam cannot be started before it opens");

  await svc.from("exams").update({ opens_at: ago(120), closes_at: ago(60) }).eq("id", exam.id);
  const { error: lateStart } = await alice.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: alice.id });
  t(Boolean(lateStart), "window", "nor after it closes");

  await svc.from("exams").update({ opens_at: null, closes_at: null }).eq("id", exam.id);
  const { error: closeErr } = await teacher.client.rpc("close_exam", { exam_uuid: exam.id });
  t(!closeErr, "window", "the owning teacher can close it", closeErr?.message);
  const { error: shutStart } = await alice.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: alice.id });
  t(Boolean(shutStart), "window", "and it is genuinely shut");

  const { error: otherClose } = await other.client.rpc("close_exam", { exam_uuid: exam.id });
  t(Boolean(otherClose), "security", "another teacher cannot close it");

  await teacher.client.rpc("open_exam", { exam_uuid: exam.id });

  // ---------------------------------------------------------------- roster
  section("Roster and share link");

  const { error: rosterErr } = await teacher.client.from("exam_access")
    .upsert({ exam_id: exam.id, student_id: bob.id }, { onConflict: "exam_id,student_id" });
  t(!rosterErr, "roster", "a teacher assigns a student directly", rosterErr?.message);

  const { data: bobSees } = await bob.client.from("exams").select("id").eq("id", exam.id);
  t((bobSees ?? []).length === 1, "roster", "the assigned student can see it");

  const { error: selfGrant } = await bob.client.from("exam_access")
    .insert({ exam_id: exam.id, student_id: alice.id });
  t(Boolean(selfGrant), "security", "a student cannot grant access to anyone");

  // ---------------------------------------------------------------- sitting
  section("Sitting the exam");

  const { data: sess, error: sessErr } = await alice.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: alice.id }).select("id").single();
  t(!sessErr && sess, "sitting", "a student starts the exam", sessErr?.message);

  const { error: resit } = await alice.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: alice.id });
  t(Boolean(resit), "sitting", "a second sitting is refused");

  for (const [i, q] of qs.entries()) {
    const right = i < 3;
    const response = q.type === "MULTIPLE_CHOICE"
      ? (right ? q.answer : q.answer.replace("B", "A"))
      : (right ? q.answer[0] : "wrong");
    const { error } = await alice.client.from("answers")
      .insert({ session_id: sess.id, question_id: q.id, response });
    if (error) { bug("sitting", `answer ${i + 1} rejected`, error.message); break; }
  }

  const { data: bobPeek } = await bob.client.from("answers").select("session_id");
  t((bobPeek ?? []).length === 0, "security", "a student cannot read another's answers");

  const { error: flagErr } = await alice.client.from("flags")
    .insert({ session_id: sess.id, type: "TAB_SWITCH", strike_number: 1, question_id: qs[0].id });
  t(!flagErr, "sitting", "a flag is recorded", flagErr?.message);

  const { count: beforeDel } = await svc.from("flags").select("*", { count: "exact", head: true }).eq("session_id", sess.id);
  await alice.client.from("flags").delete().eq("session_id", sess.id);
  const { count: afterDel } = await svc.from("flags").select("*", { count: "exact", head: true }).eq("session_id", sess.id);
  t(beforeDel === afterDel, "security", "a student cannot delete their own flags", `${beforeDel} -> ${afterDel}`);

  // Grading, with the app's own maths.
  const { data: given } = await svc.from("answers").select("question_id, response").eq("session_id", sess.id);
  let correct = 0;
  for (const q of qs) {
    const a = (given ?? []).find((x) => x.question_id === q.id);
    if (isCorrect(q.type, a?.response, q.answer)) correct++;
  }
  const score = scorePercentage(correct, qs.length);
  t(score === 75, "grading", "three of four scores 75%", `${score}%`);
  await svc.from("exam_sessions").update({
    status: "SUBMITTED", score, submitted_at: new Date().toISOString(),
  }).eq("id", sess.id);

  const { error: lateAnswer } = await alice.client.from("answers")
    .insert({ session_id: sess.id, question_id: qs[0].id, response: "after submitting" });
  t(Boolean(lateAnswer), "sitting", "answers are refused after submitting");

  // ---------------------------------------------------------------- results
  section("Results a student sees");

  const { data: mine, error: mineErr } = await alice.client.rpc("my_exams");
  const row = (mine ?? []).find((r) => r.exam_id === exam.id);
  t(!mineErr && row, "results", "their own result comes back", mineErr?.message);
  t(row?.score === 75, "results", "with the right score", String(row?.score));
  t(row?.passed === true, "results", "75% against a 75% pass mark passes", `passed=${row?.passed}`);
  t(row?.teacher === "QA teacher", "results", "and the teacher's name", row?.teacher);
  t(row?.subject === `QA Physics ${S}`, "results", "and the subject", row?.subject ?? "(none)");

  const { data: bobMine } = await bob.client.rpc("my_exams");
  const bobRow = (bobMine ?? []).find((r) => r.exam_id === exam.id);
  t(bobRow && bobRow.score === null, "results", "another student sees no score of hers",
    `score=${bobRow?.score}`);

  // Pass mark is a setting, so the verdict must follow it.
  await settings({ pass_threshold: 90 });
  const { data: strict } = await alice.client.rpc("my_exams");
  const strictRow = (strict ?? []).find((r) => r.exam_id === exam.id);
  t(strictRow?.passed === false, "results", "raising the pass mark flips the verdict",
    `passed=${strictRow?.passed} at ${strictRow?.pass_mark}%`);
  await settings({ pass_threshold: 75 });

  // ---------------------------------------------------------------- teacher
  section("What the teacher sees");

  const { data: tSessions } = await teacher.client.from("exam_sessions").select("id").eq("exam_id", exam.id);
  t((tSessions ?? []).length === 1, "monitor", "the sitting appears for the teacher", `${(tSessions ?? []).length}`);

  const { data: oSessions } = await other.client.from("exam_sessions").select("id").eq("exam_id", exam.id);
  t((oSessions ?? []).length === 0, "security", "and not for another teacher");

  const { data: names } = await teacher.client.from("users").select("id, full_name").eq("id", alice.id);
  t((names ?? [])[0]?.full_name === "QA alice", "monitor", "the student's name is readable", (names ?? [])[0]?.full_name);

  const { data: voided, error: voidErr } = await teacher.client.from("flags")
    .update({ resolution: "VOIDED", resolved_by_id: teacher.id })
    .eq("session_id", sess.id).is("resolution", null).select("id");
  t(!voidErr && (voided ?? []).length > 0, "monitor", "flags can be voided in bulk",
    `${(voided ?? []).length} voided${voidErr ? ": " + voidErr.message : ""}`);

  // ---------------------------------------------------------------- admin
  section("Admin-only ground");

  const { data: keys } = await teacher.client.from("ai_provider_keys").select("id");
  t((keys ?? []).length === 0, "security", "a teacher cannot read provider keys");

  const { data: audit } = await teacher.client.from("audit_log").select("id").limit(3);
  t((audit ?? []).length === 0, "security", "a teacher cannot read the audit log");

  const { data: setWrite } = await teacher.client.from("system_settings")
    .update({ pass_threshold: 1 }).eq("id", true).select("id");
  t(!setWrite?.length, "security", "a teacher cannot change settings", `${setWrite?.length ?? 0} rows`);

  const { error: promote } = await alice.client.from("users").update({ role: "ADMIN" }).eq("id", alice.id);
  t(Boolean(promote), "security", "a student cannot promote themselves");

  const { data: adminAll } = await admin.client.from("users").select("id");
  t((adminAll ?? []).length >= 5, "admin", "an admin reads every account", `${(adminAll ?? []).length}`);

  // ---------------------------------------------------------------- profile
  section("Profile");
  const { error: nameErr } = await alice.client.from("users")
    .update({ full_name: "Alice Renamed", username: `alice${S}`.slice(0, 20) }).eq("id", alice.id);
  t(!nameErr, "profile", "a student sets their own name and username", nameErr?.message);

  const { error: renameOther } = await alice.client.from("users")
    .update({ full_name: "Hacked" }).eq("id", bob.id);
  const { data: bobName } = await svc.from("users").select("full_name").eq("id", bob.id).single();
  t(bobName?.full_name === "QA bob", "security", "and cannot rename anybody else",
    `${bobName?.full_name}${renameOther ? "" : " (no error raised)"}`);

  const { error: badUser } = await alice.client.from("users")
    .update({ username: "not valid!" }).eq("id", alice.id);
  t(Boolean(badUser), "profile", "a malformed username is refused");

  // ---------------------------------------------------------------- classes off
  section("With classes switched off");
  await settings({ classes_enabled: false });

  const { data: offSees } = await bob.client.from("exams").select("id").eq("id", exam.id);
  t((offSees ?? []).length === 1, "settings", "someone on the roster still sees it");

  const stranger = await user("stranger", "STUDENT");
  const { data: strangerSees } = await stranger.client.from("exams").select("id").eq("id", exam.id);
  t((strangerSees ?? []).length === 0, "settings",
    "someone with no link and no roster place sees nothing", `${(strangerSees ?? []).length}`);

  await settings({ classes_enabled: before.classes_enabled });
} catch (e) {
  bug("harness", "the sweep stopped early", e.message);
} finally {
  await settings({
    classes_enabled: before.classes_enabled,
    allow_class_self_join: before.allow_class_self_join,
    allowed_email_domains: before.allowed_email_domains,
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
  for (const id of made.subjects) await svc.from("subjects").delete().eq("id", id);
  for (const id of made.users) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.from("generation_progress").delete().eq("owner_id", id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }

  unlinkSync("g.tmp.ts"); unlinkSync("g.tmp.mjs");

  console.log(`\n${checks} checks, ${bugs.length} finding(s).`);
  if (bugs.length) {
    console.log("\nFindings:");
    for (const b of bugs) console.log(`  [${b.area}] ${b.l}${b.d ? " — " + b.d : ""}`);
  }
  process.exit(0);
}
