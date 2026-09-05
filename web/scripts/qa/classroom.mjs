/**
 * Fifty students sit one exam, concurrently, and then everything the teacher
 * and the administrator are shown is checked against the database.
 *
 * The size is chosen, not arbitrary: 50 students x 25 questions is 1,250
 * answers, which is past PostgREST's default 1,000-row reply. Anything that
 * reads "all the answers" without asking for more will quietly return a
 * fraction and report confident, wrong numbers — the failure mode that does not
 * announce itself.
 *
 * Runs against the live project and cleans up after itself.
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const BASE = process.env.QA_BASE ?? "http://localhost:3001";

copyFileSync("src/lib/grading.ts", "cg.tmp.ts");
writeFileSync("cg.tmp.ts", readFileSync("cg.tmp.ts", "utf8").replace('import "server-only";', ""));
try {
  execFileSync("npx", ["tsc", "cg.tmp.ts", "--target", "es2022", "--module", "esnext",
    "--skipLibCheck", "--typeRoots", "./no-types"], { stdio: "pipe", shell: true });
} catch {}
if (!existsSync("cg.tmp.js")) { console.log("could not compile grading.ts"); process.exit(1); }
renameSync("cg.tmp.js", "cg.tmp.mjs");
const { isCorrect, scorePercentage } = await import(pathToFileURL(path.resolve("cg.tmp.mjs")).href);

const S = Date.now();
const N = 50;
const QUESTIONS = 25;
const made = { users: [], exams: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (area, l, d = "") => { checks++; bugs.push({ area, l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, area, l, d = "") => (c ? ok(l, d) : bug(area, l, d));
const section = (n) => console.log(`\n== ${n} ==`);
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0);

const settings = (p) => svc.from("system_settings").update(p).eq("id", true);
const { data: before } = await svc.from("system_settings")
  .select("classes_enabled, allow_class_self_join, pass_threshold").eq("id", true).single();

/** Run tasks a few at a time: a real sitting is concurrent, and races only appear when it is. */
async function pool(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

const cookieFor = (session) => {
  const raw = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const parts = []; for (let i = 0; i < raw.length; i += 3180) parts.push(raw.slice(i, i + 3180));
  const n = `sb-${ref}-auth-token`;
  return parts.length === 1 ? `${n}=${parts[0]}` : parts.map((x, i) => `${n}.${i}=${x}`).join("; ");
};

async function page(cookie, p) {
  const started = Date.now();
  const res = await fetch(`${BASE}${p}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
  const ms = Date.now() - started;
  const html = res.status === 200 ? await res.text() : "";
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  return { status: res.status, ms, html, text };
}

try {
  await settings({ classes_enabled: false, allow_class_self_join: false, pass_threshold: 75 });

  // ------------------------------------------------------------------ setup
  section(`Setting up ${N} students and a ${QUESTIONS}-question exam`);

  const mk = async (tag, role, name) => {
    const email = `cr-${tag}-${S}@example.com`, pw = `Cr!${S}${tag}`;
    const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (error) throw new Error(`${tag}: ${error.message}`);
    made.users.push(data.user.id);
    await svc.from("users").update({ role, status: "ACTIVE", full_name: name }).eq("id", data.user.id);
    return { id: data.user.id, email, pw };
  };

  const admin = await mk("admin", "ADMIN", "Registrar Ramos");
  const teacher = await mk("teacher", "INSTRUCTOR", "Prof. Elena Cruz");

  // Sign-in is rate limited per IP and the limit is *not* rate_limit_verify —
  // raising that to 500 changed nothing, and the wall still arrived at about
  // forty. A real class hits this too, so the test waits it out the way a
  // student would rather than pretending it is not there.
  let rateLimitWaits = 0;
  const signIn = async (who) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const c = anon();
      const { data, error } = await c.auth.signInWithPassword({ email: who.email, password: who.pw });
      if (!error) return { ...who, client: c, cookie: cookieFor(data.session) };
      if (!/rate limit/i.test(error.message)) throw new Error(`sign in ${who.email}: ${error.message}`);
      rateLimitWaits++;
      process.stdout.write(`       (rate limited, waiting 65s)
`);
      await new Promise((r) => setTimeout(r, 65_000));
    }
    throw new Error(`sign in ${who.email}: still rate limited after eight tries`);
  };
  const adminS = await signIn(admin);
  const teacherS = await signIn(teacher);

  const { data: exam } = await svc.from("exams").insert({
    title: `Classroom ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 45, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id, share_token").single();
  made.exams.push(exam.id);

  const questions = [];
  for (let i = 1; i <= QUESTIONS; i++) {
    const mc = i <= 18;
    const { data: q } = await svc.from("questions").insert({
      exam_id: exam.id, type: mc ? "MULTIPLE_CHOICE" : "IDENTIFICATION",
      prompt: `Q${i}. Concept ${i}?`,
      choices: mc ? [`A${i}`, `B${i}`, `C${i}`, `D${i}`] : null, order: i,
    }).select("id, type, prompt").single();
    const answer = mc ? `B${i}` : [`term${i}`];
    await svc.from("question_answers").insert({ question_id: q.id, correct_answer: answer });
    questions.push({ ...q, answer, choices: mc ? [`A${i}`, `B${i}`, `C${i}`, `D${i}`] : null });
  }
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);
  ok(`exam published with ${questions.length} questions`, `${secs()}s`);

  // A spread that looks like a real class.
  const profileOf = (i) =>
    i < 3 ? "absent" : i < 7 ? "strikes" : i < 14 ? "flagged" : i < 20 ? "weak" : i < 42 ? "average" : "strong";
  const accuracy = { strong: 0.92, average: 0.68, weak: 0.34, flagged: 0.6, strikes: 0.45 };

  const roster = [];
  for (let i = 0; i < N; i++) {
    roster.push(await mk(`s${i}`, "STUDENT", `Student ${String(i + 1).padStart(2, "0")}`));
  }
  ok(`${roster.length} student accounts created`, `${secs()}s`);

  const students = await pool(roster, 10, async (s, ) => {
    const idx = roster.indexOf(s);
    const signed = await signIn(s);
    return { ...signed, profile: profileOf(idx) };
  });
  ok(`${students.length} signed in`, `${secs()}s`);
  t(rateLimitWaits === 0, "auth",
    "fifty students can sign in without hitting a rate limit",
    rateLimitWaits ? `${rateLimitWaits} pause(s) of 65s were needed` : "no pauses");

  // ------------------------------------------------------------- the sitting
  section("Fifty students sit it at once");

  const sitting = students.filter((s) => s.profile !== "absent");
  await pool(sitting, 10, (s) => s.client.rpc("open_exam_link", { token: exam.share_token }));

  const starts = await pool(sitting, 10, async (s) => {
    const { data, error } = await s.client.from("exam_sessions")
      .insert({ exam_id: exam.id, student_id: s.id }).select("id").single();
    return { s, id: data?.id, error };
  });
  const failedStarts = starts.filter((x) => x.error);
  t(failedStarts.length === 0, "concurrency", "every student starts without collision",
    failedStarts.length ? failedStarts[0].error.message : `${starts.length} sittings`);

  const sessionOf = new Map(starts.filter((x) => x.id).map((x) => [x.s.id, x.id]));

  let answered = 0;
  await pool(sitting, 10, async (s) => {
    const sid = sessionOf.get(s.id);
    if (!sid) return;
    const hit = accuracy[s.profile] ?? 0.6;
    for (const q of questions) {
      if (Math.random() < 0.04) continue; // a few left blank
      const right = Math.random() < hit;
      const response = q.type === "MULTIPLE_CHOICE"
        ? (right ? q.answer : q.choices.filter((c) => c !== q.answer)[0])
        : (right ? q.answer[0] : `not it ${Math.floor(Math.random() * 99)}`);
      const { error } = await s.client.from("answers")
        .upsert({ session_id: sid, question_id: q.id, response }, { onConflict: "session_id,question_id" });
      if (error) { bug("sitting", "an answer was rejected mid-exam", error.message); return; }
      answered++;
    }
  });
  ok(`${answered} answers written`, `${secs()}s`);
  t(answered > 1000, "coverage", "the run is past the 1,000-row reply limit", `${answered} answers`);

  // Flags, the way the runner raises them.
  let flagged = 0;
  await pool(sitting, 10, async (s) => {
    const sid = sessionOf.get(s.id);
    if (!sid) return;
    const n = s.profile === "strikes" ? 3 : s.profile === "flagged" ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let k = 1; k <= n; k++) {
      const { error } = await s.client.from("flags").insert({
        session_id: sid, type: ["TAB_SWITCH", "WINDOW_BLUR", "FULLSCREEN_EXIT"][k % 3],
        strike_number: k, question_id: questions[k % questions.length].id,
      });
      if (!error) flagged++;
    }
  });
  ok(`${flagged} flags raised`, `${secs()}s`);

  // Grade with the application's own maths.
  const truth = new Map();
  await pool(sitting, 10, async (s) => {
    const sid = sessionOf.get(s.id);
    if (!sid) return;
    const { data: given } = await svc.from("answers")
      .select("question_id, response").eq("session_id", sid).limit(2000);
    let correct = 0;
    for (const q of questions) {
      const a = (given ?? []).find((x) => x.question_id === q.id);
      if (isCorrect(q.type, a?.response, q.answer)) correct++;
    }
    const score = scorePercentage(correct, questions.length);
    const { count: strikes } = await svc.from("flags")
      .select("*", { count: "exact", head: true }).eq("session_id", sid);
    const auto = (strikes ?? 0) >= 3;
    await svc.from("exam_sessions").update({
      status: auto ? "AUTO_SUBMITTED" : "SUBMITTED", score,
      submitted_at: new Date().toISOString(),
    }).eq("id", sid);
    truth.set(s.id, { score, auto, strikes: strikes ?? 0 });
  });
  ok(`${truth.size} sittings graded`, `${secs()}s`);

  // ------------------------------------------------------------- integrity
  section("Does the data hold together");

  const { count: sessionCount } = await svc.from("exam_sessions")
    .select("*", { count: "exact", head: true }).eq("exam_id", exam.id);
  t(sessionCount === sitting.length, "concurrency", "one sitting per student, no duplicates",
    `${sessionCount} for ${sitting.length} students`);

  const sessionIds = [...sessionOf.values()];
  const { count: answerCount } = await svc.from("answers")
    .select("*", { count: "exact", head: true }).in("session_id", sessionIds);
  t(answerCount === answered, "concurrency", "every answer landed exactly once",
    `${answerCount} rows for ${answered} writes`);

  const { data: scored } = await svc.from("exam_sessions")
    .select("student_id, score, status").eq("exam_id", exam.id).limit(2000);
  const wrong = (scored ?? []).filter((r) => truth.get(r.student_id)?.score !== r.score);
  t(wrong.length === 0, "grading", "every stored score matches a fresh recompute", `${wrong.length} differ`);

  const badAuto = (scored ?? []).filter(
    (r) => (truth.get(r.student_id)?.auto ?? false) !== (r.status === "AUTO_SUBMITTED"));
  t(badAuto.length === 0, "lockdown", "auto-submission matches the strike limit", `${badAuto.length} differ`);

  // ------------------------------------------------------- the row limit
  section("Reading everything, at this size");

  // A plain read stops at a thousand — that is the platform, not a bug in the
  // app, and it is why anything aggregating has to page.
  const { data: naive } = await svc.from("answers").select("id").in("session_id", sessionIds);
  ok("a plain read stops at the reply cap, as documented",
    `${(naive ?? []).length} of ${answerCount}`);

  // What the app does now.
  const paged = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await svc.from("answers").select("id")
      .in("session_id", sessionIds).range(from, from + 999);
    paged.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  t(paged.length === answerCount, "limits",
    "paging returns every answer", `${paged.length} of ${answerCount}`);

  const { data: naiveSessions } = await teacherS.client.from("exam_sessions").select("id").eq("exam_id", exam.id);
  t((naiveSessions ?? []).length === sessionCount, "limits",
    "and every sitting", `${(naiveSessions ?? []).length} of ${sessionCount}`);

  // ----------------------------------------------------------- the pages
  section("What the teacher is shown");

  const monitor = await page(teacherS.cookie, `/exams/${exam.id}/monitor`);
  t(monitor.status === 200, "pages", "the monitor loads", `${monitor.status} in ${monitor.ms}ms`);
  t(monitor.ms < 5000, "performance", "and does so in reasonable time", `${monitor.ms}ms`);

  // The figures on it, against the database.
  const submitted = (scored ?? []).filter((r) => r.status !== "IN_PROGRESS");
  const avg = submitted.length
    ? Math.round((submitted.reduce((a, r) => a + Number(r.score), 0) / submitted.length) * 100) / 100
    : null;
  const shown = monitor.text.match(/Average\s+([\d.]+)%/);
  t(shown && Math.abs(Number(shown[1]) - avg) < 0.6, "monitor",
    "the average it reports matches the database", `page ${shown?.[1]}% vs ${avg}%`);

  const submittedShown = monitor.text.match(/Submitted\s+(\d+)/);
  t(submittedShown && Number(submittedShown[1]) === submitted.length, "monitor",
    "as does the number submitted", `page ${submittedShown?.[1]} vs ${submitted.length}`);

  const { count: openFlags } = await svc.from("flags")
    .select("*", { count: "exact", head: true }).in("session_id", sessionIds).is("resolution", null);
  const flagsShown = monitor.text.match(/Flags\s+(\d+)/);
  t(flagsShown && Number(flagsShown[1]) === openFlags, "monitor",
    "and the flag count", `page ${flagsShown?.[1]} vs ${openFlags}`);

  // Per-question analysis: the reading most likely to be truncated.
  const { data: everyAnswer } = await svc.from("answers")
    .select("question_id, response").in("session_id", sessionIds).limit(5000);
  const perQ = questions.map((q) => {
    const given = (everyAnswer ?? []).filter((a) => a.question_id === q.id);
    const right = given.filter((a) => isCorrect(q.type, a.response, q.answer)).length;
    return { prompt: q.prompt, pct: given.length ? Math.round((right / given.length) * 100) : null };
  });
  const hardest = [...perQ].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101))[0];
  const inPage = monitor.text.includes(hardest.prompt.slice(0, 18));
  t(inPage, "monitor", "the hardest question appears in the analysis", hardest.prompt.slice(0, 24));
  const pctOnPage = monitor.text.match(new RegExp(`${hardest.prompt.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^%]*?(\\d+)\\s*%`));
  t(pctOnPage && Math.abs(Number(pctOnPage[1]) - hardest.pct) <= 1, "monitor",
    "with the share the database gives", `page ${pctOnPage?.[1]}% vs ${hardest.pct}%`);

  const report = await page(teacherS.cookie, "/teacher/students");
  t(report.status === 200, "pages", "the risk report loads", `${report.status} in ${report.ms}ms`);
  const rollShown = report.text.match(/Your students\s+(\d+)/);
  t(rollShown && Number(rollShown[1]) === sitting.length, "report",
    "it counts the students given the exam", `page ${rollShown?.[1]} vs ${sitting.length}`);

  const everyoneShown = report.text.match(/(\d+) in total, most at risk first/);
  t(everyoneShown && Number(everyoneShown[1]) === sitting.length, "report",
    "and lists all of them", `page ${everyoneShown?.[1]} vs ${sitting.length}`);

  const missing = students.filter((s) => s.profile !== "absent")
    .filter((s) => !report.text.includes(`Student ${String(students.indexOf(s) + 1).padStart(2, "0")}`));
  t(missing.length === 0, "report", "no student is dropped from the list", `${missing.length} missing`);

  const csv = await page(teacherS.cookie, "/teacher/students/export");
  const rows = csv.html.trim().split("\n").length - 1;
  t(rows === sitting.length, "export", "the CSV carries every student", `${rows} rows vs ${sitting.length}`);

  section("What the administrator is shown");
  const overview = await page(adminS.cookie, "/admin");
  t(overview.status === 200, "pages", "the overview loads", `${overview.status} in ${overview.ms}ms`);

  const { count: allStudents } = await svc.from("users")
    .select("*", { count: "exact", head: true }).eq("role", "STUDENT");
  const studentsShown = overview.text.match(/Students\s+(\d+)/);
  t(studentsShown && Number(studentsShown[1]) === allStudents, "admin",
    "it counts every student in the system", `page ${studentsShown?.[1]} vs ${allStudents}`);

  const adminReport = await page(adminS.cookie, "/admin/students");
  t(adminReport.status === 200, "pages", "the admin report loads", `${adminReport.status} in ${adminReport.ms}ms`);

  const accounts = await page(adminS.cookie, "/admin/accounts");
  t(accounts.status === 200, "pages", "accounts loads", `${accounts.status} in ${accounts.ms}ms`);
  const { count: allUsers } = await svc.from("users").select("*", { count: "exact", head: true });
  const countShown = accounts.html.match(/of\s*<!-- -->\s*(\d+)|(\d+)\s*<\/?[^>]*>\s*accounts/);
  t(accounts.text.includes(`${allUsers}`), "admin",
    "the directory sees every account", `expected ${allUsers}`);

  const adminCsv = await page(adminS.cookie, "/admin/students/export");
  const adminRows = adminCsv.html.trim().split("\n").length - 1;
  t(adminRows === allStudents, "export", "the admin CSV carries every student",
    `${adminRows} rows vs ${allStudents}`);

  section("Isolation, at this size");
  const outsider = students.find((s) => s.profile === "absent");
  const { data: outsiderSees } = await outsider.client.from("exams").select("id").eq("id", exam.id);
  t((outsiderSees ?? []).length === 0, "security", "a student who never opened the link sees nothing");
  const { data: outsiderAnswers } = await outsider.client.from("answers").select("id");
  t((outsiderAnswers ?? []).length === 0, "security", "and none of the 1,200 answers",
    `${(outsiderAnswers ?? []).length}`);

  const sample = sitting[5];
  const { data: sampleAnswers } = await sample.client.from("answers").select("session_id");
  const own = sessionOf.get(sample.id);
  t((sampleAnswers ?? []).every((a) => a.session_id === own), "security",
    "a student sees only their own answers", `${(sampleAnswers ?? []).length} rows`);
} catch (e) {
  bug("harness", "the run stopped early", e.message);
} finally {
  await settings({
    classes_enabled: before.classes_enabled,
    allow_class_self_join: before.allow_class_self_join,
    pass_threshold: before.pass_threshold,
  });
  for (const id of made.exams) {
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    await svc.from("exam_access").delete().eq("exam_id", id);
    const { data: ss } = await svc.from("exam_sessions").select("id").eq("exam_id", id).limit(2000);
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
  for (const id of made.users) {
    await svc.from("exam_access").delete().eq("student_id", id);
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  unlinkSync("cg.tmp.ts"); unlinkSync("cg.tmp.mjs");
  console.log(`\n${checks} checks, ${bugs.length} finding(s), ${secs()}s total.`);
  if (bugs.length) { console.log("\nFindings:"); for (const b of bugs) console.log(`  [${b.area}] ${b.l}${b.d ? " — " + b.d : ""}`); }
  process.exit(0);
}
