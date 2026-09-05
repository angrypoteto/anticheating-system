/**
 * Third pass: the pages.
 *
 * The bugs this project actually shipped to a user were on this layer — the
 * monitor showing email addresses, a blurb promising a class picker that was
 * switched off, a button that looked stuck. None of those are visible from the
 * database, so this loads every route as each role and looks at what came back.
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Run from web/ whatever directory it was invoked from: these read .env.local
// and compile modules out of src/.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const BASE = process.env.QA_BASE ?? "http://localhost:3001";

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
  const email = `qc-${tag}-${S}@example.com`, pw = `Qc!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: name }).eq("id", data.user.id);
  const c = anon();
  const { data: s, error: e } = await c.auth.signInWithPassword({ email, password: pw });
  if (e) throw new Error(`${tag} sign in: ${e.message}`);
  const raw = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64");
  const parts = []; for (let i = 0; i < raw.length; i += 3180) parts.push(raw.slice(i, i + 3180));
  const n = `sb-${ref}-auth-token`;
  const cookie = parts.length === 1 ? `${n}=${parts[0]}` : parts.map((x, i) => `${n}.${i}=${x}`).join("; ");
  return { id: data.user.id, email, client: c, cookie, name };
}

/** Fetch a page as someone, and hand back its visible text. */
async function page(who, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: who ? { Cookie: who.cookie } : {},
    redirect: "manual",
  });
  const status = res.status;
  const location = res.headers.get("location");
  let text = "";
  let html = "";
  if (status === 200) {
    html = await res.text();
    text = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&mdash;|&#8212;/g, "—").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  }
  return { status, location, text, html };
}

try {
  await settings({ classes_enabled: false, allow_class_self_join: false, pass_threshold: 75 });

  const admin = await user("admin", "ADMIN", "QC Admin");
  const teacher = await user("teacher", "INSTRUCTOR", "Prof. Elena Reyes");
  const alice = await user("alice", "STUDENT", "Juan Dela Cruz");

  // Something for the pages to show.
  const { data: exam } = await svc.from("exams").insert({
    title: `QC Midterm ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 30, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id, share_token").single();
  made.exams.push(exam.id);
  const qids = [];
  for (let i = 1; i <= 3; i++) {
    const { data: q } = await svc.from("questions").insert({
      exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: `QC Q${i}?`,
      choices: [`A${i}`, `B${i}`], order: i,
    }).select("id").single();
    await svc.from("question_answers").insert({ question_id: q.id, correct_answer: `B${i}` });
    qids.push(q.id);
  }
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);
  await alice.client.rpc("open_exam_link", { token: exam.share_token });
  const { data: sess } = await alice.client.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: alice.id }).select("id").single();
  await alice.client.from("answers").upsert(
    { session_id: sess.id, question_id: qids[0], response: "B1" }, { onConflict: "session_id,question_id" });
  await alice.client.from("flags").insert({
    session_id: sess.id, type: "TAB_SWITCH", strike_number: 1, question_id: qids[0] });
  await svc.from("exam_sessions").update({
    status: "SUBMITTED", score: 33.33, submitted_at: new Date().toISOString() }).eq("id", sess.id);

  // --------------------------------------------------------------- routing
  section("Routing and access");
  const anonHome = await page(null, "/");
  t(anonHome.status === 200, "routing", "a visitor gets the landing page", `${anonHome.status}`);

  const anonAdmin = await page(null, "/admin");
  t(anonAdmin.status === 307 && (anonAdmin.location ?? "").startsWith("/login"),
    "routing", "a visitor is sent to sign in", `${anonAdmin.status} ${anonAdmin.location}`);
  t((anonAdmin.location ?? "").includes("next="),
    "routing", "and where they were going is remembered", anonAdmin.location);

  const studentAdmin = await page(alice, "/admin");
  t(studentAdmin.status === 307 && studentAdmin.location === "/",
    "security", "a student is turned away from the admin console", `${studentAdmin.status} ${studentAdmin.location}`);

  const studentTeacher = await page(alice, "/teacher");
  t(studentTeacher.status === 307, "security", "and from the teacher console", `${studentTeacher.status}`);

  const teacherAdmin = await page(teacher, "/admin");
  t(teacherAdmin.status === 307, "security", "a teacher is turned away from the admin console",
    `${teacherAdmin.status} ${teacherAdmin.location}`);

  const teacherHome = await page(teacher, "/");
  t(teacherHome.location === "/teacher", "routing", "a teacher lands on their console", teacherHome.location);

  const adminHome = await page(admin, "/");
  t(adminHome.location === "/admin", "routing", "an admin lands on theirs", adminHome.location);

  // ------------------------------------------------------------ every page
  section("Every page renders");
  const routes = [
    [admin, "/admin"], [admin, "/admin/exams"], [admin, "/admin/exams/new"],
    [admin, "/admin/students"], [admin, "/admin/accounts"], [admin, "/admin/health"],
    [admin, "/admin/keys"], [admin, "/admin/settings"], [admin, "/admin/profile"],
    [admin, "/admin/students/export"],
    [teacher, "/teacher"], [teacher, "/teacher/exams"], [teacher, "/teacher/exams/new"],
    [teacher, "/teacher/students"], [teacher, "/teacher/profile"],
    [teacher, "/teacher/students/export"],
    [teacher, `/exams/${exam.id}`], [teacher, `/exams/${exam.id}/monitor`],
    [teacher, `/exams/${exam.id}/generate`],
    [alice, "/"], [null, "/login"], [null, "/signup"],
  ];
  for (const [who, path] of routes) {
    const r = await page(who, path);
    t(r.status === 200, "pages", `${path}`, `${r.status}${r.location ? " -> " + r.location : ""}`);
  }

  // -------------------------------------------------------- what they show
  section("What the pages actually say");

  const monitor = await page(teacher, `/exams/${exam.id}/monitor`);
  t(monitor.text.includes("Juan Dela Cruz"), "monitor", "the monitor names the student");
  t(!monitor.text.includes(alice.email), "monitor", "and does not fall back to their email address");
  t(monitor.text.includes("How each question went"), "monitor", "per-question analysis is present");

  const examPage = await page(teacher, `/exams/${exam.id}`);
  t(examPage.text.includes("Who it is for"), "roster", "the roster panel is on the exam page");
  t(examPage.text.includes("Availability"), "window", "so is the availability panel");
  t(examPage.text.includes("Send this to your students"), "share", "and the share link");
  // The link lives in an input's value, so it is in the markup, not the text.
  t(examPage.html.includes(exam.share_token), "share", "with the real token in it");

  const report = await page(teacher, "/teacher/students");
  t(report.text.includes("Juan Dela Cruz"), "report", "the risk report names the student");
  t(report.text.includes("Download CSV"), "report", "and offers the CSV");

  const csv = await page(teacher, "/teacher/students/export");
  t(csv.status === 200, "export", "the teacher CSV downloads", `${csv.status}`);

  const student = await page(alice, "/");
  t(student.text.includes("QC Midterm"), "student", "the student sees their exam");
  t(student.text.includes("Prof. Elena Reyes"), "student", "and who set it");
  t(student.text.includes("Failed") || student.text.includes("Passed"),
    "student", "and a verdict on it");

  // Classes are off, so nothing should invite them to join one.
  t(!student.text.includes("Class code"), "settings",
    "with classes off, no class code is asked for");
  t(!student.text.includes("Your subjects"), "settings",
    "and no subjects panel is shown");

  const builder = await page(teacher, "/teacher/exams/new");
  t(!/pick a class to start/i.test(builder.text), "copy",
    "the builder does not promise a class picker that is switched off");
  t(builder.text.includes("Subject"), "subjects", "the builder asks for a subject");

  const signup = await page(null, "/signup");
  t(!signup.text.includes("Class code"), "settings",
    "sign-up asks for no class code when self-join is off");

  const accounts = await page(admin, "/admin/accounts");
  t(!accounts.text.includes("Class codes"), "settings",
    "the classes tabs are hidden when classes are off");
  // Likewise the search box: a placeholder is an attribute.
  t(accounts.html.includes("Search name, username or email"), "accounts",
    "the account search is there");

  // --------------------------------------------------------- classes on
  section("The same pages with classes on");
  await settings({ classes_enabled: true, allow_class_self_join: true });

  const accounts2 = await page(admin, "/admin/accounts");
  t(accounts2.text.includes("Class codes"), "settings", "the classes tabs come back");

  const student2 = await page(alice, "/");
  t(student2.text.includes("Your subjects"), "settings", "the student's subjects panel returns");

  const signup2 = await page(null, "/signup");
  t(signup2.text.includes("Class code"), "settings", "sign-up asks for a class code again");

  const examPage2 = await page(teacher, `/exams/${exam.id}`);
  t(examPage2.status === 200, "pages", "the exam page still renders with classes on", `${examPage2.status}`);
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
  for (const id of made.users) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  writeFileSync("qa3-findings.json", JSON.stringify(bugs, null, 1));
  console.log(`\n${checks} checks, ${bugs.length} finding(s).`);
  if (bugs.length) { console.log("\nFindings:"); for (const b of bugs) console.log(`  [${b.area}] ${b.l}${b.d ? " — " + b.d : ""}`); }
  process.exit(0);
}
