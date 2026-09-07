import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseLockdown, parseTimer } from "@/lib/exam-config";
import { choiceOrderSeed, questionOrderSeed, seededShuffle } from "@/lib/shuffle";
import { describeFlag, explainSubmission, parseReason } from "@/lib/submission";
import { StudentBar } from "@/components/student-bar";
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
    .select("id, status, started_at, submitted_at, score, submitted_reason")
    .eq("exam_id", id)
    .eq("student_id", user.id)
    .maybeSingle();

  // The window is enforced by row-level security; this is so a student sees a
  // sentence instead of a failed insert.
  if ((notYet || over) && !existing) {
    return (
      <main className="min-h-screen bg-gray-50">
        <StudentBar email={user.email} name={user.full_name} />
        <div className="mx-auto max-w-[800px] px-6 pt-9 pb-12 sm:px-10">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-gray-900">
            {exam.title}
          </h1>
          <p className="mt-2.5 max-w-[62ch] text-[15px] leading-relaxed text-gray-500">
            {notYet
              ? `This exam opens ${when(exam.opens_at!)}. Come back then — the link will still work.`
              : `This exam closed ${when(exam.closes_at!)} and can no longer be taken.`}
          </p>
          <Link
            href="/"
            className="mt-7 inline-block border-b border-gray-200 pb-px text-sm text-gray-700 hover:border-gray-400"
          >
            Back to my exams
          </Link>
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

    // What the figures are made of. A percentage on its own is not a result:
    // "32%" and "32%, pass mark 75%, seven left blank" are different claims,
    // and only the second one can be acted on.
    const [{ count: askedCount }, { count: answeredCount }, { data: marks }] =
      await Promise.all([
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("exam_id", id),
        supabase
          .from("answers")
          .select("id", { count: "exact", head: true })
          .eq("session_id", existing.id),
        supabase
          .from("system_settings")
          .select("pass_threshold")
          .eq("id", true)
          .maybeSingle(),
      ]);

    const asked = askedCount ?? 0;
    const answered = answeredCount ?? 0;
    const blank = Math.max(0, asked - answered);
    const passMark = Number(marks?.pass_threshold ?? 75);
    const timer = parseTimer(exam.timer_config);

    const minutes =
      existing.submitted_at && existing.started_at
        ? Math.max(
            0,
            Math.round(
              (new Date(existing.submitted_at).getTime() -
                new Date(existing.started_at).getTime()) /
                60000,
            ),
          )
        : null;

    return (
      <main className="min-h-screen bg-gray-50">
        <StudentBar email={user.email} name={user.full_name} />

        <div className="mx-auto max-w-[800px] px-6 pt-9.5 pb-12 sm:px-10">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-gray-900">
            {exam.title}
          </h1>

          <div className="mt-6 overflow-hidden rounded-[14px] border border-gray-200 bg-white">
            {/* The one coloured thing on the page, and it reports what the
                system saw rather than what the student is. */}
            <div
              className={`flex items-start gap-3.5 border-b px-6.5 py-5 ${
                said.blamed
                  ? "border-amber-200 bg-amber-50"
                  : "border-gray-100 bg-gray-50/60"
              }`}
            >
              {said.blamed ? (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className="mt-0.5 shrink-0"
                >
                  <path d="M12 8.5v5" stroke="#8A5A00" strokeWidth="1.9" strokeLinecap="round" />
                  <circle cx="12" cy="17" r="1.15" fill="#8A5A00" />
                  <path
                    d="M10.6 3.9 2.9 17.4A1.6 1.6 0 0 0 4.3 19.8h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z"
                    stroke="#8A5A00"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              <div>
                <p
                  className={`font-serif text-[19px] font-semibold tracking-tight ${
                    said.blamed ? "text-amber-900" : "text-gray-900"
                  }`}
                >
                  {said.headline}
                </p>
                {said.detail ? (
                  <p
                    className={`mt-1.5 max-w-[60ch] text-sm leading-relaxed ${
                      said.blamed ? "text-amber-800" : "text-gray-600"
                    }`}
                  >
                    {said.detail}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3">
              <div className="border-b border-gray-100 px-6.5 py-5.5 sm:border-r sm:border-b-0">
                <p className="text-[11px] font-medium tracking-[0.07em] text-gray-500 uppercase">
                  Score
                </p>
                <p className="mt-2 text-[32px] leading-none font-semibold tracking-tight tabular-nums text-gray-900">
                  {existing.score != null ? `${existing.score}%` : "—"}
                </p>
                <p className="mt-1.5 text-[12.5px] text-gray-500">pass mark {passMark}%</p>
              </div>

              <div className="border-b border-gray-100 px-6.5 py-5.5 sm:border-r sm:border-b-0">
                <p className="text-[11px] font-medium tracking-[0.07em] text-gray-500 uppercase">
                  Answered
                </p>
                <p className="mt-2 text-[32px] leading-none font-semibold tracking-tight tabular-nums text-gray-900">
                  {answered}
                  <span className="text-[19px] font-medium text-gray-500"> of {asked}</span>
                </p>
                <p className="mt-1.5 text-[12.5px] text-gray-500">
                  {blank ? `${blank} left blank when it ended` : "nothing left blank"}
                </p>
              </div>

              <div className="px-6.5 py-5.5">
                <p className="text-[11px] font-medium tracking-[0.07em] text-gray-500 uppercase">
                  Time used
                </p>
                <p className="mt-2 text-[32px] leading-none font-semibold tracking-tight tabular-nums text-gray-900">
                  {minutes ?? "—"}
                  <span className="text-[19px] font-medium text-gray-500"> min</span>
                </p>
                <p className="mt-1.5 text-[12.5px] text-gray-500">
                  {timer.totalMinutes ? `of the ${timer.totalMinutes} allowed` : "no time limit"}
                </p>
              </div>
            </div>

            {warnings.length ? (
              <div className="border-t border-gray-100 px-6.5 py-5">
                <p className="mb-3 text-[13px] font-medium tracking-[0.08em] text-gray-500 uppercase">
                  What was recorded
                </p>
                {warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-baseline gap-3.5 border-b border-dashed border-gray-200 py-2.25 text-[13.5px] last:border-b-0"
                  >
                    <span className="w-3.5 shrink-0 tabular-nums text-gray-500">
                      {warnings.length - i}.
                    </span>
                    <span className="flex-1 text-gray-900">You {describeFlag(w.kind)}</span>
                    <span className="font-mono text-xs text-gray-500">{when(w.at)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* The end of the experience, which is what it is remembered by. */}
          {said.blamed ? (
            <div className="mt-5.5 rounded-[14px] border border-teal-100 bg-white px-6.5 py-6 shadow-[0_1px_2px_rgba(13,21,36,0.04),0_8px_24px_-16px_rgba(13,21,36,0.25)]">
              <h2 className="font-serif text-xl font-semibold tracking-tight text-gray-900">
                If that was not what happened
              </h2>
              <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-gray-700">
                A dropped connection, a notification that stole focus and a second
                screen all look the same from here. Your teacher can let you sit it
                again — ask them, and show them the times above.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex items-center border-b border-gray-200 pb-px text-[13.5px] text-gray-700 hover:border-gray-400"
              >
                Back to my exams
              </Link>
            </div>
          ) : (
            <Link
              href="/"
              className="mt-6 inline-block border-b border-gray-200 pb-px text-sm text-gray-700 hover:border-gray-400"
            >
              Back to my exams
            </Link>
          )}
        </div>
      </main>
    );
  }

  let session = existing;
  if (!session) {
    const { data: created, error } = await supabase
      .from("exam_sessions")
      .insert({ exam_id: id, student_id: user.id, status: "IN_PROGRESS" })
      .select("id, status, started_at, submitted_at, score, submitted_reason")
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
