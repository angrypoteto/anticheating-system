import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeFlag } from "@/lib/submission";
import { isCorrect, type QuestionType } from "@/lib/grading";
import { parseTimer } from "@/lib/exam-config";
import { RECORDING_BUCKET, parseSegmentName } from "@/lib/screen-recorder";
import { ConsoleShell } from "@/components/console-shell";
import { Card, Empty } from "@/app/admin/ui";
import { RecordingReview, type ReviewFlag, type ReviewSegment } from "./player";
import { AnswerReview, HandIn, type ReviewAnswer } from "./answers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sitting" };

/** Manila time, since that is where the paper was sat. */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Manila",
  });

/**
 * When an open sitting's time ran out, or null if the student still has time:
 * the earlier of its own timer and the exam closing, unless a teacher has given
 * this one sitting longer. The same rules gradeAndClose() applies.
 */
function timeRanOut(
  startedAt: string,
  totalMinutes: number,
  closesAt: string | null,
  reopenedUntil: string | null,
): Date | null {
  const now = Date.now();
  if (reopenedUntil && new Date(reopenedUntil).getTime() > now) return null;
  const ends = [
    totalMinutes > 0 ? new Date(startedAt).getTime() + totalMinutes * 60_000 : null,
    closesAt ? new Date(closesAt).getTime() : null,
  ].filter((t): t is number => t != null && t <= now);
  return ends.length ? new Date(Math.min(...ends)) : null;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Manila",
  });

/**
 * One student's sitting of one exam: what they answered, and what was seen.
 *
 * Two views of the same sitting. Answers is where marking is checked — every
 * question, the student's answer beside the key, and a teacher's mark that
 * overrules the key where the key got it wrong. Screen recording is the video
 * with its flags laid over it. Both answer the question a score cannot: is
 * this right?
 *
 * Everything is read through the teacher's own session. Sittings, answers, keys,
 * recordings and the video bucket all admit only whoever manages the exam, so a
 * page that loads here is a page this person may see.
 */
export default async function SittingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sessionId: string }>;
  searchParams: Promise<{ view?: string; from?: string }>;
}) {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const { id, sessionId } = await params;
  const query = await searchParams;
  const view = query.view === "recording" ? "recording" : "answers";
  // Back goes where the teacher came from: a student's list of papers, or the
  // exam's monitor. Carried in the address so switching tabs keeps it.
  const fromStudent = query.from === "student";
  const supabase = await createClient();

  const [{ data: exam }, { data: session }, { data: settings }] = await Promise.all([
    supabase.from("exams").select("id, title, timer_config, closes_at").eq("id", id).maybeSingle(),
    supabase
      .from("exam_sessions")
      .select("id, exam_id, student_id, status, started_at, submitted_at, score, reopened_until")
      .eq("id", sessionId)
      .eq("exam_id", id)
      .maybeSingle(),
    supabase.from("system_settings").select("pass_threshold").eq("id", true).maybeSingle(),
  ]);
  if (!exam || !session) notFound();

  // Named with the service role, as the monitor does: a student who arrived by
  // share link shares no class with the teacher, so their row is not readable
  // through RLS. Ownership of the sitting is established above.
  const { data: student } = await createAdminClient()
    .from("users")
    .select("full_name, email")
    .eq("id", session.student_id)
    .maybeSingle();
  const name = student?.full_name || student?.email || "Student";
  const passMark = Number(settings?.pass_threshold ?? 75);
  const live = session.status === "IN_PROGRESS";
  const ranOut = live
    ? timeRanOut(
        session.started_at,
        parseTimer(exam.timer_config).totalMinutes,
        exam.closes_at,
        session.reopened_until,
      )
    : null;

  const tab = (to: "answers" | "recording", label: string) => {
    const q = new URLSearchParams();
    if (to === "recording") q.set("view", "recording");
    if (fromStudent) q.set("from", "student");
    const suffix = q.size ? `?${q}` : "";
    return (
      <Link
        href={`/exams/${exam.id}/monitor/${session.id}${suffix}`}
        aria-current={view === to ? "page" : undefined}
        className={`inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium ${
          view === to ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <ConsoleShell role={me.role as string} email={me.email}>
      <div className="space-y-5">
        <div>
          <Link
            href={fromStudent ? `/students/${session.student_id}` : `/exams/${exam.id}/monitor`}
            className="text-[13px] text-gray-500 hover:text-gray-900"
          >
            {fromStudent ? `← ${name}'s exams and quizzes` : "← Back to the monitor"}
          </Link>
          <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
                <Link
                  href={`/students/${session.student_id}`}
                  className="hover:underline hover:underline-offset-4"
                >
                  {name}
                </Link>
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {exam.title}, started {day(session.started_at)} at {clock(session.started_at)}
                {live ? (ranOut ? ", never handed in" : ", still in progress") : ""}
              </p>
            </div>
            {session.score != null ? (
              <div className="sm:text-right">
                <p
                  className={`text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${
                    session.score >= passMark ? "text-gray-900" : "text-red-700"
                  }`}
                >
                  {session.score}%
                </p>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  {session.score >= passMark ? "Passed" : "Below the pass mark"} of {passMark}%
                </p>
              </div>
            ) : null}
          </header>
          <nav className="mt-4 flex gap-1.5" aria-label="Sitting">
            {tab("answers", "Answers")}
            {tab("recording", "Screen recording")}
          </nav>
        </div>

        {live ? (
          <HandIn
            examId={exam.id}
            sessionId={session.id}
            ranOutAt={ranOut ? `${clock(ranOut.toISOString())} on ${day(ranOut.toISOString())}` : null}
          />
        ) : null}

        {view === "answers" ? (
          <AnswersView examId={exam.id} sessionId={session.id} live={live} />
        ) : (
          <RecordingView examId={exam.id} sessionId={session.id} live={live} />
        )}
      </div>
    </ConsoleShell>
  );
}

/** Every question, the student's answer, the key, and the mark. */
async function AnswersView({
  examId,
  sessionId,
  live,
}: {
  examId: string;
  sessionId: string;
  live: boolean;
}) {
  const supabase = await createClient();
  const [{ data: questions }, { data: given }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, type, prompt, choices, question_answers(correct_answer)")
      .eq("exam_id", examId)
      .order("order"),
    supabase
      .from("answers")
      .select("question_id, response, marked_correct, marked_by_id, marked_at")
      .eq("session_id", sessionId),
  ]);

  const markers = [...new Set((given ?? []).map((a) => a.marked_by_id).filter(Boolean))] as string[];
  const { data: people } = markers.length
    ? await createAdminClient().from("users").select("id, full_name, email").in("id", markers)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));

  const byQuestion = new Map((given ?? []).map((a) => [a.question_id, a]));
  const rows: ReviewAnswer[] = (questions ?? []).map((q, i) => {
    const embed = q.question_answers as
      | { correct_answer: unknown }
      | { correct_answer: unknown }[]
      | null;
    const key = (Array.isArray(embed) ? embed[0] : embed)?.correct_answer;
    const a = byQuestion.get(q.id);
    const response = a == null ? null : typeof a.response === "string" ? a.response : JSON.stringify(a.response);
    return {
      questionId: q.id,
      n: i + 1,
      prompt: q.prompt,
      type: q.type as QuestionType,
      choices: (q.choices as string[] | null) ?? null,
      response,
      accepted: Array.isArray(key) ? key.map(String) : key == null ? [] : [String(key)],
      byKey: a != null && isCorrect(q.type as QuestionType, a.response, key),
      teacherMark: a?.marked_correct ?? null,
      markedBy: a?.marked_by_id ? (who.get(a.marked_by_id) ?? "A teacher") : null,
    };
  });

  if (!rows.length) {
    return (
      <Card title="Answers" flush>
        <Empty>This exam has no questions.</Empty>
      </Card>
    );
  }
  return <AnswerReview examId={examId} sessionId={sessionId} rows={rows} live={live} />;
}

/** The video, with the sitting's flags laid over it. */
async function RecordingView({
  examId,
  sessionId,
  live,
}: {
  examId: string;
  sessionId: string;
  live: boolean;
}) {
  const supabase = await createClient();
  const [{ data: flags }, { data: questions }, { data: recordings }, listing] = await Promise.all([
    supabase
      .from("flags")
      .select("id, type, strike_number, occurred_at, resolution, question_id, detail")
      .eq("session_id", sessionId)
      .order("occurred_at"),
    supabase.from("questions").select("id, prompt").eq("exam_id", examId).order("order"),
    supabase
      .from("screen_recordings")
      .select("id, started_at")
      .eq("session_id", sessionId)
      .order("started_at"),
    supabase.storage
      .from(RECORDING_BUCKET)
      .list(sessionId, { limit: 1000, sortBy: { column: "name", order: "asc" } }),
  ]);

  const startOf = new Map(
    (recordings ?? []).map((r) => [r.id, new Date(r.started_at).getTime()]),
  );

  // Each piece's place on the sitting's timeline, from its name and the
  // database-stamped start of the recording it belongs to.
  const pieces = (listing.data ?? [])
    .map((o) => ({ name: o.name, info: parseSegmentName(o.name) }))
    .filter((p): p is { name: string; info: NonNullable<typeof p.info> } =>
      Boolean(p.info && startOf.has(p.info.recordingId)),
    )
    .map((p) => ({
      path: `${sessionId}/${p.name}`,
      recordingId: p.info.recordingId,
      startMs: startOf.get(p.info.recordingId)! + p.info.offsetMs,
      durationMs: p.info.durationMs,
    }))
    .sort((a, b) => a.startMs - b.startMs);

  // Two hours is longer than any sitting takes to watch back.
  const { data: signed } = pieces.length
    ? await supabase.storage.from(RECORDING_BUCKET).createSignedUrls(
        pieces.map((p) => p.path),
        60 * 60 * 2,
      )
    : { data: [] as { path: string | null; signedUrl: string }[] };

  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const segments: ReviewSegment[] = pieces
    .filter((p) => urlFor.get(p.path))
    .map((p) => ({
      url: urlFor.get(p.path)!,
      recordingId: p.recordingId,
      startMs: p.startMs,
      durationMs: p.durationMs,
    }));

  const questionLabel = new Map(
    (questions ?? []).map((q, i) => [
      q.id,
      `Q${i + 1}: ${q.prompt.length > 60 ? q.prompt.slice(0, 60) + "…" : q.prompt}`,
    ]),
  );

  const reviewFlags: ReviewFlag[] = (flags ?? []).map((f) => ({
    id: f.id,
    what: describeFlag(f.type),
    atMs: new Date(f.occurred_at).getTime(),
    clock: clock(f.occurred_at),
    strike: f.strike_number,
    voided: f.resolution === "VOIDED",
    question: f.question_id ? (questionLabel.get(f.question_id) ?? null) : null,
    detail: f.detail ?? null,
    // Evidence for the teacher to judge, never counted as a warning.
    warning: f.type !== "EXTENSION_DETECTED",
  }));

  if (!segments.length) {
    return (
      <Card title="No recording" flush>
        <Empty>
          {live
            ? "Nothing has been uploaded yet. Pieces arrive every thirty seconds while the student is sharing, so check back in a moment."
            : "This sitting was not recorded. The exam may not have been set to record screens when it was sat."}
        </Empty>
      </Card>
    );
  }
  return <RecordingReview examId={examId} segments={segments} flags={reviewFlags} />;
}
