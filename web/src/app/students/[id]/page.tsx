import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEnrolment } from "@/lib/enrolment";
import { parseReason, type SubmitReason } from "@/lib/submission";
import { ConsoleShell } from "@/components/console-shell";
import { Card, Empty, Stat, Stats } from "@/app/admin/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Student" };

/** Manila time, since that is where the exams are sat. */
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });

const ENDED: Record<SubmitReason, string> = {
  MANUAL: "Handed in",
  TIME_UP: "Time ran out",
  EXAM_CLOSED: "Exam closed",
  STRIKES: "Warnings ran out",
  INSTRUCTOR: "Ended by a teacher",
};

type Sitting = {
  id: string;
  exam_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  submitted_reason: string | null;
  exams: { title: string; subjects: { name: string } | { name: string }[] | null } | null;
};

/**
 * One student, and every exam and quiz of yours they have sat.
 *
 * The score beside each, how it ended, the warnings it carries, and how many
 * of its marks a teacher has changed — with the way into the paper itself,
 * where every answer can be checked against the key and marked by hand.
 *
 * Read through the viewer's own session, so a teacher sees the sittings of the
 * exams they manage and nothing else, and an administrator sees them all.
 */
export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: sittingRows }, { data: settings }, { data: readable }, enrolment] = await Promise.all([
    supabase
      .from("exam_sessions")
      .select("id, exam_id, status, started_at, submitted_at, score, submitted_reason, exams(title, subjects(name))")
      .eq("student_id", id)
      .order("started_at", { ascending: false }),
    supabase.from("system_settings").select("pass_threshold").eq("id", true).maybeSingle(),
    supabase.from("users").select("id, full_name, email, role").eq("id", id).maybeSingle(),
    loadEnrolment(supabase),
  ]);
  const sittings = (sittingRows ?? []) as unknown as Sitting[];

  // A student who reached a paper by its share link is in none of the
  // teacher's classes, so their row is not readable through RLS — but a sitting
  // of the teacher's own exam is reason enough to know their name.
  let student = readable;
  if (!student && sittings.length) {
    const { data } = await createAdminClient()
      .from("users")
      .select("id, full_name, email, role")
      .eq("id", id)
      .maybeSingle();
    student = data;
  }
  if (!student || student.role !== "STUDENT") notFound();

  const ids = sittings.map((s) => s.id);
  const [{ data: flags }, { data: changed }] = ids.length
    ? await Promise.all([
        supabase
          .from("flags")
          .select("session_id, strike_number, type, resolution")
          .in("session_id", ids)
          .is("resolution", null),
        supabase
          .from("answers")
          .select("session_id")
          .in("session_id", ids)
          .not("marked_correct", "is", null),
      ])
    : [{ data: [] }, { data: [] }];

  // Warnings are strikes, not signals: one departure raises several.
  const warnings = new Map<string, Set<number>>();
  for (const f of (flags ?? []) as { session_id: string; strike_number: number; type: string }[]) {
    if (f.type === "EXTENSION_DETECTED") continue;
    const set = warnings.get(f.session_id) ?? new Set<number>();
    set.add(f.strike_number);
    warnings.set(f.session_id, set);
  }
  const marksChanged = new Map<string, number>();
  for (const a of (changed ?? []) as { session_id: string }[]) {
    marksChanged.set(a.session_id, (marksChanged.get(a.session_id) ?? 0) + 1);
  }

  const passMark = Number(settings?.pass_threshold ?? 75);
  const handedIn = sittings.filter((s) => s.status !== "IN_PROGRESS" && s.score != null);
  const average = handedIn.length
    ? Math.round(handedIn.reduce((t, s) => t + (s.score ?? 0), 0) / handedIn.length)
    : null;
  const passed = handedIn.filter((s) => (s.score ?? 0) >= passMark).length;
  const totalWarnings = [...warnings.values()].reduce((t, s) => t + s.size, 0);
  const classes = enrolment.labelsFor(id);
  const back = me.role === "ADMIN" ? "/admin/students" : "/teacher/students";

  return (
    <ConsoleShell role={me.role as string} email={me.email}>
      <div className="space-y-5">
        <div>
          <Link href={back} className="text-[13px] text-gray-500 hover:text-gray-900">
            ← Students &amp; risk
          </Link>
          <header className="mt-3">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
              {student.full_name || student.email}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {student.full_name ? student.email : null}
              {student.full_name && classes.length ? ", " : null}
              {classes.join(", ")}
            </p>
          </header>
        </div>

        <Stats>
          <Stat
            label="Exams and quizzes taken"
            value={String(handedIn.length)}
            note={
              sittings.length > handedIn.length
                ? `${sittings.length - handedIn.length} still in progress`
                : me.role === "ADMIN"
                  ? "Across the school"
                  : "Of yours"
            }
          />
          <Stat
            label="Average score"
            value={average == null ? "—" : `${average}%`}
            tone={average != null && average < passMark ? "bad" : "plain"}
            note={`Pass mark ${passMark}%`}
          />
          <Stat
            label="Passed"
            value={handedIn.length ? `${passed} of ${handedIn.length}` : "—"}
          />
          <Stat
            label="Warnings"
            value={String(totalWarnings)}
            tone={totalWarnings ? "warn" : "plain"}
            note="Still standing, across every sitting"
          />
        </Stats>

        <Card title="Exams and quizzes" hint="Newest first. Open one to check every answer and change a mark." flush>
          {sittings.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13.5px]">
                <thead className="text-[12.5px] text-gray-400">
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-2.5 font-medium">Exam</th>
                    <th className="px-3 py-2.5 font-medium">Taken</th>
                    <th className="px-3 py-2.5 font-medium">Score</th>
                    <th className="px-3 py-2.5 font-medium">How it ended</th>
                    <th className="px-3 py-2.5 font-medium">Warnings</th>
                    <th className="px-5 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {sittings.map((s) => {
                    const subjectEmbed = s.exams?.subjects;
                    const subject = (Array.isArray(subjectEmbed) ? subjectEmbed[0] : subjectEmbed)?.name;
                    const reason = parseReason(s.submitted_reason);
                    const w = warnings.get(s.id)?.size ?? 0;
                    const edits = marksChanged.get(s.id) ?? 0;
                    const live = s.status === "IN_PROGRESS";
                    return (
                      <tr key={s.id} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-5 py-3">
                          <span className="block font-medium text-gray-900">{s.exams?.title ?? "An exam"}</span>
                          {subject ? <span className="block text-[12.5px] text-gray-400">{subject}</span> : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap tabular-nums text-gray-500">
                          {when(s.submitted_at ?? s.started_at)}
                        </td>
                        <td className="px-3 py-3">
                          {s.score == null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <span
                                className={`font-semibold tabular-nums ${
                                  s.score >= passMark ? "text-gray-900" : "text-red-700"
                                }`}
                              >
                                {s.score}%
                              </span>
                              <span
                                className={`inline-flex h-5.5 items-center rounded-full px-2 text-[12px] font-semibold ${
                                  s.score >= passMark ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                                }`}
                              >
                                {s.score >= passMark ? "Passed" : "Did not pass"}
                              </span>
                            </span>
                          )}
                          {edits ? (
                            <span className="mt-0.5 block text-[12px] text-gray-400">
                              {edits} {edits === 1 ? "mark" : "marks"} changed by a teacher
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {live ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                              Sitting now
                            </span>
                          ) : reason ? (
                            ENDED[reason]
                          ) : (
                            "Handed in"
                          )}
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {w ? <span className="font-semibold text-amber-800">{w}</span> : <span className="text-gray-400">None</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/exams/${s.exam_id}/monitor/${s.id}?from=student`}
                            className="inline-flex h-8 items-center rounded-lg bg-gray-900 px-3 text-[13px] font-medium whitespace-nowrap text-white hover:bg-gray-700"
                          >
                            Review answers
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              {me.role === "ADMIN"
                ? "This student has not sat an exam or quiz yet."
                : "This student has not sat any of your exams or quizzes yet."}
            </Empty>
          )}
        </Card>
      </div>
    </ConsoleShell>
  );
}
