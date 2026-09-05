import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ExamList } from "./list";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  // Admins live in the console, so send them back there rather than bouncing
  // them through "/" only to be redirected again.
  const backHref = me.role === "ADMIN" ? "/admin" : "/teacher";
  const buildHref = me.role === "ADMIN" ? "/admin/exams/new" : "/teacher/exams/new";

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
              Exam builder
            </p>
            <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Exams &amp; quizzes
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href={buildHref}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgb(79_70_229/0.6)] transition hover:bg-indigo-700"
            >
              + Generate an exam
            </Link>
            <Link
              href={backHref}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Back
            </Link>
          </div>
        </header>

        <section className="card-elev overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Your exams
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">Drafts stay invisible until you publish them.</p>
          </div>
          <ExamList />
        </section>
      </div>
    </main>
  );
}
