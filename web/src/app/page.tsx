import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Landing } from "./landing";
import { createClient } from "@/lib/supabase/server";

async function StudentExams() {
  const supabase = await createClient();
  // RLS returns only PUBLISHED exams for this student's section.
  const [{ data: exams }, { data: sessions }] = await Promise.all([
    supabase.from("exams").select("id, title").order("updated_at", { ascending: false }),
    supabase.from("exam_sessions").select("exam_id, status, score"),
  ]);

  const byExam = new Map((sessions ?? []).map((s) => [s.exam_id, s]));

  if (!exams?.length) {
    return (
      <p className="mt-2">
        Your assigned exams will appear here once an instructor publishes one.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-2">
      {exams.map((e) => {
        const session = byExam.get(e.id);
        const finished = session && session.status !== "IN_PROGRESS";
        return (
          <li
            key={e.id}
            className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 dark:border-gray-700"
          >
            <span className="text-gray-900 dark:text-gray-100">{e.title}</span>
            {finished ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                submitted{session.score != null ? ` · ${session.score}%` : ""}
              </span>
            ) : (
              <Link
                href={`/exam/${e.id}`}
                className="text-sm font-medium text-gray-900 underline underline-offset-4 dark:text-gray-100"
              >
                {session ? "Resume" : "Start"}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function Home() {
  const profile = await getCurrentUser();
  // Visitors get the landing page; signed-in users get their dashboard.
  if (!profile) return <Landing />;

  const role = profile.role as string;

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
              Proctorly
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Signed in as {profile.email} · {role.toLowerCase()}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {role === "STUDENT" ? "Your exams" : "Getting started"}
          </p>
          {role === "ADMIN" ? (
            <p className="mt-2">
              Manage accounts and sections in the{" "}
              <Link
                href="/admin"
                className="font-medium text-gray-900 underline underline-offset-4 dark:text-gray-100"
              >
                admin console
              </Link>
              , or build exams in the{" "}
              <Link
                href="/exams"
                className="font-medium text-gray-900 underline underline-offset-4 dark:text-gray-100"
              >
                exam builder
              </Link>
              .
            </p>
          ) : role === "INSTRUCTOR" ? (
            <p className="mt-2">
              Build and publish exams in the{" "}
              <Link
                href="/exams"
                className="font-medium text-gray-900 underline underline-offset-4 dark:text-gray-100"
              >
                exam builder
              </Link>
              .
            </p>
          ) : (
            <StudentExams />
          )}
        </section>
      </div>
    </main>
  );
}
