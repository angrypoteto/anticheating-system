import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LiveMonitor, type FlagRow, type SessionRow } from "./live";

export default async function MonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;
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

  const [{ data: flags }, { data: students }] = await Promise.all([
    sessionIds.length
      ? supabase
          .from("flags")
          .select("id, session_id, type, strike_number, occurred_at, resolution")
          .in("session_id", sessionIds)
          .order("occurred_at", { ascending: false })
      : Promise.resolve({ data: [] as FlagRow[] }),
    supabase.from("users").select("id, email"),
  ]);

  const studentNames = Object.fromEntries(
    (students ?? []).map((u) => [u.id, u.email]),
  );

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <Link
            href={`/exams/${exam.id}`}
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← Back to exam
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
        />
      </div>
    </main>
  );
}
