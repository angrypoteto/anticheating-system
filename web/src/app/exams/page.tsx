import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ExamList } from "./list";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  // Admins live in the console, so send them back there rather than bouncing
  // them through "/" only to be redirected again.
  const backHref = me.role === "ADMIN" ? "/admin" : "/";
  const buildHref = me.role === "ADMIN" ? "/admin/exams/new" : "/exams/new";

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex items-baseline justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            Exams &amp; quizzes
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href={buildHref}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              Generate an exam
            </Link>
            <Link
              href={backHref}
              className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Back
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
              Your exams
            </h2>
          </div>
          <ExamList />
        </section>
      </div>
    </main>
  );
}
