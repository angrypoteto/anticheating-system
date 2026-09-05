/**
 * What a student is actually shown when their paper has ended.
 *
 * "You have already submitted this exam. Score: 0%" was shown for all five
 * endings, so a student stopped for leaving the window could not tell that from
 * having run out of time. This renders the real page for each ending and reads
 * back what it says.
 *
 * Needs the app running (npm start); set QA_BASE if not on :3001.
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
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const BASE = process.env.QA_BASE ?? "http://localhost:3001";

const S = Date.now();
const made = { users: [], exams: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const section = (n) => console.log(`\n== ${n} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cookieFor = (session) => {
  const raw = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const parts = []; for (let i = 0; i < raw.length; i += 3180) parts.push(raw.slice(i, i + 3180));
  const n = `sb-${ref}-auth-token`;
  return parts.length === 1 ? `${n}=${parts[0]}` : parts.map((x, i) => `${n}.${i}=${x}`).join("; ");
};

const mk = async (tag, role) => {
  const email = `en-${tag}-${S}@example.com`, pw = `En!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: `Ended ${tag}` }).eq("id", data.user.id);
  for (let a = 0; a < 8; a++) {
    const c = anon();
    const { data: s, error: e } = await c.auth.signInWithPassword({ email, password: pw });
    if (!e) return { id: data.user.id, client: c, cookie: cookieFor(s.session) };
    if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
    await sleep(65_000);
  }
  throw new Error(`sign in ${tag}: still rate limited`);
};

const text = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
      .replace(/&mdash;|&#8212;/g, "—")
      .replace(/\s+/g, " ").trim();

try {
  section("Cast");
  const teacher = await mk("t", "INSTRUCTOR");
  const student = await mk("s", "STUDENT");
  ok("a teacher and a student signed in");

  const { data: exam, error: exErr } = await svc.from("exams").insert({
    title: `Ended drill ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id").single();
  if (exErr) throw new Error("exam: " + exErr.message);
  made.exams.push(exam.id);
  const { data: q } = await svc.from("questions").insert({
    exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: "Effective range?", choices: ["A", "B"], order: 1,
  }).select("id").single();
  await svc.from("question_answers").insert({ question_id: q.id, correct_answer: "B" });
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);

  const { data: sess } = await svc.from("exam_sessions")
    .select("id").eq("exam_id", exam.id).eq("student_id", student.id).maybeSingle();
  const sessionId = sess?.id ?? (await svc.from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: student.id, status: "IN_PROGRESS" })
    .select("id").single()).data.id;

  const show = async () => {
    const res = await fetch(`${BASE}/exam/${exam.id}`, { headers: { Cookie: student.cookie }, redirect: "manual" });
    if (res.status !== 200) return `HTTP ${res.status}`;
    return text(await res.text());
  };

  const end = async (reason) => {
    await svc.from("exam_sessions").update({
      status: reason === "MANUAL" ? "SUBMITTED" : "AUTO_SUBMITTED",
      submitted_reason: reason, score: 0, submitted_at: new Date().toISOString(),
    }).eq("id", sessionId);
    return show();
  };

  // ------------------------------------------------------------- stopped
  section("Stopped for leaving the window");

  // Three departures, each a burst of the three signals a browser really fires.
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(11_000);
    for (const type of ["WINDOW_BLUR", "TAB_SWITCH", "FULLSCREEN_EXIT"]) {
      await student.client.rpc("record_flag", {
        p_session_id: sessionId, p_type: type, p_question_id: q.id,
      });
    }
  }
  const strikes = await end("STRIKES");
  t(/Submitted after leaving the exam window/.test(strikes),
    "the page says what it was, not just that it happened");
  t(!/You have already submitted this exam/.test(strikes),
    "and no longer says only 'you have already submitted this exam'");
  t(/3 warnings/.test(strikes), "it names the limit that was reached");
  t(/What was recorded/.test(strikes), "it shows the warnings themselves");
  t((strikes.match(/moved to another tab or window/g) ?? []).length === 3,
    "one line per departure — nine signals, three lines",
    `${(strikes.match(/moved to another tab or window/g) ?? []).length} lines`);
  t(/can see each warning and can set them aside/.test(strikes),
    "and tells them what to do if it was wrong");

  // ---------------------------------------------------------------- time
  section("The other endings");

  const timeUp = await end("TIME_UP");
  t(/Time ran out/.test(timeUp), "running out of time reads as running out of time");
  t(!/leaving the exam window/.test(timeUp), "and does not accuse them of anything");
  t(!/What was recorded/.test(timeUp), "no warning list where there is nothing to answer");

  const closed = await end("EXAM_CLOSED");
  t(/The exam closed while you were working/.test(closed), "an exam closing underneath them says so");

  const forced = await end("INSTRUCTOR");
  t(/Your teacher ended this sitting/.test(forced), "a teacher's force-submit is attributed to them");

  const manual = await end("MANUAL");
  t(/You submitted this exam/.test(manual), "and their own submit is plainly their own");
  t(/Score/.test(manual), "the score is still shown throughout");
  // ------------------------------------------------------------- letting back in
  section("Letting a student back in");

  // What "Let them back in" does on the monitor: void the standing warnings,
  // reopen the sitting, restart the clock. Answers are deliberately kept.
  await svc.from("flags").update({ resolution: "VOIDED", resolved_by_id: teacher.id })
    .eq("session_id", sessionId).is("resolution", null);
  await svc.from("exam_sessions").update({
    status: "IN_PROGRESS", score: null, submitted_at: null, submitted_reason: null,
    started_at: new Date().toISOString(),
  }).eq("id", sessionId);

  const back = await show();
  t(/Before you begin/.test(back), "the student gets the paper back, not the ending screen");

  const { data: after } = await student.client.rpc("my_strikes", { p_session_id: sessionId });
  t(after === 0, "with a clean sheet — the old warnings cannot end it again", `strikes: ${after}`);
  t(/3 warnings end the attempt/.test(back), "and the rules restated before they start");

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
    for (const x of qq ?? []) await svc.from("question_answers").delete().eq("question_id", x.id);
    await svc.from("questions").delete().eq("exam_id", id);
    await svc.from("exams").delete().eq("id", id);
  }
  for (const id of made.users) await svc.auth.admin.deleteUser(id).catch(() => {});
  ok("test data removed");

  console.log(`\n${checks} checks, ${bugs.length} failing`);
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(bugs.length ? 1 : 0);
}
