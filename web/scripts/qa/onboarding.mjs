/**
 * An account is not finished until it has a name.
 *
 * Signing in with Google supplies an email address and nothing else that was
 * asked for, so an account could reach an exam with no name and no class — and
 * the teacher's monitor showed a column of gmail addresses with no way to tell
 * who was who. This checks that the gate stops those accounts, sends them back
 * where they were going afterwards, and does not stop anybody else.
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
const made = { users: [], sections: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const section = (n) => console.log(`\n== ${n} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cookieFor = (s) => {
  const raw = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64");
  const parts = []; for (let i = 0; i < raw.length; i += 3180) parts.push(raw.slice(i, i + 3180));
  const n = `sb-${ref}-auth-token`;
  return parts.length === 1 ? `${n}=${parts[0]}` : parts.map((x, i) => `${n}.${i}=${x}`).join("; ");
};

const mk = async (tag, role, fullName) => {
  const email = `ob-${tag}-${S}@example.com`, pw = `Ob!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: fullName }).eq("id", data.user.id);
  for (let a = 0; a < 8; a++) {
    const c = anon();
    const { data: s, error: e } = await c.auth.signInWithPassword({ email, password: pw });
    if (!e) return { id: data.user.id, email, client: c, cookie: cookieFor(s.session) };
    if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
    await sleep(65_000);
  }
  throw new Error(`sign in ${tag}: still rate limited`);
};

/** Follow no redirects, so the gate itself is visible rather than its result. */
const hop = async (who, p) => {
  const res = await fetch(`${BASE}${p}`, { headers: { Cookie: who.cookie }, redirect: "manual" });
  return { status: res.status, to: res.headers.get("location") ?? "", body: res.status === 200 ? await res.text() : "" };
};

const settings = (patch) => svc.from("system_settings").update(patch).eq("id", true);
const { data: before } = await svc.from("system_settings")
  .select("classes_enabled, allow_class_self_join").eq("id", true).single();

try {
  section("An account with no name");

  await settings({ classes_enabled: false });
  const nameless = await mk("n", "STUDENT", null);

  const home = await hop(nameless, "/");
  t(home.status === 307 && home.to.includes("/welcome"),
    "the dashboard sends them to finish signing up", `${home.status} -> ${home.to || "(rendered)"}`);

  const exam = await hop(nameless, "/exam/00000000-0000-0000-0000-000000000000");
  t(exam.to.includes("/welcome"), "so does an exam link", exam.to || `${exam.status}`);
  t(decodeURIComponent(exam.to).includes("next=/exam/"),
    "and it remembers the paper they were going to", decodeURIComponent(exam.to));

  const welcome = await hop(nameless, "/welcome");
  t(welcome.status === 200 && /Your full name/.test(welcome.body),
    "the page asks for a name", `${welcome.status}`);
  t(!/Class code/.test(welcome.body),
    "and does not ask for a class while classes are switched off");

  section("Once they answer");

  const { error: nameErr } = await nameless.client
    .from("users").update({ full_name: "Test Student" }).eq("id", nameless.id);
  t(!nameErr, "a student may set their own name", nameErr?.message);

  const after = await hop(nameless, "/");
  t(after.status === 200 || !after.to.includes("/welcome"),
    "and is no longer stopped", after.to || `${after.status}`);

  const bounce = await hop(nameless, "/welcome");
  t(bounce.to === "/" || bounce.to.endsWith("/"),
    "revisiting the gate just sends them on", bounce.to || `${bounce.status}`);

  section("A class, where students join their own");

  await settings({ classes_enabled: true, allow_class_self_join: true });
  const { data: sec } = await svc.from("sections")
    .insert({ name: `OB Section ${S}`, subject: "Onboarding" }).select("id, join_code").single();
  made.sections.push(sec.id);

  const classless = await mk("c", "STUDENT", "Has A Name");
  const gated = await hop(classless, "/");
  t(gated.to.includes("/welcome"), "a student in no class is stopped too", gated.to || `${gated.status}`);

  const asked = await hop(classless, "/welcome");
  t(/Class code/.test(asked.body), "and is asked for the code");
  t(!/Your full name/.test(asked.body), "but not for a name they already gave");

  const { error: joinErr } = await classless.client.rpc("join_class", { code: sec.join_code });
  t(!joinErr, "the code enrols them", joinErr?.message);
  const joined = await hop(classless, "/");
  t(!joined.to.includes("/welcome"), "and the gate lets them through", joined.to || `${joined.status}`);

  section("Where an admin does the enrolling");

  await settings({ classes_enabled: true, allow_class_self_join: false });
  const admins = await mk("a", "STUDENT", "Admin Enrols Me");
  const free = await hop(admins, "/");
  t(!free.to.includes("/welcome"),
    "a student with no class is not stopped — there is no code for them to give",
    free.to || `${free.status}`);

  section("Staff");

  await settings({ classes_enabled: true, allow_class_self_join: true });
  const teacher = await mk("t", "INSTRUCTOR", null);
  const staffGate = await hop(teacher, "/teacher");
  t(staffGate.to.includes("/welcome"), "an instructor with no name is stopped as well",
    staffGate.to || `${staffGate.status}`);

  const staffAsk = await hop(teacher, "/welcome");
  t(!/Class code/.test(staffAsk.body), "and is never asked for a class code");
} catch (e) {
  bug("the run itself fell over", e.message);
} finally {
  section("Cleanup");
  await settings(before);
  let stuck = 0;
  for (const id of made.users) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.from("enrollments").delete().eq("student_id", id);
    await svc.from("exam_access").delete().eq("student_id", id);
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) stuck++;
  }
  for (const id of made.sections) {
    await svc.from("enrollments").delete().eq("section_id", id);
    await svc.from("sections").delete().eq("id", id);
  }
  t(stuck === 0, "test data removed", stuck ? `${stuck} account(s) left behind` : "");

  console.log(`\n${checks} checks, ${bugs.length} failing`);
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(bugs.length ? 1 : 0);
}
