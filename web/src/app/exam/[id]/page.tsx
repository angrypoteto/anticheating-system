import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseLockdown, parseTimer } from "@/lib/exam-config";
import { choiceOrderSeed, questionOrderSeed, seededShuffle } from "@/lib/shuffle";
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
    .select("id, status, started_at, score")
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
    return (
      <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
        <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            {exam.title}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            You have already submitted this exam.
            {existing.score != null ? ` Score: ${existing.score}%` : ""}
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

  let session = existing;
  if (!session) {
    const { data: created, error } = await supabase
      .from("exam_sessions")
      .insert({ exam_id: id, student_id: user.id, status: "IN_PROGRESS" })
      .select("id, status, started_at, score")
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

  return (
    <ExamRunner
      sessionId={session.id}
      examTitle={exam.title}
      questions={questions}
      timer={parseTimer(exam.timer_config)}
      lockdown={parseLockdown(exam.lockdown_config)}
      startedAt={session.started_at}
      savedAnswers={savedAnswers}
    />
  );
}
