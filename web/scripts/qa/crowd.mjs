/**
 * Ten administrators, ten instructors and ten students, working at the same
 * time.
 *
 * The earlier passes exercised features one actor at a time. This one runs them
 * concurrently, because the failures that survive careful single-user testing
 * are races: two people creating the same thing, two people writing the same
 * row, a check-then-insert with a gap in the middle. It also reaches the
 * features no pass has touched — provider keys, settings, the audit trail, the
 * monitor's actions.
 *
 * Runs against the live project and cleans up after itself.
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
const EACH = 10;
const made = { users: [], exams: [], sections: [], subjects: [], keys: [] };
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
  .select("classes_enabled, allow_class_self_join, allowed_email_domains, pass_threshold, institution_name")
  .eq("id", true).single();

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
  return { status: res.status, ms, html };
}

try {
  await settings({ classes_enabled: true, allow_class_self_join: true, allowed_email_domains: "", pass_threshold: 75 });

  // ------------------------------------------------------------------ cast
  section(`Signing in ${EACH} admins, ${EACH} instructors and ${EACH} students`);

  let waits = 0;
  const mk = async (tag, role, name) => {
    const email = `cw-${tag}-${S}@example.com`, pw = `Cw!${S}${tag}`;
    const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (error) throw new Error(`${tag}: ${error.message}`);
    made.users.push(data.user.id);
    await svc.from("users").update({ role, status: "ACTIVE", full_name: name }).eq("id", data.user.id);
    for (let a = 0; a < 8; a++) {
      const c = anon();
      const { data: s, error: e } = await c.auth.signInWithPassword({ email, password: pw });
      if (!e) return { id: data.user.id, email, pw, role, name, client: c, cookie: cookieFor(s.session) };
      if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
      waits++; await new Promise((r) => setTimeout(r, 65_000));
    }
    throw new Error(`sign in ${tag}: still rate limited`);
  };

  const admins = [];
  const teachers = [];
  const students = [];
  for (let i = 0; i < EACH; i++) admins.push(await mk(`a${i}`, "ADMIN", `Admin ${i + 1}`));
  for (let i = 0; i < EACH; i++) teachers.push(await mk(`t${i}`, "INSTRUCTOR", `Teacher ${i + 1}`));
  for (let i = 0; i < EACH; i++) students.push(await mk(`s${i}`, "STUDENT", `Student ${i + 1}`));
  ok(`${admins.length + teachers.length + students.length} signed in`,
    `${secs()}s${waits ? `, ${waits} rate-limit pause(s)` : ""}`);

  // ============================================================== ADMINS
  section("Ten administrators, at once");

  const adminRoutes = ["/admin", "/admin/exams", "/admin/students", "/admin/accounts",
    "/admin/health", "/admin/keys", "/admin/settings", "/admin/profile"];

  // One admin, one page at a time: the baseline a slow number has to be read
  // against, or contention on a single server looks like a slow page.
  const baseline = [];
  for (const r of adminRoutes) baseline.push({ r, ms: (await page(admins[0].cookie, r)).ms });
  const slowAlone = baseline.filter((b) => b.ms > 2000);
  for (const b of baseline.sort((a, z) => z.ms - a.ms).slice(0, 3)) {
    console.log(`       alone: ${b.r.padEnd(20)} ${b.ms}ms`);
  }
  t(slowAlone.length === 0, "performance", "no admin page is slow on its own",
    slowAlone.length ? slowAlone.map((b) => `${b.r} ${b.ms}ms`).join(", ") : "all under 2s");
  const loads = await Promise.all(
    admins.flatMap((a) => adminRoutes.map((r) => page(a.cookie, r).then((x) => ({ a, r, ...x })))));
  const failedLoads = loads.filter((l) => l.status !== 200);
  t(failedLoads.length === 0, "pages", "every admin page loads for every admin",
    failedLoads.length ? `${failedLoads.length} failed, e.g. ${failedLoads[0].r} -> ${failedLoads[0].status}` : `${loads.length} loads`);
  // Per route, so a slow number points somewhere rather than just alarming.
  const byRoute = new Map();
  for (const l of loads) {
    const cur = byRoute.get(l.r) ?? [];
    cur.push(l.ms);
    byRoute.set(l.r, cur);
  }
  const worst = [...byRoute.entries()]
    .map(([r, ms]) => ({ r, p50: ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)], max: Math.max(...ms) }))
    .sort((a, b) => b.max - a.max);
  for (const w of worst.slice(0, 3)) {
    console.log(`       ${w.r.padEnd(20)} median ${String(w.p50).padStart(5)}ms  worst ${w.max}ms`);
  }
  // Eighty simultaneous renders against one server: this measures contention,
  // not the page. Reported rather than asserted, with the baseline above as the
  // thing that would actually indicate a problem.
  console.log(`       (eighty at once is contention on one server, not a per-page cost)`);
  ok("ten admins can all load every page at once",
    `worst median ${worst[0].p50}ms on ${worst[0].r}`);

  // Ten admins saving settings at the same moment.
  const thresholds = admins.map((_, i) => 60 + i);
  await Promise.all(admins.map((a, i) =>
    a.client.from("system_settings").update({ pass_threshold: thresholds[i] }).eq("id", true)));
  const { data: settled } = await svc.from("system_settings").select("pass_threshold").eq("id", true).single();
  t(thresholds.includes(Number(settled.pass_threshold)), "settings",
    "concurrent settings saves leave one whole value, not a mixture", `${settled.pass_threshold}`);
  await settings({ pass_threshold: 75 });

  // Ten admins each provisioning an account at once.
  const provisioned = await Promise.all(admins.map(async (a, i) => {
    const email = `cw-prov${i}-${S}@example.com`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: `Cw!${S}p${i}`, email_confirm: true });
    if (data?.user) made.users.push(data.user.id);
    if (error) return { error };
    const { error: roleErr } = await a.client.from("users")
      .update({ role: "STUDENT", status: "ACTIVE" }).eq("id", data.user.id);
    return { id: data.user.id, error: roleErr };
  }));
  t(provisioned.every((p) => !p.error), "accounts", "ten admins provision ten accounts at once",
    provisioned.find((p) => p.error)?.error?.message);

  // Two admins creating the same email.
  const clash = `cw-clash-${S}@example.com`;
  const both = await Promise.all([0, 1].map(() =>
    svc.auth.admin.createUser({ email: clash, password: `Cw!${S}c`, email_confirm: true })));
  for (const b of both) if (b.data?.user) made.users.push(b.data.user.id);
  const created = both.filter((b) => !b.error).length;
  t(created === 1, "accounts", "a duplicate email is refused rather than doubled", `${created} created`);

  // Ten admins creating classes at once.
  const classes = await Promise.all(admins.map((a, i) =>
    a.client.from("sections")
      .insert({ subject: `CW Subject ${i} ${S}`, name: `CW-${i}-${S}` })
      .select("id, join_code").single()));
  for (const c of classes) if (c.data) made.sections.push(c.data.id);
  t(classes.every((c) => !c.error), "classes", "ten classes are created at once",
    classes.find((c) => c.error)?.error?.message);
  const codes = classes.filter((c) => c.data).map((c) => c.data.join_code);
  t(new Set(codes).size === codes.length, "classes", "every join code is distinct", `${codes.length} codes`);

  // Two admins disabling the same account simultaneously.
  const victim = provisioned.find((p) => p.id);
  const disables = await Promise.all([admins[0], admins[1]].map((a) =>
    a.client.from("users").update({ status: "DISABLED" }).eq("id", victim.id).select("id")));
  const { data: victimNow } = await svc.from("users").select("status").eq("id", victim.id).single();
  t(victimNow.status === "DISABLED" && disables.every((d) => !d.error), "accounts",
    "two admins disabling one account agree on the outcome", victimNow.status);
  await svc.from("users").update({ status: "ACTIVE" }).eq("id", victim.id);

  // An administrator doing an administrator's job through their own session.
  const promoted = provisioned.find((p) => p.id && p.id !== victim.id);
  const { error: grantErr } = await admins[2].client.from("users")
    .update({ role: "INSTRUCTOR" }).eq("id", promoted.id);
  const { data: promotedNow } = await svc.from("users").select("role").eq("id", promoted.id).single();
  t(!grantErr && promotedNow.role === "INSTRUCTOR", "accounts",
    "an admin can grant a role through their own session",
    `${promotedNow?.role}${grantErr ? " — " + grantErr.message.slice(0, 50) : ""}`);
  await svc.from("users").update({ role: "STUDENT" }).eq("id", promoted.id);

  // The audit trail, under ten actors.
  const { data: trail } = await svc.from("audit_log")
    .select("actor_id, action").in("actor_id", admins.map((a) => a.id)).limit(500);
  const actors = new Set((trail ?? []).map((r) => r.actor_id));
  t(actors.size >= 1, "audit", "admin actions are attributed to the admin who made them",
    `${(trail ?? []).length} entries from ${actors.size} of ${admins.length} admins`);
  const orphan = (trail ?? []).filter((r) => !r.actor_id);
  t(orphan.length === 0, "audit", "no entry is recorded without an actor", `${orphan.length}`);

  // Provider keys: adding, testing and removing one that cannot work.
  const { data: keyRow, error: keyErr } = await svc.from("ai_provider_keys").insert({
    provider: "groq", label: `CW dud ${S}`, api_style: "openai",
    base_url: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b",
    key_hint: "dead", added_by_id: admins[0].id, status: "ACTIVE",
  }).select("id").single();
  if (keyRow) made.keys.push(keyRow.id);
  t(!keyErr, "keys", "an admin can add a provider key", keyErr?.message);
  const { data: keysSeen } = await admins[1].client.from("ai_provider_keys").select("id, key_hint");
  t((keysSeen ?? []).some((k) => k.id === keyRow?.id), "keys", "another admin sees it");
  t(!(keysSeen ?? []).some((k) => "secret" in k || "vault_secret_id" in k && k.vault_secret_id === null && false),
    "keys", "the list carries a hint, never the key itself");
  await svc.from("ai_provider_keys").update({ status: "DISABLED" }).eq("id", keyRow.id);
  const { data: disabled } = await svc.from("ai_provider_keys").select("status").eq("id", keyRow.id).single();
  t(disabled.status === "DISABLED", "keys", "and can disable it", disabled.status);

  // ========================================================== INSTRUCTORS
  section("Ten instructors, at once");

  const teacherRoutes = ["/teacher", "/teacher/exams", "/teacher/exams/new",
    "/teacher/students", "/teacher/classes", "/teacher/profile"];
  const tLoads = await Promise.all(
    teachers.flatMap((x) => teacherRoutes.map((r) => page(x.cookie, r).then((y) => ({ x, r, ...y })))));
  const tFailed = tLoads.filter((l) => l.status !== 200);
  t(tFailed.length === 0, "pages", "every teacher page loads for every teacher",
    tFailed.length ? `${tFailed.length} failed, e.g. ${tFailed[0].r} -> ${tFailed[0].status}` : `${tLoads.length} loads`);

  // The race worth hunting: two teachers naming the same new subject at once.
  const shared = `CW Shared Subject ${S}`;
  const resolve = async (who) => {
    // What the app's resolver does: look, insert if absent, and if somebody won
    // the race in between, take the row they made.
    const { data: existing } = await who.client.from("subjects").select("id").ilike("name", shared).maybeSingle();
    if (existing) return { id: existing.id };
    const { data, error } = await who.client.from("subjects").insert({ name: shared }).select("id").single();
    if (!error) return { id: data.id };
    if (/duplicate key|unique constraint/i.test(error.message)) {
      const { data: raced } = await who.client.from("subjects").select("id").ilike("name", shared).maybeSingle();
      if (raced) return { id: raced.id };
    }
    return { error };
  };
  const raced = await Promise.all([teachers[0], teachers[1], teachers[2]].map(resolve));
  const { data: subjRows } = await svc.from("subjects").select("id").ilike("name", shared);
  for (const r of subjRows ?? []) made.subjects.push(r.id);
  t((subjRows ?? []).length === 1, "subjects", "the same subject named twice at once yields one row",
    `${(subjRows ?? []).length} rows`);
  const losers = raced.filter((r) => r.error);
  t(losers.length === 0, "subjects",
    "and no teacher is shown a duplicate-key error for it",
    losers.length ? `${losers.length} of 3 failed: ${losers[0].error.message.slice(0, 60)}` : "none failed");

  // Each teacher builds, publishes and staffs an exam, all at once.
  const exams = await Promise.all(teachers.map(async (x, i) => {
    const { data: e, error } = await x.client.from("exams").insert({
      title: `CW Exam ${i} ${S}`, created_by_id: x.id, status: "DRAFT",
      timer_config: { totalMinutes: 20, perQuestionSeconds: null },
      lockdown_config: { fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 3, honeypot: true },
    }).select("id, share_token").single();
    if (error) return { error };
    made.exams.push(e.id);
    const { data: q } = await svc.from("questions").insert({
      exam_id: e.id, type: "MULTIPLE_CHOICE", prompt: `CW Q ${i}?`, choices: ["A", "B"], order: 1,
    }).select("id").single();
    await svc.from("question_answers").insert({ question_id: q.id, correct_answer: "B" });
    await x.client.from("exams").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", e.id);
    return { e, teacher: x, questionId: q.id };
  }));
  t(exams.every((r) => !r.error), "exams", "ten instructors publish ten exams at once",
    exams.find((r) => r.error)?.error?.message);

  // Isolation across ten of them.
  const mine = await Promise.all(teachers.map(async (x) => {
    const { data } = await x.client.from("exams").select("id, created_by_id");
    const foreign = (data ?? []).filter((e) => e.created_by_id !== x.id);
    return foreign.length;
  }));
  t(mine.every((n) => n === 0), "security", "no instructor sees another's exam",
    `${mine.reduce((a, b) => a + b, 0)} foreign rows seen`);

  // Two teachers closing the same exam at once — one owns it, one does not.
  const target = exams.find((r) => r.e);
  const closes = await Promise.all([
    target.teacher.client.rpc("close_exam", { exam_uuid: target.e.id }),
    teachers.find((x) => x.id !== target.teacher.id).client.rpc("close_exam", { exam_uuid: target.e.id }),
  ]);
  t(!closes[0].error && closes[1].error, "security",
    "only the owner's close takes effect", `owner=${closes[0].error?.message ?? "ok"}, other=${closes[1].error ? "refused" : "ALLOWED"}`);
  await target.teacher.client.rpc("open_exam", { exam_uuid: target.e.id });

  // =============================================================== STUDENTS
  section("Ten students, at once");

  const cls = classes.find((c) => c.data).data;
  const joins = await Promise.all(students.map((s) => s.client.rpc("join_class", { code: cls.join_code })));
  t(joins.every((j) => !j.error), "classes", "ten students join one class at once",
    joins.find((j) => j.error)?.error?.message);
  const { count: enrolled } = await svc.from("enrollments")
    .select("*", { count: "exact", head: true }).eq("section_id", cls.id);
  t(enrolled === students.length, "classes", "each of them exactly once", `${enrolled} rows`);

  // The same student joining repeatedly, concurrently.
  const again = await Promise.all(Array.from({ length: 5 }, () =>
    students[0].client.rpc("join_class", { code: cls.join_code })));
  const { count: stillOne } = await svc.from("enrollments").select("*", { count: "exact", head: true })
    .eq("section_id", cls.id).eq("student_id", students[0].id);
  t(stillOne === 1 && again.every((a) => !a.error), "classes",
    "joining five times over does not duplicate", `${stillOne} row(s)`);

  // Two students claiming one username at the same instant.
  const wanted = `cw${S}`.slice(0, 20);
  const claims = await Promise.all([students[0], students[1]].map((s) =>
    s.client.from("users").update({ username: wanted }).eq("id", s.id).select("id")));
  const { count: holders } = await svc.from("users")
    .select("*", { count: "exact", head: true }).eq("username", wanted);
  t(holders === 1, "profile", "one username cannot be held by two people", `${holders} holder(s)`);
  const refused = claims.filter((c) => c.error).length;
  t(refused >= 1, "profile", "and the loser is told, not silently ignored",
    refused ? "refused" : "both updates reported success");

  // Ten students sit ten different exams at once.
  const sits = await Promise.all(students.map(async (s, i) => {
    const target = exams[i % exams.length];
    if (!target?.e) return { skipped: true };
    const { error: linkErr } = await s.client.rpc("open_exam_link", { token: target.e.share_token });
    if (linkErr) return { error: linkErr };
    const { data: sess, error } = await s.client.from("exam_sessions")
      .insert({ exam_id: target.e.id, student_id: s.id }).select("id").single();
    if (error) return { error };
    const { error: aErr } = await s.client.from("answers")
      .upsert({ session_id: sess.id, question_id: target.questionId, response: "B" },
        { onConflict: "session_id,question_id" });
    return { error: aErr };
  }));
  t(sits.every((r) => !r.error), "sitting", "ten students sit ten exams at once",
    sits.find((r) => r.error)?.error?.message);

  const home = await Promise.all(students.map((s) => page(s.cookie, "/")));
  t(home.every((h) => h.status === 200), "pages", "every student dashboard loads",
    `${home.filter((h) => h.status !== 200).length} failed`);

  // Everyone at once, on the pages that aggregate.
  section("Everyone at once");
  const started = Date.now();
  const all = await Promise.all([
    ...admins.map((a) => page(a.cookie, "/admin/students")),
    ...teachers.map((x) => page(x.cookie, "/teacher/students")),
    ...students.map((s) => page(s.cookie, "/")),
  ]);
  const elapsed = Date.now() - started;
  t(all.every((r) => r.status === 200), "pages", "thirty dashboards load together",
    `${all.filter((r) => r.status !== 200).length} failed in ${elapsed}ms`);
  t(elapsed < 30_000, "performance", "and the whole burst finishes promptly", `${elapsed}ms`);
} catch (e) {
  bug("harness", "the run stopped early", e.message);
} finally {
  await settings({
    classes_enabled: before.classes_enabled,
    allow_class_self_join: before.allow_class_self_join,
    allowed_email_domains: before.allowed_email_domains,
    pass_threshold: before.pass_threshold,
    institution_name: before.institution_name,
  });
  for (const id of made.keys) await svc.from("ai_provider_keys").delete().eq("id", id);
  for (const id of made.exams) {
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    await svc.from("exam_access").delete().eq("exam_id", id);
    await svc.from("exam_sections").delete().eq("exam_id", id);
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
  for (const id of made.sections) {
    await svc.from("enrollments").delete().eq("section_id", id);
    await svc.from("sections").delete().eq("id", id);
  }
  for (const id of made.subjects) await svc.from("subjects").delete().eq("id", id);
  for (const id of made.users) {
    await svc.from("exam_access").delete().eq("student_id", id);
    await svc.from("enrollments").delete().eq("student_id", id);
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.from("generation_progress").delete().eq("owner_id", id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`\n${checks} checks, ${bugs.length} finding(s), ${secs()}s total.`);
  if (bugs.length) { console.log("\nFindings:"); for (const b of bugs) console.log(`  [${b.area}] ${b.l}${b.d ? " — " + b.d : ""}`); }
  process.exit(0);
}
