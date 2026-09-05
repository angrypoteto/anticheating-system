import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isCorrect, scorePercentage, type QuestionType } from "@/lib/grading";
import { parseTimer } from "@/lib/exam-config";
import type { SubmitReason } from "@/lib/submission";

export type GradeResult =
  | {
      ok: true;
      score: number;
      status: "SUBMITTED" | "AUTO_SUBMITTED";
      reason: SubmitReason;
    }
  | { ok: false; error: string };

/**
 * Grades a session and closes it. Uses the service role because the answer key is
 * unreadable to students by design — callers must verify authorisation first.
 *
 * Shared by the student's own submit and the instructor's force-submit so the two
 * paths can't score differently.
 */
export async function gradeAndClose(
  sessionId: string,
  reason: "manual" | "timeout" | "strikes" | "instructor",
): Promise<GradeResult> {
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("exam_sessions")
    .select("id, exam_id, status, started_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: "Session not found." };
  if (session.status !== "IN_PROGRESS") {
    return { ok: false, error: "Session is already closed." };
  }

  const [{ data: questions }, { data: answers }, { data: exam }] = await Promise.all([
    admin
      .from("questions")
      .select("id, type, question_answers(correct_answer)")
      .eq("exam_id", session.exam_id),
    admin.from("answers").select("question_id, response").eq("session_id", sessionId),
    admin.from("exams").select("timer_config, closes_at").eq("id", session.exam_id).single(),
  ]);

  const responses = new Map((answers ?? []).map((a) => [a.question_id, a.response]));

  let correct = 0;
  for (const q of questions ?? []) {
    const embed = q.question_answers as
      | { correct_answer: unknown }
      | { correct_answer: unknown }[]
      | null;
    const key = (Array.isArray(embed) ? embed[0] : embed)?.correct_answer;
    if (isCorrect(q.type as QuestionType, responses.get(q.id), key)) correct++;
  }

  const score = scorePercentage(correct, (questions ?? []).length);

  // The server clock decides whether time ran out, not the client's. Two things
  // can end a sitting: the student's own timer, and the exam closing under them.
  const timer = parseTimer(exam?.timer_config);
  const elapsedMinutes = (Date.now() - new Date(session.started_at).getTime()) / 60000;
  const pastTimer = timer.totalMinutes > 0 && elapsedMinutes > timer.totalMinutes;
  const pastClose = Boolean(exam?.closes_at) && Date.now() > new Date(exam!.closes_at).getTime();
  const ranOver = pastTimer || pastClose;

  const status =
    reason === "manual" && !ranOver ? "SUBMITTED" : "AUTO_SUBMITTED";

  // AUTO_SUBMITTED covers three quite different endings, and a student shown
  // only that cannot tell "you ran out of time" from "you were stopped for
  // leaving the window". The clock is asked first because a paper that was going
  // to end anyway was not ended by anything the student did.
  const stored: SubmitReason =
    reason === "instructor"
      ? "INSTRUCTOR"
      : pastClose
        ? "EXAM_CLOSED"
        : pastTimer || reason === "timeout"
          ? "TIME_UP"
          : reason === "strikes"
            ? "STRIKES"
            : "MANUAL";

  // The status guard makes a double submit a no-op rather than a re-grade.
  const { error } = await admin
    .from("exam_sessions")
    .update({
      status,
      score,
      submitted_reason: stored,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("status", "IN_PROGRESS");

  if (error) return { ok: false, error: error.message };
  return { ok: true, score, status, reason: stored };
}
