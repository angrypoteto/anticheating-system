import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classesEnabled } from "@/lib/settings";
import { classLabel } from "@/lib/classes";
import { LiveMonitor, type FlagRow, type SessionRow } from "./live";
import { PerQuestion } from "./per-question";

export default async function MonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;
  // Opened from the exam list, going "back" means the list — not the editor
  // you never visited. The editor's own link says where it came from.
  const { from } = await searchParams;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle();

  if (!exam) notFound();

  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select("id, student_id, status, started_at, submitted_at, score, reopened_until")
    .eq("exam_id", id)
    .order("started_at");

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const studentIds = [...new Set((sessions ?? []).map((s) => s.student_id))];

  const [{ data: flags }, { data: students }, { data: questions }] = await Promise.all([
    sessionIds.length
      ? supabase
          .from("flags")
          .select("id, session_id, type, strike_number, occurred_at, resolution, question_id")
          .in("session_id", sessionIds)
          .order("occurred_at", { ascending: false })
      : Promise.resolve({ data: [] as FlagRow[] }),
    // Named with the service role, for exactly the people sitting this paper.
    //
    // A teacher may read the users they teach, and "teach" means sharing a
    // class. Somebody who arrived by the share link shares none, so their row
    // was unreadable and the monitor fell back to printing a raw uuid at the
    // teacher whose exam they were sitting. Ownership of the exam is already
    // established above, by RLS, before this escalates.
    studentIds.length
      ? createAdminClient().from("users").select("id, email, full_name").in("id", studentIds)
      : Promise.resolve({ data: [] as { id: string; email: string; full_name: string | null }[] }),
    supabase.from("questions").select("id, prompt").eq("exam_id", id).order("order"),
  ]);

  // Which class each of these students is in, so the roll can be filtered down
  // to one section. Read through the caller's own client on purpose: an
  // instructor sees the rolls they teach and no others, and an admin sees all —
  // the same boundary everywhere else in the app draws.
  const useClasses = await classesEnabled();

  const [{ data: enrolments }, { data: sections }] =
    useClasses && studentIds.length
      ? await Promise.all([
          supabase.from("enrollments").select("student_id, section_id").in("student_id", studentIds),
          supabase.from("sections").select("id, name, subject"),
        ])
      : [{ data: [] }, { data: [] }];

  const labelOf = new Map(
    (sections ?? []).map((c: { id: string; name: string; subject: string | null }) => [
      c.id,
      classLabel(c),
    ]),
  );

  const studentClasses: Record<string, string[]> = {};
  for (const e of (enrolments ?? []) as { student_id: string; section_id: string }[]) {
    if (!labelOf.has(e.section_id)) continue; // a class this teacher cannot see
    (studentClasses[e.student_id] ??= []).push(e.section_id);
  }

  // Only classes somebody in this exam is actually in. Offering a filter that
  // can only ever return nothing is worse than offering none.
  const classOptions = [...new Set(Object.values(studentClasses).flat())]
    .map((id) => ({ id, label: labelOf.get(id) ?? "Unknown class" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const studentNames = Object.fromEntries(
    // A name, when they have set one. Watching forty rows of email addresses is
    // exactly when a teacher most needs to recognise a person.
    (students ?? []).map((u) => [u.id, u.full_name || u.email]),
  );

  // Numbering follows the instructor's authored order, not the student's
  // shuffled one — otherwise "Q3" would mean a different question per student.
  const questionLabels = Object.fromEntries(
    (questions ?? []).map((q, i) => [
      q.id,
      `Q${i + 1}: ${q.prompt.length > 55 ? q.prompt.slice(0, 55) + "…" : q.prompt}`,
    ]),
  );

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <Link
            href={
              from === "list"
                ? me.role === "ADMIN"
                  ? "/admin/exams"
                  : "/teacher/exams"
                : `/exams/${exam.id}`
            }
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            {from === "list" ? "← Back to exams & quizzes" : "← Back to exam"}
          </Link>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            {exam.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Live monitoring and results
          </p>
        </header>

        <LiveMonitor
          examId={exam.id}
          initialSessions={(sessions ?? []) as SessionRow[]}
          initialFlags={(flags ?? []) as FlagRow[]}
          studentNames={studentNames}
          studentClasses={studentClasses}
          classOptions={classOptions}
          questionLabels={questionLabels}
        />

        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
              How each question went
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Hardest first, by the share of people who answered it correctly. A
              question nobody got is usually the question, not the class.
            </p>
          </div>
          <PerQuestion examId={exam.id} />
        </section>
      </div>
    </main>
  );
}
