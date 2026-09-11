import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeFlag } from "@/lib/submission";
import { RECORDING_BUCKET, parseSegmentName } from "@/lib/screen-recorder";
import { ConsoleShell } from "@/components/console-shell";
import { Card, Empty } from "@/app/admin/ui";
import { RecordingReview, type ReviewFlag, type ReviewSegment } from "./player";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Screen recording" };

/** Manila time, since that is where the paper was sat. */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Manila",
  });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Manila",
  });

/**
 * One student's sitting, as a video with its flags laid over it.
 *
 * The question this page exists to answer is the one a flag cannot: was that
 * departure cheating? Every flag is a marker on the timeline and a line in the
 * list with a way to jump to it, and the Void a teacher would press on the
 * monitor is here too, next to the evidence it should be decided on.
 *
 * Everything is read through the teacher's own session. The recordings table
 * and the Storage bucket both admit only whoever manages the exam, so a page
 * that loads here is a page this person may see.
 */
export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const { id, sessionId } = await params;
  const supabase = await createClient();

  const [{ data: exam }, { data: session }] = await Promise.all([
    supabase.from("exams").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("exam_sessions")
      .select("id, exam_id, student_id, status, started_at, submitted_at")
      .eq("id", sessionId)
      .eq("exam_id", id)
      .maybeSingle(),
  ]);
  if (!exam || !session) notFound();

  const [{ data: student }, { data: flags }, { data: questions }, { data: recordings }, listing] =
    await Promise.all([
      // Named with the service role, as the monitor does: a student who arrived
      // by share link shares no class with the teacher, so their row is not
      // readable through RLS. Ownership of the sitting is established above.
      createAdminClient()
        .from("users")
        .select("full_name, email")
        .eq("id", session.student_id)
        .maybeSingle(),
      supabase
        .from("flags")
        .select("id, type, strike_number, occurred_at, resolution, question_id, detail")
        .eq("session_id", sessionId)
        .order("occurred_at"),
      supabase.from("questions").select("id, prompt").eq("exam_id", id).order("order"),
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
    ? await supabase.storage
        .from(RECORDING_BUCKET)
        .createSignedUrls(
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

  const name = student?.full_name || student?.email || "Student";

  return (
    <ConsoleShell role={me.role as string} email={me.email}>
      <div className="space-y-5">
        <div>
          <Link
            href={`/exams/${exam.id}/monitor`}
            className="text-[13px] text-gray-500 hover:text-gray-900"
          >
            ← Back to the monitor
          </Link>
          <header className="mt-3">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
              {name}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {exam.title}, started {day(session.started_at)} at {clock(session.started_at)}
              {session.status === "IN_PROGRESS" ? ", still in progress" : ""}
            </p>
          </header>
        </div>

        {segments.length ? (
          <RecordingReview examId={exam.id} segments={segments} flags={reviewFlags} />
        ) : (
          <Card title="No recording" flush>
            <Empty>
              {session.status === "IN_PROGRESS"
                ? "Nothing has been uploaded yet. Pieces arrive every thirty seconds while the student is sharing, so check back in a moment."
                : "This sitting was not recorded. The exam may not have been set to record screens when it was sat."}
            </Empty>
          </Card>
        )}
      </div>
    </ConsoleShell>
  );
}
