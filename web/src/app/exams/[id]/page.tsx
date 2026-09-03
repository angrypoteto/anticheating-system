import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseLockdown, parseTimer } from "@/lib/exam-config";
import { QuestionForm, QuestionRow, SettingsForm, StatusControls } from "./editor";

// PostgREST returns this embed as an object (question_id is question_answers'
// primary key, making it one-to-one) while supabase-js's inference types it as an
// array. Accept either, so neither a client-library nor an FK change breaks it.
function readAnswerKey(embed: unknown): unknown {
  const row = Array.isArray(embed) ? embed[0] : embed;
  return (row as { correct_answer?: unknown } | null | undefined)?.correct_answer ?? null;
}

export default async function ExamEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes this to exams in the instructor's own sections, so a missing row
  // means either "doesn't exist" or "not yours" — both are a 404 here.
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, status, section_id, timer_config, lockdown_config")
    .eq("id", id)
    .maybeSingle();

  if (!exam) notFound();

  // question_answers is a separate table so students can't read the key; instructors
  // pull it back in here via the relationship.
  const { data: questions } = await supabase
    .from("questions")
    .select("id, type, prompt, choices, question_answers(correct_answer)")
    .eq("exam_id", id)
    .order("order");

  const timer = parseTimer(exam.timer_config);
  const lockdown = parseLockdown(exam.lockdown_config);

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <Link
            href="/exams"
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← All exams
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
                {exam.title}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {exam.status.toLowerCase()} · {questions?.length ?? 0} question
                {questions?.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={`/exams/${exam.id}/generate`}
                className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Generate with AI
              </Link>
              <Link
                href={`/exams/${exam.id}/monitor`}
                className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Monitor &amp; results
              </Link>
              <StatusControls examId={exam.id} status={exam.status} />
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
              Questions
            </h2>
          </div>
          {questions?.length ? (
            <ul>
              {questions.map((q, i) => (
                <QuestionRow
                  key={q.id}
                  examId={exam.id}
                  index={i}
                  question={{
                    id: q.id,
                    type: q.type,
                    prompt: q.prompt,
                    choices: q.choices as string[] | null,
                    correct_answer: readAnswerKey(q.question_answers),
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
              No questions yet.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-50">
            Add question
          </h2>
          <QuestionForm examId={exam.id} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-50">
            Settings
          </h2>
          <SettingsForm
            examId={exam.id}
            title={exam.title}
            timer={timer}
            lockdown={lockdown}
          />
        </section>
      </div>
    </main>
  );
}
