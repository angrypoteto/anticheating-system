import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Landing } from "./landing";
import { createClient } from "@/lib/supabase/server";
import { classLabel } from "@/lib/classes";
import { JoinClassForm } from "./join-class";
import { StudentExams } from "./student-exams";
import { classesEnabled, classSelfJoinAllowed } from "@/lib/settings";
import { ShieldMark } from "@/components/auth-shell";

/** The subjects this student has joined; RLS returns only their own. */
async function MyClasses() {
  const supabase = await createClient();
  const selfJoin = await classSelfJoinAllowed();
  const { data: sections } = await supabase
    .from("sections")
    .select("id, name, subject")
    .order("subject")
    .order("name");

  return (
    <div className="mt-3">
      {sections?.length ? (
        <ul className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <li
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              {classLabel(s)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-500 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/50 dark:text-slate-400 dark:ring-slate-700/50">
          {selfJoin
            ? "You have not joined a class yet. Enter a class code below."
            : "You are not in a class yet. Your teacher will add you — exams appear here once they do."}
        </p>
      )}
      {selfJoin ? (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <JoinClassForm />
        </div>
      ) : null}
    </div>
  );
}

export default async function Home() {
  const profile = await getCurrentUser();
  // Visitors get the landing page; signed-in users get their dashboard.
  if (!profile) return <Landing />;

  const role = profile.role as string;

  // Staff homes are their consoles — landing on a page whose only content is a
  // link to the console is a hop for nothing.
  if (role === "ADMIN") redirect("/admin");
  if (role === "INSTRUCTOR") redirect("/teacher");

  const initial = (profile.email?.[0] ?? "S").toUpperCase();

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-8">
          <ShieldMark className="h-8 w-8" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Proctorly
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Signed in as {profile.email} · {role.toLowerCase()}
            </p>
          </div>
          <form action="/auth/signout" method="post" className="ml-auto">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div className="overflow-hidden rounded-2xl bg-slate-950 p-6 text-white sm:p-7 dark:bg-gradient-to-br dark:from-indigo-950 dark:to-slate-950">
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute inset-0 -m-6 overflow-hidden">
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-600/40 blur-[70px]" />
              <div className="absolute -bottom-24 left-1/3 h-48 w-72 rounded-full bg-violet-600/25 blur-[70px]" />
            </div>
            <div className="relative flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold ring-1 ring-inset ring-white/15">
                {initial}
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Ready when you are.
                </h1>
                <p className="mt-0.5 text-sm text-slate-300">
                  Your exams appear below the moment your teacher publishes them.
                </p>
              </div>
              <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/25 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Lockdown ready
              </span>
            </div>
          </div>
        </div>

        {role === "STUDENT" && (await classesEnabled()) ? (
          <section className="card-elev mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-7 dark:border-slate-800 dark:bg-slate-900">
            <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Your subjects
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                Enrolled
              </span>
            </p>
            <MyClasses />
          </section>
        ) : null}

        <section className="card-elev mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-7 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {role === "STUDENT" ? "Your exams & quizzes" : "Getting started"}
          </p>
          {role === "INSTRUCTOR" ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Build and publish exams in the{" "}
              <Link
                href="/exams"
                className="font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
              >
                exam builder
              </Link>
              .
            </p>
          ) : (
            <StudentExams />
          )}
        </section>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Fullscreen + focus tracking run automatically when you start · 3 strikes submit the exam
        </p>
      </div>
    </main>
  );
}
