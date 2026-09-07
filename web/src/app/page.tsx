import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isIncomplete, whatIsMissing } from "@/lib/onboarding";
import { Landing } from "./landing";
import { ShieldMark } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { classLabel } from "@/lib/classes";
import { JoinClassForm } from "./join-class";
import { StudentExams, loadMyExams } from "./student-exams";
import { classesEnabled, classSelfJoinAllowed } from "@/lib/settings";

/** A mortar board, for the subjects a student is on. */
function CapMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M4 8.5 12 5l8 3.5-8 3.5-8-3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M7.5 10.5v4.2c0 1.3 2 2.3 4.5 2.3s4.5-1 4.5-2.3v-4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The subjects this student is on, as a row of tags rather than a panel.
 *
 * These are context, not a task: they say which exams can reach you, and you
 * read them once. A bordered card with its own heading gave them the same
 * weight as the exam that is open right now, which is the one thing on this
 * page that actually wants doing.
 */
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
    <div className="mt-5 mb-7.5">
      <div className="flex flex-wrap items-center gap-2">
        {sections?.length ? (
          sections.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.75 rounded-full border border-accent-line bg-accent-soft px-3.25 py-1.5 text-[13px] font-medium text-[#0B5B57]"
            >
              <CapMark className="h-3.25 w-3.25" />
              {classLabel(s)}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-500">
            {selfJoin
              ? "You are not on a subject yet — add one to see its exams."
              : "You are not in a class yet. Your teacher will add you — exams appear here once they do."}
          </span>
        )}

        {selfJoin ? (
          <details className="group">
            <summary className="ml-1 cursor-pointer list-none text-[13px] text-teal-700 hover:underline hover:underline-offset-[3px] group-open:hidden">
              Add a section
            </summary>
            <div className="mt-3">
              <JoinClassForm sections={options} />
            </div>
          </details>
        ) : null}
      </div>
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
  const name = (profile.full_name ?? "").trim();
  const firstName = name.split(/\s+/)[0];
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0]!.toUpperCase())
      .join("") || (profile.email?.[0] ?? "?").toUpperCase();

  // Manila time, because that is the morning the student is having.
  const hour = Number(
    new Intl.DateTimeFormat("en-PH", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Manila",
    }).format(new Date()),
  );
  const partOfDay = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const { rows, error } = await loadMyExams();
  const openNow = rows.filter((r) => r.is_open && r.session_status !== "SUBMITTED").length;
  const taken = rows.filter((r) => r.session_status && r.session_status !== "IN_PROGRESS").length;

  // What the top of the page says depends on whether anything wants doing.
  const standing = error
    ? "Everything set for you is below."
    : openNow === 0
      ? taken
        ? "Nothing is open right now. Everything you have taken is below."
        : "Nothing is open right now. Exams appear here as your teachers publish them."
      : `${openNow === 1 ? "One exam is" : `${openNow} exams are`} open right now.${
          taken ? " Everything you have taken is below." : ""
        }`;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="flex h-15 items-center justify-between bg-teal-800 px-6 text-white sm:px-10">
        <div className="flex items-center gap-2.5">
          <ShieldMark className="h-5.25 w-5.25" />
          <span className="font-semibold tracking-tight">Proctorly</span>
        </div>
        <div className="flex items-center gap-3.5 text-[13px] text-teal-100">
          <span className="hidden truncate sm:inline">{profile.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-[13px] text-teal-100 underline underline-offset-4 transition hover:text-white"
            >
              Sign out
            </button>
          </form>
          <span
            aria-hidden
            className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white"
          >
            {initials}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-6 pt-9 pb-12 sm:px-10">
        <h1 className="font-serif text-[32px] font-semibold tracking-tight text-gray-900">
          {firstName ? `${partOfDay}, ${firstName}` : partOfDay}
        </h1>
        <p className="mt-1.75 text-[15px] text-gray-500">{standing}</p>

        {(await classesEnabled()) ? <MyClasses /> : <div className="mb-7.5" />}

        <StudentExams rows={rows} error={error} />
      </div>
    </main>
  );
}
