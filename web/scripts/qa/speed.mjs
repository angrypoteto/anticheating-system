/**
 * How fast each safeguard answers — from the student's side to the teacher's.
 *
 * Every detection has two halves. The first happens in the student's browser:
 * a listener fires, a key goes down, an extension touches the page. That half
 * is decided by the code and does not depend on the network, so it is stated
 * here from the code rather than measured (there is no browser in this run).
 * The second half is what this measures, against the real project: the flag
 * being written by record_flag(), and the same row arriving on a teacher's
 * monitor over Realtime — the moment a teacher could see it.
 *
 * It also times the other things a sitting leans on: an answer being saved, a
 * recording being opened, a thirty-second piece of video being uploaded, and a
 * teacher fetching a link to watch it.
 *
 * Runs against the live project, as a throwaway teacher and student, and
 * deletes everything it made.
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const S = Date.now();
const RUNS = Number(process.env.SPEED_RUNS ?? 8);
const made = { users: [], exams: [], files: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

const mk = async (tag, role) => {
  const email = `sp-${tag}-${S}@example.com`, pw = `Sp!${S}${tag}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`${tag}: ${error.message}`);
  made.users.push(data.user.id);
  await svc.from("users").update({ role, status: "ACTIVE", full_name: `Speed ${tag}` }).eq("id", data.user.id);
  for (let a = 0; a < 8; a++) {
    const c = anon();
    const { error: e } = await c.auth.signInWithPassword({ email, password: pw });
    if (!e) return { id: data.user.id, client: c };
    if (!/rate limit/i.test(e.message)) throw new Error(`sign in ${tag}: ${e.message}`);
    console.log("  (sign-in rate limited; waiting a minute)");
    await sleep(65_000);
  }
  throw new Error(`sign in ${tag}: still rate limited`);
};

const stats = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { p50: NaN, p95: NaN, max: NaN, n: 0 };
  const at = (q) => v[Math.min(v.length - 1, Math.floor(q * (v.length - 1) + 0.5))];
  return { p50: at(0.5), p95: at(0.95), max: v[v.length - 1], n: v.length };
};
const ms = (x) => (Number.isFinite(x) ? `${Math.round(x)} ms` : "—");

/** What happens in the browser, from the code: it has no network in it. */
const IN_BROWSER = {
  TAB_SWITCH: { label: "Switched tab", browser: "same frame", strike: true },
  WINDOW_BLUR: { label: "Clicked away", browser: "same frame", strike: true },
  FULLSCREEN_EXIT: { label: "Left fullscreen", browser: "same frame", strike: true },
  SCREENSHOT: { label: "Screenshot key", browser: "same frame (paper covered next frame)", strike: true },
  SCREEN_SHARE_ENDED: { label: "Stopped sharing", browser: "same frame", strike: true },
  HONEYPOT: { label: "Honeypot filled", browser: "on the keystroke", strike: true },
  EXTENSION_DETECTED: { label: "Extension on page", browser: "within 150 ms (grouped)", strike: false },
};

const results = [];
const findings = [];

try {
  console.log("\n== Setting up a throwaway teacher, student and exam ==");
  const teacher = await mk("t", "INSTRUCTOR");
  const student = await mk("s", "STUDENT");

  const { data: exam, error: exErr } = await svc.from("exams").insert({
    title: `Speed drill ${S}`, created_by_id: teacher.id, status: "DRAFT",
    timer_config: { totalMinutes: 60, perQuestionSeconds: null },
    lockdown_config: {
      fullscreenRequired: true, blockCopyPaste: true, maxStrikes: 99, honeypot: true,
      recordScreen: true, detectExtensions: true,
    },
  }).select("id").single();
  if (exErr) throw new Error("exam: " + exErr.message);
  made.exams.push(exam.id);

  const { data: q, error: qErr } = await svc.from("questions").insert({
    exam_id: exam.id, type: "MULTIPLE_CHOICE", prompt: "Speed?", choices: ["Fast", "Slow"], order: 1,
  }).select("id").single();
  if (qErr) throw new Error("question: " + qErr.message);
  await svc.from("exams").update({ status: "PUBLISHED" }).eq("id", exam.id);

  const { data: sitting, error: sErr } = await svc.from("exam_sessions").insert({
    exam_id: exam.id, student_id: student.id, status: "IN_PROGRESS",
  }).select("id").single();
  if (sErr) throw new Error("sitting: " + sErr.message);
  console.log("  ready");

  // The teacher's monitor: the same subscription live.tsx makes.
  const arrivals = new Map();
  const channel = teacher.client
    .channel(`speed-${S}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "flags" }, (p) => {
      if (p.new?.detail) arrivals.set(p.new.detail, now());
    });
  const subscribed = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 20_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(t); resolve(true); }
    });
  });
  if (!subscribed) findings.push("the teacher's live feed never connected, so monitor times are missing");
  else console.log("  teacher's monitor connected");
  // One untimed flag first: a freshly joined subscription can take a moment
  // before it starts delivering, and that is a one-off, not the steady state.
  await student.client.rpc("record_flag", {
    p_session_id: sitting.id, p_type: "EXTENSION_DETECTED", p_question_id: q.id, p_detail: "speed:warmup",
  });
  for (let w = 0; w < 200 && !arrivals.has("speed:warmup"); w++) await sleep(25);
  console.log(arrivals.has("speed:warmup") ? "  live feed warmed up" : "  live feed slow to start");

  console.log(`\n== Flags: student's browser → database → teacher's monitor (${RUNS} of each) ==`);
  const sent = [];
  for (const [type, info] of Object.entries(IN_BROWSER)) {
    const saved = [], seen = [];
    for (let i = 0; i < RUNS; i++) {
      const tag = `speed:${type}:${i}`;
      const t0 = now();
      const { error } = await student.client.rpc("record_flag", {
        p_session_id: sitting.id, p_type: type, p_question_id: q.id, p_detail: tag,
      });
      const t1 = now();
      if (error) { findings.push(`${type}: ${error.message}`); break; }
      saved.push(t1 - t0);
      sent.push(tag);
      for (let w = 0; w < 100 && !arrivals.has(tag); w++) await sleep(25);
      seen.push(arrivals.has(tag) ? arrivals.get(tag) - t0 : NaN);
      if (!arrivals.has(tag)) console.log(`    ${tag} did not arrive live`);
      await sleep(120);
    }
    const a = stats(saved), b = stats(seen);
    results.push({ what: info.label, browser: info.browser, saved: a, monitor: b, strike: info.strike });
    console.log(`  ${info.label.padEnd(18)} saved p50 ${ms(a.p50).padStart(7)}  on monitor p50 ${ms(b.p50).padStart(7)}  p95 ${ms(b.p95).padStart(7)}`);
    if (b.n < saved.length) findings.push(`${info.label}: ${saved.length - b.n} of ${saved.length} never reached the monitor`);
  }

  // The monitor's safety net: the same query its fifteen-second refresh runs.
  // Whatever the live feed dropped must be in here.
  {
    const t0 = now();
    const { data: back, error } = await teacher.client
      .from("flags")
      .select("id, session_id, type, strike_number, occurred_at, resolution, question_id, detail")
      .in("session_id", [sitting.id]);
    const took = now() - t0;
    const got = new Set((back ?? []).map((f) => f.detail));
    const lost = sent.filter((t) => !got.has(t));
    const dropped = sent.filter((t) => !arrivals.has(t)).length;
    if (error) findings.push("safety-net refresh: " + error.message);
    else if (lost.length) findings.push(`safety-net refresh missed ${lost.length} flag(s): ${lost.join(", ")}`);
    results.push({ what: "Monitor safety-net refresh", browser: "every 15 s", saved: stats([took]), monitor: null });
    console.log(`\n  safety-net refresh: ${sent.length - lost.length} of ${sent.length} flags found in ${ms(took)}${dropped ? `, recovering the ${dropped} the live feed dropped` : ""}`);
    // A flag the live feed dropped but the refresh finds is covered: the
    // teacher sees it within fifteen seconds. Only one the refresh cannot see
    // is a finding.
    if (!lost.length) {
      for (let i = findings.length - 1; i >= 0; i--) {
        if (/never reached the monitor/.test(findings[i])) {
          console.log(`  (${findings[i]}; recovered by the safety net)`);
          findings.splice(i, 1);
        }
      }
    }
  }

  console.log(`\n== The rest of a sitting ==`);
  {
    const rtt = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = now();
      const { error } = await student.client.from("answers").upsert(
        { session_id: sitting.id, question_id: q.id, response: i % 2 ? "Fast" : "Slow" },
        { onConflict: "session_id,question_id" },
      );
      if (error) { findings.push("answer save: " + error.message); break; }
      rtt.push(now() - t0);
    }
    const a = stats(rtt);
    results.push({ what: "Answer saved", browser: "700 ms after the last keystroke", saved: a, monitor: null });
    console.log(`  Answer saved       write p50 ${ms(a.p50)} (plus the 700 ms typing pause)`);
  }
  {
    const opened = [];
    for (let i = 0; i < 3; i++) {
      const t0 = now();
      const { error } = await student.client.rpc("begin_screen_recording", { p_session_id: sitting.id, p_mime_type: "video/webm" });
      if (error) { findings.push("begin recording: " + error.message); break; }
      opened.push(now() - t0);
    }
    const a = stats(opened);
    results.push({ what: "Recording opened", browser: "after the student picks a screen", saved: a, monitor: null });
    console.log(`  Recording opened   p50 ${ms(a.p50)}`);
  }
  {
    // A thirty-second piece at the recorder's cap is at most ~940 KB; a still
    // exam screen is usually far less. Upload the worst case.
    const piece = new Blob([new Uint8Array(940 * 1024)], { type: "video/webm" });
    const up = [];
    for (let i = 0; i < 3; i++) {
      const p = `${sitting.id}/speed-${i}.webm`;
      const t0 = now();
      const { error } = await student.client.storage.from("screen-recordings").upload(p, piece, { contentType: "video/webm" });
      if (error) { findings.push("upload: " + error.message); break; }
      up.push(now() - t0);
      made.files.push(p);
    }
    const a = stats(up);
    results.push({ what: "Video piece uploaded", browser: "every 30 seconds", saved: a, monitor: null });
    console.log(`  30 s piece upload  p50 ${ms(a.p50)} for 940 KB`);

    const links = [];
    for (let i = 0; i < 3 && made.files.length; i++) {
      const t0 = now();
      const { data, error } = await teacher.client.storage.from("screen-recordings").createSignedUrls(made.files, 7200);
      if (error || !data?.length) { findings.push("teacher link: " + (error?.message ?? "none")); break; }
      links.push(now() - t0);
    }
    const b = stats(links);
    results.push({ what: "Teacher opens the video", browser: "when the review page loads", saved: b, monitor: null });
    console.log(`  Teacher video link p50 ${ms(b.p50)}`);
  }

  await teacher.client.removeChannel(channel);

  // --- the report ---
  console.log("\n== Summary ==\n");
  const rows = [["Safeguard", "In the browser", "Saved (p50)", "On teacher's monitor (p50 / p95)", "Counts as a warning"]];
  for (const r of results) {
    rows.push([
      r.what,
      r.browser,
      ms(r.saved.p50),
      r.monitor ? `${ms(r.monitor.p50)} / ${ms(r.monitor.p95)}` : "n/a",
      r.strike === undefined ? "" : r.strike ? "yes" : "no (evidence)",
    ]);
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c]).length)));
  for (const [i, r] of rows.entries()) {
    console.log("  " + r.map((cell, c) => String(cell).padEnd(widths[c])).join("  "));
    if (i === 0) console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
  }

  const slow = results.filter((r) => r.monitor && r.monitor.p95 > 1500);
  if (slow.length) findings.push(`slower than 1.5 s to reach the monitor at p95: ${slow.map((r) => r.what).join(", ")}`);
} catch (e) {
  findings.push("run stopped: " + (e?.message ?? e));
} finally {
  console.log("\n== Cleanup ==");
  if (made.files.length) await svc.storage.from("screen-recordings").remove(made.files);
  for (const id of made.exams) {
    await svc.from("exams").update({ status: "ARCHIVED" }).eq("id", id);
    const { data: ss } = await svc.from("exam_sessions").select("id").eq("exam_id", id);
    for (const s of ss ?? []) {
      await svc.from("flags").delete().eq("session_id", s.id);
      await svc.from("answers").delete().eq("session_id", s.id);
    }
    await svc.from("exam_sessions").delete().eq("exam_id", id);
    const { data: qq } = await svc.from("questions").select("id").eq("exam_id", id);
    for (const qq1 of qq ?? []) await svc.from("question_answers").delete().eq("question_id", qq1.id);
    await svc.from("questions").delete().eq("exam_id", id);
    await svc.from("exams").delete().eq("id", id);
  }
  let stuck = 0;
  for (const id of made.users) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) stuck++;
  }
  console.log(stuck ? `  ${stuck} test account(s) could not be removed — look for sp- in Accounts` : "  everything removed");
  console.log(findings.length ? `\nFindings:\n${findings.map((f) => "  - " + f).join("\n")}` : "\nNo findings.");
  process.exit(findings.length ? 1 : 0);
}
