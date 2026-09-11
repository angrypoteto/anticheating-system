import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classesEnabled } from "@/lib/settings";
import { classLabel } from "@/lib/classes";
import { parseTimer } from "@/lib/exam-config";
import { ConsoleShell } from "@/components/console-shell";
import { LiveMonitor, type FlagRow, type SessionRow } from "./live";
import { PerQuestion } from "./per-question";
import { CloseNow } from "./close-now";

/** Manila time, since that is where the exam is being sat. */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Manila",
  });

const length = (minutes: number) => {
  if (!minutes) return "no time limit";
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h === 1 ? "" : "s"}`;
};

/**
 * The tab says which paper this is, so half a dozen open at once are telling
 * them apart by name rather than by position.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("exams")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return { title: data?.title ? `${data.title} (live)` : "Live monitor" };
}

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
    .select(
      "id, title, status, section_id, timer_config, opens_at, closes_at, subjects(name), exam_sections(section_id)",
    )
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

  const [{ data: flags }, { data: students }, { data: questions }, { data: given }] =
    await Promise.all([
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
    // How many questions each sitting has answered so far. Counted here rather
    // than in the browser: an answer row is not readable by the teacher's
    // client, and the monitor only needs the tally.
    sessionIds.length
      ? supabase.from("answers").select("session_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as { session_id: string }[] }),
  ]);

  const answeredBySession: Record<string, number> = {};
  for (const a of (given ?? []) as { session_id: string }[]) {
    answeredBySession[a.session_id] = (answeredBySession[a.session_id] ?? 0) + 1;
  }

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

  // PostgREST types a to-one embed as an array; accept either.
  const subjectEmbed = exam.subjects as { name: string } | { name: string }[] | null;
  const subject = (Array.isArray(subjectEmbed) ? subjectEmbed[0] : subjectEmbed)?.name ?? null;

  const classIds = new Set<string>(
    ((exam.exam_sections ?? []) as { section_id: string }[]).map((t) => t.section_id),
  );
  if (exam.section_id) classIds.add(exam.section_id);
  const classNames = useClasses
    ? [...classIds].map((cid) => labelOf.get(cid)).filter((l): l is string => Boolean(l))
    : [];

  const timer = parseTimer(exam.timer_config);

  // Published is not open. The pill has to report the state a teacher would
  // act on, which is whether a student could start it this second.
  const nowMs = Date.now();
  const notYet = exam.opens_at && new Date(exam.opens_at).getTime() > nowMs;
  const over = exam.closes_at && new Date(exam.closes_at).getTime() <= nowMs;
  const windowState =
    exam.status !== "PUBLISHED" ? null : over ? "closed" : notYet ? "scheduled" : "open";

  const windowWord =
    windowState === "open"
      ? exam.closes_at
        ? `Open until ${clock(exam.closes_at)}`
        : "Open"
      : windowState === "scheduled"
        ? `Opens ${day(exam.opens_at!)}, ${clock(exam.opens_at!)}`
        : windowState === "closed"
          ? `Closed ${day(exam.closes_at!)}`
          : "Draft";

  const facts = [
    ...(classNames.length ? [classNames.join(", ")] : []),
    `${(questions ?? []).length} question${(questions ?? []).length === 1 ? "" : "s"}`,
    length(timer.totalMinutes),
  ];

  return (
    <ConsoleShell role={me.role as string} email={me.email}>
      <div className="space-y-6">
        <div>
          <Link
            href={
              from === "list"
                ? me.role === "ADMIN"
                  ? "/admin/exams"
                  : "/teacher/exams"
                : `/exams/${exam.id}`
            }
            className="text-[13px] text-gray-500 hover:text-gray-900"
          >
            {from === "list" ? "← Exams & quizzes" : "← Back to exam"}
          </Link>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-gray-200 pb-5">
          <div className="min-w-0">
            {subject ? (
              <span className="mb-1.5 block text-[12.5px] font-medium text-accent">
                {subject}
              </span>
            ) : null}
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
              {exam.title}
            </h1>
            <p className="mt-1.5 text-sm text-gray-500">
              {["Live monitoring and results", ...facts].join(", ")}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {windowState ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.75 py-1 text-xs font-medium whitespace-nowrap ${
                  windowState === "open"
                    ? "border-green-200 bg-green-50 text-green-800"
                    : windowState === "scheduled"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-gray-200 bg-gray-100 text-gray-700"
                }`}
              >
                {windowState === "open" ? (
                  <span aria-hidden className="h-1.75 w-1.75 rounded-full bg-current" />
                ) : null}
                {windowWord}
              </span>
            ) : null}
            {windowState === "open" ? <CloseNow examId={exam.id} /> : null}
          </div>
        </header>

        <LiveMonitor
          examId={exam.id}
          initialSessions={(sessions ?? []) as SessionRow[]}
          initialFlags={(flags ?? []) as FlagRow[]}
          studentNames={studentNames}
          studentClasses={studentClasses}
          classOptions={classOptions}
          questionLabels={questionLabels}
          answeredBySession={answeredBySession}
          askedCount={(questions ?? []).length}
        />

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-6 py-5">
            <h2 className="text-[17px] font-semibold tracking-tight text-gray-900">
              How each question went
            </h2>
            <p className="mt-1.25 max-w-[64ch] text-[13px] text-gray-500">
              Hardest first, by the share of people who answered it correctly. A
              question nobody got is usually the question, not the class.
            </p>
          </div>
          <PerQuestion examId={exam.id} />
        </section>
      </div>
    </ConsoleShell>
  );
}
