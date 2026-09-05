import Link from "next/link";
import { ExamBuilder, BUILDER_BLURB } from "../builder";

export const dynamic = "force-dynamic";

/** Building a new exam is its own screen; /exams is the list of existing ones. */
export default function NewExamPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:p-8 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <Link
            href="/teacher/exams"
            className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← All exams &amp; quizzes
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Generate an exam or quiz
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{BUILDER_BLURB}</p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <ExamBuilder />
        </section>
      </div>
    </main>
  );
}
