import Link from "next/link";
import { ExamBuilder, BUILDER_BLURB } from "../builder";

export const dynamic = "force-dynamic";

/** Building a new exam is its own screen; /exams is the list of existing ones. */
export default function NewExamPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <Link
            href="/exams"
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← All exams
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-50">
            Generate an exam or quiz
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{BUILDER_BLURB}</p>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <ExamBuilder />
        </section>
      </div>
    </main>
  );
}
