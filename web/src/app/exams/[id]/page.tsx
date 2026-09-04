import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseLockdown, parseTimer } from "@/lib/exam-config";
import { QuestionForm, QuestionRow, SettingsForm } from "./editor";
import { ExamPreview } from "./preview";
import { ClassTargets, PublishControls } from "./publish";
import { ShareLink } from "./share";
import { ExamWindow } from "./window";
import { siteUrl } from "@/lib/site-url";
import { classesEnabled } from "@/lib/settings";

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
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, status, section_id, timer_config, lockdown_config, share_token, opens_at, closes_at")
    .eq("id", id)
    .maybeSingle();

  if (!exam) notFound();

  const [{ data: questions }, { data: targets }, { data: myClasses }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, type, prompt, choices, question_answers(correct_answer)")
      .eq("exam_id", id)
      .order("order"),
    supabase.from("exam_sections").select("section_id").eq("exam_id", id),
    // Admins can deliver to any class; an instructor only to their own.
    me.role === "ADMIN"
      ? supabase.from("sections").select("id, name, subject").order("subject").order("name")
      : supabase.from("sections").select("id, name, subject").eq("instructor_id", me.id).order("subject").order("name"),
  ]);

  const timer = parseTimer(exam.timer_config);
  const lockdown = parseLockdown(exam.lockdown_config);
  const published = exam.status === "PUBLISHED";
  const shareUrl = `${await siteUrl()}/e/${exam.share_token}`;

  // The same rule the database enforces, so the badge cannot claim the exam is
  // open while a student is being turned away.
  const nowMs = Date.now();
  const examIsOpen =
    published &&
    (!exam.opens_at || new Date(exam.opens_at).getTime() <= nowMs) &&
    (!exam.closes_at || new Date(exam.closes_at).getTime() > nowMs);
  const selectedClasses = (targets ?? []).map((t) => t.section_id);
  const useClasses = await classesEnabled();
  const qs = questions ?? [];

  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <Link
            href={me.role === "ADMIN" ? "/admin/exams" : "/teacher/exams"}
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← All exams &amp; quizzes
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
                {exam.title}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {qs.length} question{qs.length === 1 ? "" : "s"} ·{" "}
                {selectedClasses.length} class{selectedClasses.length === 1 ? "" : "es"} ·{" "}
                {exam.status.toLowerCase()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
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
              <PublishControls
                examId={exam.id}
                status={exam.status}
                questionCount={qs.length}
                classCount={selectedClasses.length}
              />
            </div>
          </div>
        </header>

        {published ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            This exam is published, so its questions and answer keys are frozen and
            it cannot return to draft. Archive it to withdraw it from students.
          </div>
        ) : null}

        <ShareLink url={shareUrl} live={published} linkOnly={!useClasses} />

        <ExamWindow
          examId={exam.id}
          opensAt={exam.opens_at}
          closesAt={exam.closes_at}
          isOpen={examIsOpen}
          published={published}
        />

        {/* Editor on the left, the student's view on the right. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="space-y-6">
            <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="border-b border-gray-200 p-6 dark:border-gray-800">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">Questions</h2>
              </div>
              {qs.length ? (
                <ul>
                  {qs.map((q, i) => (
                    <QuestionRow
                      key={q.id}
                      examId={exam.id}
                      index={i}
                      locked={published}
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
                <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No questions yet.</p>
              )}
            </section>

            {!published ? (
              <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-50">
                  Add question
                </h2>
                <QuestionForm examId={exam.id} />
              </section>
            ) : null}

            <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-50">Settings</h2>
              <SettingsForm
                examId={exam.id}
                title={exam.title}
                timer={timer}
                lockdown={lockdown}
              />
            </section>
          </div>

          {/* Sticky so it stays beside the questions while they scroll. */}
          <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
            <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Student preview
              </h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                Exactly what a student meets, shuffled.
              </p>
              <ExamPreview
                title={exam.title}
                questions={qs.map((q) => ({
                  id: q.id,
                  type: q.type,
                  prompt: q.prompt,
                  choices: q.choices as string[] | null,
                }))}
                timer={timer}
                lockdown={lockdown}
              />
            </section>

            {useClasses ? (
              <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Classes
              </h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                One paper can go to every class you teach.
              </p>
              <ClassTargets
                examId={exam.id}
                allClasses={myClasses ?? []}
                selected={selectedClasses}
                locked={published}
              />
            </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
