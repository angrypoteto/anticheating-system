import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ExamList } from "./list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exams & quizzes" };

export default async function ExamsPage() {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  // Admins live in the console, so send them back there rather than bouncing
  // them through "/" only to be redirected again.
  const backHref = me.role === "ADMIN" ? "/admin" : "/teacher";
  const buildHref = me.role === "ADMIN" ? "/admin/exams/new" : "/teacher/exams/new";

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex items-baseline justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-50">
            Exams &amp; quizzes
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href={buildHref}
              className="inline-flex h-[38px] items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700"
            >
              Generate an exam
            </Link>
            <Link
              href={backHref}
              className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Back
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Your exams
            </h2>
          </div>
          <ExamList />
        </section>
      </div>
    </main>
  );
}
