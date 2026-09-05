import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseLockdown, parseTimer } from "@/lib/exam-config";
import { choiceOrderSeed, questionOrderSeed, seededShuffle } from "@/lib/shuffle";
import { describeFlag, explainSubmission, parseReason } from "@/lib/submission";
import { ExamRunner, type RunnerQuestion } from "./runner";

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("STUDENT", "INSTRUCTOR", "ADMIN");
  const { id } = await params;
  const supabase = await createClient();

  // RLS limits this to PUBLISHED exams in the student's own section.
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, status, timer_config, lockdown_config, opens_at, closes_at")
    .eq("id", id)
    .maybeSingle();

  if (!exam) notFound();

  const nowMs = Date.now();
  const notYet = exam.opens_at && new Date(exam.opens_at).getTime() > nowMs;
  const over = exam.closes_at && new Date(exam.closes_at).getTime() <= nowMs;
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    });

  const { data: existing } = await supabase
    .from("exam_sessions")
    .select("id, status, started_at, score, submitted_reason")
    .eq("exam_id", id)
    .eq("student_id", user.id)
    .maybeSingle();

  // The window is enforced by row-level security; this is so a student sees a
  // sentence instead of a failed insert.
  if ((notYet || over) && !existing) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
        <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            {exam.title}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {notYet
              ? `This exam opens ${when(exam.opens_at!)}. Come back then — the link will still work.`
              : `This exam closed ${when(exam.closes_at!)} and can no longer be taken.`}
          </p>
          <a
            href="/"
            className="mt-6 inline-block text-sm text-gray-600 underline underline-offset-4 dark:text-gray-400"
          >
            Back to home
          </a>
        </div>
      </main>
    );
  }

  if (existing && existing.status !== "IN_PROGRESS") {
    const lockdown = parseLockdown(exam.lockdown_config);
    const reason = parseReason(existing.submitted_reason);

    // Only worth fetching when the ending is one the student may want to argue
    // with. Everything else needs no evidence.
    const [{ data: strikes }, { data: log }] =
      reason === "STRIKES"
        ? await Promise.all([
            supabase.rpc("my_strikes", { p_session_id: existing.id }),
            supabase.rpc("my_strike_log", { p_session_id: existing.id }),
          ])
        : [{ data: 0 }, { data: [] }];

    const said = explainSubmission(reason, {
      strikes: typeof strikes === "number" ? strikes : 0,
      maxStrikes: lockdown.maxStrikes,
    });
    const warnings = (log ?? []) as { kind: string; at: string }[];

    return (
      <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
        <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            {exam.title}
          </h1>

          <p
            className={`mt-4 text-base font-medium ${
              said.blamed
                ? "text-amber-800 dark:text-amber-300"
                : "text-gray-900 dark:text-gray-100"
            }`}
          >
            {said.headline}
          </p>
          {said.detail ? (
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {said.detail}
            </p>
          ) : null}

          {warnings.length ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                What was recorded
              </p>
              <ol className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200">
                {warnings.map((w, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="tabular-nums opacity-60">{i + 1}.</span>
                    <span>
                      You {describeFlag(w.kind)}
                      <span className="opacity-60"> — {when(w.at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <dl className="mt-6 flex gap-8 border-t border-gray-200 pt-4 text-sm dark:border-gray-800">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Score</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {existing.score != null ? `${existing.score}%` : "—"}
              </dd>
            </div>
          </dl>

          <a
            href="/"
            className="mt-6 inline-block text-sm text-gray-600 underline underline-offset-4 dark:text-gray-400"
          >
            Back to home
          </a>
        </div>
      </main>
    );
  }

  let session = existing;
  if (!session) {
    const { data: created, error } = await supabase
      .from("exam_sessions")
      .insert({ exam_id: id, student_id: user.id, status: "IN_PROGRESS" })
      .select("id, status, started_at, score, submitted_reason")
      .single();
    if (error) redirect("/?error=session");
    session = created;
  }

  const { data: rows } = await supabase
    .from("questions")
    .select("id, type, prompt, choices")
    .eq("exam_id", id)
    .order("order");

  // Order is derived from the session id rather than stored, so it stays stable
  // across reloads and can be reproduced later when reviewing the submission.
  const ordered = seededShuffle(rows ?? [], questionOrderSeed(session.id));
  const questions: RunnerQuestion[] = ordered.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    choices: q.choices
      ? seededShuffle(q.choices as string[], choiceOrderSeed(session.id, q.id))
      : null,
  }));

  const { data: saved } = await supabase
    .from("answers")
    .select("question_id, response")
    .eq("session_id", session.id);

  const savedAnswers = Object.fromEntries(
    (saved ?? []).map((a) => [a.question_id, String(a.response ?? "")]),
  );

  // Warnings already standing against this sitting. A student cannot read the
  // flags table — they should not get to audit what the proctor saw — so the
  // count comes from a function that will only ever answer about their own
  // sitting. Without it a reload started the tally again at zero, which both
  // misled an honest student and handed a dishonest one a way to clear it.
  const { data: strikes } = await supabase.rpc("my_strikes", {
    p_session_id: session.id,
  });

  return (
    <ExamRunner
      sessionId={session.id}
      examTitle={exam.title}
      questions={questions}
      timer={parseTimer(exam.timer_config)}
      lockdown={parseLockdown(exam.lockdown_config)}
      startedAt={session.started_at}
      savedAnswers={savedAnswers}
      initialStrikes={typeof strikes === "number" ? strikes : 0}
    />
  );
}
