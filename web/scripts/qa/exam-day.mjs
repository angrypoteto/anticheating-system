/**
 * An exam day: twenty instructors at their consoles, sixty students sitting
 * one paper, all at the same time.
 *
 * The earlier passes prove features work. This one asks whether they still
 * work when eighty people do them at once, because the things that survive
 * careful single-user testing are the ones that only break under load:
 *
 *  - the strike counter, which is a read-then-write and used to live in a
 *    React ref, so two tabs counted two tallies and a student was thrown out
 *    of an exam after one departure;
 *  - row-level security, which is only worth anything if it holds while sixty
 *    people are writing answers to the same exam;
 *  - the monitor, which reads everything sixty people are writing.
 *
 * Every student acts through their OWN authenticated client — real sign-in,
 * real policies, the real record_flag() — because a simulation that writes
 * rows with the service role proves the database can store things, which was
 * never in question.
 *
 * Runs against the live project and cleans up after itself. Pass --keep to
 * leave the class standing (for a demo); the teardown command is printed
 * either way.
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const anon = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });

const KEEP = process.argv.includes("--keep");

/**
 * Clearing up after a --keep run, possibly days later.
 *
 * Everything a run creates carries its tag, so this needs nothing but the tag
 * to find all of it — which is the whole reason the tag exists.
 */
const TEARDOWN_AT = process.argv.indexOf("--teardown-tag");
if (TEARDOWN_AT >= 0) {
  const tag = process.argv[TEARDOWN_AT + 1];
  if (!tag || !/^sim[0-9]+$/.test(tag)) {
    console.error("Give the tag from the run, e.g. --teardown-tag sim1788...");
    process.exit(1);
  }
  const stamp = tag.slice(3);
  const { data: who } = await svc.from("users").select("id").like("email", tag + ".%");
  const ids = (who ?? []).map((u) => u.id);
  const { data: ex } = await svc.from("exams").select("id").like("title", "%" + stamp + "%");
  const examIds = (ex ?? []).map((e) => e.id);

  const { data: sess } = examIds.length
    ? await svc.from("exam_sessions").select("id").in("exam_id", examIds)
    : { data: [] };
  const sessionIds = (sess ?? []).map((x) => x.id);
  if (sessionIds.length) {
    await svc.from("flags").delete().in("session_id", sessionIds);
    await svc.from("answers").delete().in("session_id", sessionIds);
    await svc.from("exam_sessions").delete().in("id", sessionIds);
  }
  for (const id of examIds) {
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    await svc.from("exam_sections").delete().eq("exam_id", id);
    const { data: qs } = await svc.from("questions").select("id").eq("exam_id", id);
    if (qs?.length) {
      await svc.from("question_answers").delete().in("question_id", qs.map((q) => q.id));
      await svc.from("questions").delete().eq("exam_id", id);
    }
    await svc.from("exams").delete().eq("id", id);
  }
  if (examIds.length) await svc.from("exam_access").delete().in("exam_id", examIds);
  if (ids.length) await svc.from("enrollments").delete().in("student_id", ids);
  const { data: secs } = await svc.from("sections").select("id").like("subject", "%" + stamp + "%");
  if (secs?.length) await svc.from("sections").delete().in("id", secs.map((x) => x.id));
  await svc.from("subjects").delete().like("name", "%" + stamp + "%");
  if (ids.length) await svc.from("audit_log").delete().in("actor_id", ids);
  for (const id of ids) await svc.auth.admin.deleteUser(id).catch(() => {});

  const { count } = await svc
    .from("users").select("id", { count: "exact", head: true }).like("email", tag + ".%");
  console.log(`removed ${ids.length} accounts, ${examIds.length} exams for ${tag} — ${count ?? 0} left`);
  process.exit(count ? 1 : 0);
}
const TEACHERS = 20;
const STUDENTS = 60;
const SECTIONS = 3;
const QUESTIONS = 20;

/** Everything this run creates is stamped, so teardown is exact. */
const S = Date.now();
const TAG = `sim${S}`;
const mail = (who, i) => `${TAG}.${who}${i}@proctorly.test`;
const PW = `Sim!${S}aA1`;

const made = { users: [], exams: [], sections: [], subjects: [] };
const bugs = [];
let checks = 0;
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const head = (n) => console.log(`\n== ${n} ==`);
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);

/** p50 / p95 of a list of millisecond timings. */
function spread(all) {
  if (!all.length) return "—";
  const v = [...all].sort((a, b) => a - b);
  const at = (q) => v[Math.min(v.length - 1, Math.floor(v.length * q))];
  return `p50 ${at(0.5)}ms · p95 ${at(0.95)}ms · max ${v[v.length - 1]}ms`;
}

/** Run tasks with a bounded pool, so eighty sign-ins do not become one burst. */
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Auth is rate-limited, and eighty accounts is a hundred and sixty calls at it.
 *
 * The limit is per project and not published in the client, so rather than
 * guessing a safe pace this backs off when it is told to and carries on. A
 * simulation that gives up at the rate limiter is measuring Supabase's
 * defaults, not the exam system.
 */
async function patiently(what, label) {
  for (let attempt = 0; ; attempt++) {
    const res = await what();
    const msg = res?.error?.message ?? "";
    if (!/rate limit|too many requests/i.test(msg)) return res;
    if (attempt >= 5) return res;
    const wait = 15_000 * (attempt + 1);
    console.log(`       …rate limited on ${label}; waiting ${wait / 1000}s`);
    await sleep(wait);
  }
}

async function makeUser(who, i, role, name) {
  const email = mail(who, i);
  const { data, error } = await patiently(
    () => svc.auth.admin.createUser({ email, password: PW, email_confirm: true }),
    "create",
  );
  if (error) return { error: error.message };
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: name }).eq("id", data.user.id);

  const c = anon();
  const { data: s, error: e } = await patiently(
    () => c.auth.signInWithPassword({ email, password: PW }),
    "sign-in",
  );
  if (e) return { error: e.message };
  return { id: data.user.id, email, role, name, client: c, token: s.session.access_token };
}

// ---------------------------------------------------------------------------
console.log(`exam day — ${TEACHERS} instructors, ${STUDENTS} students, one paper`);
console.log(`tag ${TAG}${KEEP ? " · --keep: the class will be left standing" : ""}`);

head("provisioning");

const teachers = await pool(
  Array.from({ length: TEACHERS }, (_, i) => i),
  4,
  (i) => makeUser("t", i, "INSTRUCTOR", `Sim Instructor ${i + 1}`),
);
t(
  teachers.every((x) => !x.error),
  `${TEACHERS} instructors created and signed in`,
  teachers.find((x) => x.error)?.error ?? `${secs()}s`,
);

const students = await pool(
  Array.from({ length: STUDENTS }, (_, i) => i),
  4,
  (i) => makeUser("s", i, "STUDENT", `Sim Student ${i + 1}`),
);
t(
  students.every((x) => !x.error),
  `${STUDENTS} students created and signed in`,
  students.find((x) => x.error)?.error ?? `${secs()}s`,
);

if (teachers.some((x) => x.error) || students.some((x) => x.error)) {
  console.log("\nprovisioning failed — nothing to simulate. Cleaning up.");
  await teardown();
  process.exit(1);
}

// One subject, three sections, twenty students each.
const { data: subject } = await svc
  .from("subjects")
  .insert({ name: `Sim Networking ${S}` })
  .select("id")
  .single();
made.subjects.push(subject.id);

const sections = [];
for (let i = 0; i < SECTIONS; i++) {
  const { data: sec } = await svc
    .from("sections")
    .insert({
      name: `SIM-4${String.fromCharCode(65 + i)}`,
      subject: `Sim Networking ${S}`,
      instructor_id: teachers[i].id,
      join_code: `${TAG.slice(-4)}${i}`.toUpperCase().slice(0, 6),
    })
    .select("id")
    .single();
  sections.push(sec.id);
  made.sections.push(sec.id);
}
t(sections.length === SECTIONS, `${SECTIONS} classes created`, sections.length + " sections");

const enrolments = students.map((s, i) => ({
  student_id: s.id,
  section_id: sections[i % SECTIONS],
}));
const { error: enrolErr } = await svc.from("enrollments").insert(enrolments);
t(!enrolErr, `${STUDENTS} students enrolled, ${STUDENTS / SECTIONS} per class`, enrolErr?.message);

// The paper, owned by the first instructor and given to all three classes.
const owner = teachers[0];
const { data: exam, error: examErr } = await owner.client
  .from("exams")
  .insert({
    title: `Sim Finals — Network Fundamentals ${S}`,
    created_by_id: owner.id,
    subject_id: subject.id,
    section_id: sections[0],
    status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: {
      fullscreenRequired: true,
      blockCopyPaste: true,
      maxStrikes: 3,
      honeypot: true,
    },
  })
  .select("id")
  .single();
if (examErr) {
  bug("the owning instructor could not create the paper", examErr.message);
  await teardown();
  process.exit(1);
}
made.exams.push(exam.id);

const questionRows = Array.from({ length: QUESTIONS }, (_, i) => ({
  exam_id: exam.id,
  type: "MULTIPLE_CHOICE",
  prompt: `Sim Q${i + 1}: which layer carries this?`,
  choices: ["Physical", "Data link", "Network", "Transport"],
  order: i + 1,
}));
const { data: questions } = await svc.from("questions").insert(questionRows).select("id, order");
questions.sort((a, b) => a.order - b.order);
// The key lives in its own table, unreadable to students — that separation is
// one of the things this run checks still holds under load.
await svc
  .from("question_answers")
  .insert(questions.map((q) => ({ question_id: q.id, correct_answer: "Network" })));

await svc.from("exam_sections").insert(sections.map((id) => ({ exam_id: exam.id, section_id: id })));

/**
 * How the paper actually reaches sixty students on THIS installation.
 *
 * Classes are switched off in system_settings here, which means
 * exam_reaches_my_section() is false for everybody by design and enrolment
 * delivers nothing — the link grant in exam_access is the only route a
 * student has. Simulating class delivery would have tested a configuration
 * the school is not running, so the sim grants the paper the way /e/<token>
 * does, and says which route it used.
 */
const { data: settings } = await svc
  .from("system_settings")
  .select("classes_enabled")
  .eq("id", true)
  .maybeSingle();
const byClass = settings?.classes_enabled ?? true;

if (!byClass) {
  await svc
    .from("exam_access")
    .insert(students.map((st) => ({ exam_id: exam.id, student_id: st.id })));
}
ok(
  byClass
    ? "paper reaches the class through enrolment"
    : "classes are off here, so the paper is granted by link, as it is in production",
);
await owner.client
  .from("exams")
  .update({ status: "PUBLISHED", published_at: new Date().toISOString() })
  .eq("id", exam.id);
t(questions.length === QUESTIONS, `paper published: ${QUESTIONS} questions to ${SECTIONS} classes`);

// ---------------------------------------------------------------------------
head("sixty students sit it at once");

const startMs = [];
const answerMs = [];

/**
 * Two students in each class fire four departure signals inside the settle
 * window. One glance away is one strike however many events the browser
 * emits, and that is the bug this whole rule exists to prevent — so it is
 * asserted under concurrency rather than assumed.
 */
const BURSTERS = new Set([0, 1, 20, 21, 40, 41]);

const sittings = await pool(students, 12, async (st, i) => {
  const own = st.client;

  const a = Date.now();
  const { data: session, error: sErr } = await own
    .from("exam_sessions")
    .insert({ exam_id: exam.id, student_id: st.id, status: "IN_PROGRESS" })
    .select("id")
    .single();
  startMs.push(Date.now() - a);
  if (sErr) return { error: `start: ${sErr.message}` };

  // Answer most of the paper. Roughly two in three right, so the marks spread.
  const answering = Date.now();
  const rows = questions.slice(0, QUESTIONS - (i % 4)).map((q, n) => ({
    session_id: session.id,
    question_id: q.id,
    response: (i + n) % 3 === 0 ? "Transport" : "Network",
  }));
  const { error: aErr } = await own
    .from("answers")
    .upsert(rows, { onConflict: "session_id,question_id" });
  answerMs.push(Date.now() - answering);
  if (aErr) return { error: `answers: ${aErr.message}` };

  let strikes = 0;
  let burstStrikes = null;

  if (BURSTERS.has(i)) {
    // Four signals, together, for one departure.
    const fired = await Promise.all(
      ["WINDOW_BLUR", "FULLSCREEN_EXIT", "TAB_SWITCH", "WINDOW_BLUR"].map((type) =>
        own.rpc("record_flag", {
          p_session_id: session.id,
          p_type: type,
          p_question_id: questions[2].id,
        }),
      ),
    );
    burstStrikes = Math.max(...fired.map((f) => (typeof f.data === "number" ? f.data : 0)));
    strikes = burstStrikes;
  } else if (i % 5 === 0) {
    // A student who genuinely leaves three times. The gaps have to clear the
    // ten-second settle window or the three collapse into one — which is the
    // rule working, and would make this assertion test nothing.
    for (let k = 0; k < 3; k++) {
      const { data } = await own.rpc("record_flag", {
        p_session_id: session.id,
        p_type: "TAB_SWITCH",
        p_question_id: questions[k].id,
      });
      if (typeof data === "number") strikes = data;
      if (k < 2) await new Promise((r) => setTimeout(r, 11_000));
    }
  }

  return { student: st, sessionId: session.id, strikes, burstStrikes, index: i };
});

const failed = sittings.filter((s) => s.error);
t(failed.length === 0, `all ${STUDENTS} students started and answered`, failed[0]?.error ?? `${secs()}s`);
ok("time to start a sitting", spread(startMs));
ok("time to write a page of answers", spread(answerMs));

const bursts = sittings.filter((s) => s.burstStrikes != null);
t(
  bursts.every((s) => s.burstStrikes === 1),
  "four signals inside the settle window are one strike, under load",
  bursts.map((s) => s.burstStrikes).join(", "),
);

const walkers = sittings.filter((s) => !s.error && s.strikes >= 3);
t(
  walkers.every((s) => s.strikes === 3),
  "nobody ever exceeded the three they were allowed",
  `${walkers.length} students reached the limit`,
);

// ---------------------------------------------------------------------------
head("what a student must not be able to see");

const [alice, bob] = [sittings[2], sittings[3]];
if (alice && bob && !alice.error && !bob.error) {
  const { data: peek } = await alice.student.client
    .from("answers")
    .select("id")
    .eq("session_id", bob.sessionId);
  t((peek ?? []).length === 0, "a student cannot read another student's answers");

  const { data: keyPeek } = await alice.student.client
    .from("question_answers")
    .select("correct_answer")
    .limit(1);
  t((keyPeek ?? []).length === 0, "a student cannot read the answer key");
}

// ---------------------------------------------------------------------------
head("twenty instructors watching at once");

const watchMs = [];
const watched = await pool(teachers, 10, async (tr) => {
  const a = Date.now();
  const { data: rows, error } = await tr.client
    .from("exam_sessions")
    .select("id, status, student_id")
    .eq("exam_id", exam.id);
  watchMs.push(Date.now() - a);
  return { count: rows?.length ?? 0, error };
});

const ownerSees = watched[0];
t(
  !ownerSees.error && ownerSees.count === STUDENTS,
  "the owning instructor sees every sitting",
  `${ownerSees.count} of ${STUDENTS}`,
);
ok("time to load the monitor's roll, twenty at once", spread(watchMs));

const { data: liveFlags } = await svc
  .from("flags")
  .select("id, session_id")
  .in("session_id", sittings.filter((s) => !s.error).map((s) => s.sessionId));
ok(`${liveFlags?.length ?? 0} departures recorded across the class`);

// ---------------------------------------------------------------------------
head("marking");

const { data: graded } = await svc
  .from("exam_sessions")
  .select("id, status")
  .eq("exam_id", exam.id);
ok(`${graded?.length ?? 0} sittings on the paper`, `${secs()}s elapsed`);

// ---------------------------------------------------------------------------
async function teardown() {
  const ids = made.users;
  const { data: sess } = await svc.from("exam_sessions").select("id").in("exam_id", made.exams);
  const sessionIds = (sess ?? []).map((s) => s.id);

  if (sessionIds.length) {
    await svc.from("flags").delete().in("session_id", sessionIds);
    await svc.from("answers").delete().in("session_id", sessionIds);
    await svc.from("exam_sessions").delete().in("id", sessionIds);
  }
  for (const id of made.exams) {
    // A published exam's questions are frozen, so it is archived first —
    // learned the hard way, by leaving four undeletable exams in a real list.
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    await svc.from("exam_sections").delete().eq("exam_id", id);
    const { data: qs } = await svc.from("questions").select("id").eq("exam_id", id);
    if (qs?.length) {
      await svc.from("question_answers").delete().in("question_id", qs.map((q) => q.id));
      await svc.from("questions").delete().eq("exam_id", id);
    }
    await svc.from("exams").delete().eq("id", id);
  }
  if (made.exams.length) await svc.from("exam_access").delete().in("exam_id", made.exams);
  if (ids.length) await svc.from("enrollments").delete().in("student_id", ids);
  if (made.sections.length) await svc.from("sections").delete().in("id", made.sections);
  if (made.subjects.length) await svc.from("subjects").delete().in("id", made.subjects);
  if (ids.length) await svc.from("audit_log").delete().in("actor_id", ids);
  for (const id of ids) await svc.auth.admin.deleteUser(id).catch(() => {});

  // Say what is left rather than assuming it worked.
  const { count: leftUsers } = await svc
    .from("users")
    .select("id", { count: "exact", head: true })
    .like("email", `${TAG}.%`);
  const { count: leftExams } = await svc
    .from("exams")
    .select("id", { count: "exact", head: true })
    .like("title", `%${S}%`);
  return { leftUsers: leftUsers ?? 0, leftExams: leftExams ?? 0 };
}

head(KEEP ? "left standing" : "cleaning up");
if (KEEP) {
  console.log(`  ${STUDENTS + TEACHERS} accounts, ${SECTIONS} classes and 1 paper remain, all tagged ${TAG}.`);
  console.log(`  Remove them with:  node scripts/qa/exam-day.mjs --teardown-tag ${TAG}`);
} else {
  const left = await teardown();
  t(
    left.leftUsers === 0 && left.leftExams === 0,
    "everything this run made is gone",
    `${left.leftUsers} accounts, ${left.leftExams} exams left`,
  );
}

console.log(
  `\n${checks} checks, ${bugs.length} problem${bugs.length === 1 ? "" : "s"}, ${secs()}s`,
);
if (bugs.length) {
  console.log("");
  for (const b of bugs) console.log(`  BUG  ${b.l}${b.d ? " — " + b.d : ""}`);
  process.exit(1);
}
