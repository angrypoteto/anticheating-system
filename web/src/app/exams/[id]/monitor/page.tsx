import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LiveMonitor, type FlagRow, type SessionRow } from "./live";

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
    .select("id, student_id, status, started_at, submitted_at, score")
    .eq("exam_id", id)
    .order("started_at");

  const sessionIds = (sessions ?? []).map((s) => s.id);

  const [{ data: flags }, { data: students }, { data: questions }] = await Promise.all([
    sessionIds.length
      ? supabase
          .from("flags")
          .select("id, session_id, type, strike_number, occurred_at, resolution, question_id")
          .in("session_id", sessionIds)
          .order("occurred_at", { ascending: false })
      : Promise.resolve({ data: [] as FlagRow[] }),
    supabase.from("users").select("id, email, full_name"),
    supabase.from("questions").select("id, prompt").eq("exam_id", id).order("order"),
  ]);

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
          <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-50">
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
          questionLabels={questionLabels}
        />
      </div>
    </main>
  );
}
