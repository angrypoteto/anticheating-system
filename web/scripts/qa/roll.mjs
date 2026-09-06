/**
 * Narrowing a monitor's roll down to one class.
 *
 * A teacher with two sections sitting the same paper had one undifferentiated
 * list. This builds exactly that — two classes, plus somebody who arrived by the
 * share link and is in neither — and reads back what the monitor renders.
 *
 * Restores the class settings it changes. Needs the app running (npm start);
 * set QA_BASE if not on :3001.
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
const made = { users: [], sections: [], exams: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const sec = (n) => console.log(`\n== ${n} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cookieFor = (x) => {
  const raw = "base64-" + Buffer.from(JSON.stringify(x)).toString("base64");
  const parts = []; for (let i = 0; i < raw.length; i += 3180) parts.push(raw.slice(i, i + 3180));
  const n = `sb-${ref}-auth-token`;
  return parts.length === 1 ? `${n}=${parts[0]}` : parts.map((v, i) => `${n}.${i}=${v}`).join("; ");
};

const mk = async (tag, role, name) => {
  const email = `rl-${tag}-${S}@example.com`, pw = `Rl!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: name }).eq("id", data.user.id);
  for (let a = 0; a < 8; a++) {
    const c = anon();
    const { data: x, error: e } = await c.auth.signInWithPassword({ email, password: pw });
    if (!e) return { id: data.user.id, client: c, cookie: cookieFor(x.session), name };
    if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
    await sleep(65_000);
  }
  throw new Error(`sign in ${tag}: still rate limited`);
};

const settings = (patch) => svc.from("system_settings").update(patch).eq("id", true);
const { data: before } = await svc.from("system_settings")
  .select("classes_enabled, allow_class_self_join").eq("id", true).single();

try {
  sec("A teacher with two classes");
  await settings({ classes_enabled: true, allow_class_self_join: true });

  const teacher = await mk("t", "INSTRUCTOR", "Roll Teacher");
  const a = await mk("a", "STUDENT", "Ana In4A");
  const b = await mk("b", "STUDENT", "Ben In4B");
  const c = await mk("c", "STUDENT", "Cy NoClass");

  const mkSection = async (name) => {
    const { data } = await svc.from("sections")
      .insert({ name, subject: `Roll ${S}`, instructor_id: teacher.id })
      .select("id, join_code").single();
    made.sections.push(data.id);
    return data;
  };
  const s4a = await mkSection(`BSIT 4A ${S}`);
  const s4b = await mkSection(`BSIT 4B ${S}`);
  await svc.from("enrollments").insert([
    { student_id: a.id, section_id: s4a.id },
    { student_id: b.id, section_id: s4b.id },
  ]);
  ok("two classes, one student in each, one in neither");

  const { data: exam, error: exErr } = await svc.from("exams").insert({
    title: `Roll drill ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
  }).select("id").single();
  if (exErr) throw new Error("exam: " + exErr.message);
  made.exams.push(exam.id);
  const { data: q } = await svc.from("questions").insert({
    exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: "Q?", choices: ["A", "B"], order: 1,
  }).select("id").single();
  await svc.from("question_answers").insert({ question_id: q.id, correct_answer: "B" });
  await svc.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", exam.id);
  await svc.from("exam_sections").insert([
    { exam_id: exam.id, section_id: s4a.id },
    { exam_id: exam.id, section_id: s4b.id },
  ]).select();
  for (const who of [a, b, c]) {
    await svc.from("exam_sessions")
      .insert({ exam_id: exam.id, student_id: who.id, status: "IN_PROGRESS" });
  }
  await svc.from("exam_access").insert({ exam_id: exam.id, student_id: c.id });

  const res = await fetch(`${BASE}/exams/${exam.id}/monitor`, { headers: { Cookie: teacher.cookie } });
  const html = await res.text();
  t(res.status === 200, "the monitor renders", `HTTP ${res.status}`);

  sec("What the class filter offers");

  const select = html.slice(html.indexOf('aria-label="Filter by class"'));
  const options = [...select.slice(0, select.indexOf("</select>") + 9)
    .matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => ({ value: m[1], label: m[2] }));

  t(options.length === 4, "one entry per class, plus All and No class",
    options.map((o) => o.label).join(" | "));
  t(options[0]?.value === "all", "All classes first", options[0]?.label);
  t(options.some((o) => o.label.includes("BSIT 4A")), "the first class is offered");
  t(options.some((o) => o.label.includes("BSIT 4B")), "and the second");
  t(options.at(-1)?.value === "none",
    "and the share-link student has somewhere to be found", options.at(-1)?.label);

  sec("What the roll shows");

  t(/Ana In4A/.test(html) && /Ben In4B/.test(html) && /Cy NoClass/.test(html),
    "all three are listed before filtering");
  t(new RegExp(`Ana In4A[^]{0,400}?BSIT 4A ${S}`).test(html),
    "each row says which class the student is in");
  t(/Cy NoClass/.test(html) && !new RegExp(`Cy NoClass[^]{0,200}?BSIT`).test(html),
    "and the one in no class is named, with no class against them");
  t(/3 sittings/.test(html.replace(/<[^>]+>/g, " ")), "the header counts them");

  sec("Somebody else's classes");

  const stranger = await mk("s", "INSTRUCTOR", "Other Teacher");
  const denied = await fetch(`${BASE}/exams/${exam.id}/monitor`, { headers: { Cookie: stranger.cookie } });
  t(denied.status !== 200 || !/Ana In4A/.test(await denied.text()),
    "an instructor who teaches none of this sees no roll", `HTTP ${denied.status}`);

  sec("With classes switched off");

  await settings({ classes_enabled: false });
  const off = await fetch(`${BASE}/exams/${exam.id}/monitor`, { headers: { Cookie: teacher.cookie } });
  const offHtml = await off.text();
  t(!/aria-label="Filter by class"/.test(offHtml),
    "no class filter is offered — there would be nothing behind it");
  t(/Search by name or email/.test(offHtml), "the search and status filters stay");
} catch (e) {
  bug("the run itself fell over", e.message);
} finally {
  sec("Cleanup");
  await settings(before);
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
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) stuck++;
  }
  t(stuck === 0, "test data removed", stuck ? `${stuck} account(s) left behind` : "");

  console.log(`\n${checks} checks, ${bugs.length} failing`);
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(bugs.length ? 1 : 0);
}
