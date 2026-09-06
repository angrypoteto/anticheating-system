import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isIncomplete, whatIsMissing } from "@/lib/onboarding";
import { Landing } from "./landing";
import { ShieldMark } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { classLabel } from "@/lib/classes";
import { JoinClassForm } from "./join-class";
import { StudentExams } from "./student-exams";
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

  // What an admin has set up that this student is not already on. Read through
  // a function rather than the table: the policy shows a student only the
  // classes they are in, which is no use for choosing another.
  const { data: pickable } = selfJoin
    ? await supabase.rpc("selectable_sections")
    : { data: [] };
  const options = (
    (pickable ?? []) as { id: string; subject: string | null; name: string; instructor: string | null }[]
  ).map((c) => ({ id: c.id, label: classLabel(c), instructor: c.instructor }));

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
            ? "You have not joined a class yet. Choose your section below."
            : "You are not in a class yet. Your teacher will add you — exams appear here once they do."}
        </p>
      )}
      {selfJoin ? (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
          <JoinClassForm sections={options} />
        </div>
      ) : null}
    </div>
  );
}

export default async function Home() {
  const profile = await getCurrentUser();
  // Visitors get the landing page; signed-in users get their dashboard.
  if (!profile) return <Landing />;

  // A student's home is rendered here rather than behind requireRole, so it has
  // to apply the same gate itself — otherwise the one page everybody lands on
  // after signing in with Google would be the one that never asks their name.
  if (isIncomplete(await whatIsMissing(profile))) redirect("/welcome");

  const role = profile.role as string;

  // Staff homes are their consoles — landing on a page whose only content is a
  // link to the console is a hop for nothing.
  if (role === "ADMIN") redirect("/admin");
  if (role === "INSTRUCTOR") redirect("/teacher");

  // A student has one destination and one action, so there is no rail here —
  // navigation would be furniture around an empty room. The bar carries the
  // mark and who they are; the page opens on the thing they came for.
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0];

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="flex items-center justify-between bg-gray-900 px-6 py-3.5 text-white sm:px-10">
        <div className="flex items-center gap-2.5">
          <ShieldMark className="h-5 w-5" />
          <span className="font-semibold tracking-tight">Proctorly</span>
        </div>
        <div className="flex items-center gap-3.5 text-[13px] text-teal-200">
          <span className="hidden truncate sm:inline">{profile.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-[13px] text-teal-200 underline underline-offset-4 transition hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-9 sm:px-10">
        <header>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-[15px] text-gray-500 dark:text-gray-400">
            Everything set for you is below. Anything open right now comes first.
          </p>
        </header>

        {role === "STUDENT" && (await classesEnabled()) ? (
          <section className="mt-8 rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
            <p className="font-medium text-gray-900 dark:text-gray-100">
              Your subjects
            </p>
            <MyClasses />
          </section>
        ) : null}

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 sm:p-8 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {role === "STUDENT" ? "Your exams & quizzes" : "Getting started"}
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
