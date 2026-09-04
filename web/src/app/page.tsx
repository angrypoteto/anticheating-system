import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Landing } from "./landing";
import { createClient } from "@/lib/supabase/server";
import { classLabel } from "@/lib/classes";
import { JoinClassForm } from "./join-class";
import { classesEnabled, classSelfJoinAllowed } from "@/lib/settings";

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
    <div className="mt-2">
      {sections?.length ? (
        <ul className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <li
              key={s.id}
              className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
            >
              {classLabel(s)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {selfJoin
            ? "You have not joined a class yet. Enter a class code below."
            : "You are not in a class yet. Your teacher will add you — exams appear here once they do."}
        </p>
      )}
      {selfJoin ? (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
          <JoinClassForm />
        </div>
      ) : null}
    </div>
  );
}

async function StudentExams() {
  const supabase = await createClient();
  // RLS returns only PUBLISHED exams reaching a class this student has joined.
  const [{ data: exams }, { data: sessions }] = await Promise.all([
    supabase.from("exams").select("id, title").order("updated_at", { ascending: false }),
    supabase.from("exam_sessions").select("exam_id, status, score"),
  ]);

  const byExam = new Map((sessions ?? []).map((s) => [s.exam_id, s]));

  if (!exams?.length) {
    return (
      <p className="mt-2">
        No exams yet. They appear here once a teacher publishes one for a
        subject you have joined.
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

  // An admin's home is the console — landing on a page whose only content is a
  // link to the console is a hop for nothing.
  if (role === "ADMIN") redirect("/admin");

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

        {role === "STUDENT" && (await classesEnabled()) ? (
          <section className="mt-8 rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
            <p className="font-medium text-gray-900 dark:text-gray-100">
              Your subjects
            </p>
            <MyClasses />
          </section>
        ) : null}

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {role === "STUDENT" ? "Your exams" : "Getting started"}
          </p>
          {role === "INSTRUCTOR" ? (
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
