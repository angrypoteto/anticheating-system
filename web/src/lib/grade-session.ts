import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { counts, scorePercentage, type QuestionType } from "@/lib/grading";
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
    .select("id, exam_id, status, started_at, reopened_until")
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
    admin
      .from("answers")
      .select("question_id, response, marked_correct")
      .eq("session_id", sessionId),
    admin.from("exams").select("timer_config, closes_at").eq("id", session.exam_id).single(),
  ]);

  // A sitting reopened and handed in again keeps any mark its teacher set.
  const { score } = tally(questions ?? [], answers ?? []);

  // The server clock decides whether time ran out, not the client's. Two things
  // can end a sitting: the student's own timer, and the exam closing under them.
  const timer = parseTimer(exam?.timer_config);
  const elapsedMinutes = (Date.now() - new Date(session.started_at).getTime()) / 60000;
  const pastTimer = timer.totalMinutes > 0 && elapsedMinutes > timer.totalMinutes;
  // A student working under an allowance is not working past the close: the
  // exam shut for the class, and this sitting was deliberately left open. Saying
  // "the exam closed while you were working" to somebody who was given the time
  // would be blaming them for their teacher's kindness.
  const excused =
    Boolean(session.reopened_until) && Date.now() < new Date(session.reopened_until!).getTime();
  const pastClose =
    !excused && Boolean(exam?.closes_at) && Date.now() > new Date(exam!.closes_at).getTime();
  const ranOver = pastTimer || pastClose;

  const status =
    reason === "manual" && !ranOver ? "SUBMITTED" : "AUTO_SUBMITTED";

  // AUTO_SUBMITTED covers three quite different endings, and a student shown
  // only that cannot tell "you ran out of time" from "you were stopped for
  // leaving the window". The clock is asked first because a paper that was going
  // to end anyway was not ended by anything the student did.
  //
  // A teacher handing in a paper whose time had already run out — a student
  // who closed the browser and never came back — did not end it; the clock
  // did, and that is what the student and their record should be told.
  const stored: SubmitReason =
    reason === "instructor" && !ranOver
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

type QuestionRow = { id: string; type: string; question_answers: unknown };
type AnswerRow = { question_id: string; response: unknown; marked_correct: boolean | null };

/** How many answers count, and the score that makes — key and teacher's marks together. */
function tally(questions: QuestionRow[], answers: AnswerRow[]) {
  const given = new Map(answers.map((a) => [a.question_id, a]));
  let correct = 0;
  for (const q of questions) {
    const embed = q.question_answers as
      | { correct_answer: unknown }
      | { correct_answer: unknown }[]
      | null;
    const key = (Array.isArray(embed) ? embed[0] : embed)?.correct_answer;
    const a = given.get(q.id);
    if (a && counts(q.type as QuestionType, a.response, key, a.marked_correct)) correct++;
  }
  return { correct, total: questions.length, score: scorePercentage(correct, questions.length) };
}

/**
 * Score a handed-in paper again, after a teacher changes a mark.
 *
 * Service role, like gradeAndClose: callers must have established that the
 * person asking may manage the exam (mark_answer() does, in the database).
 * Leaves a sitting still in progress alone — it is scored when it ends.
 */
export async function rescoreSession(
  sessionId: string,
): Promise<{ ok: true; score: number; correct: number; total: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("exam_sessions")
    .select("id, exam_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Session not found." };
  if (session.status === "IN_PROGRESS") return { ok: false, error: "This paper is still being sat." };

  const [{ data: questions }, { data: answers }] = await Promise.all([
    admin
      .from("questions")
      .select("id, type, question_answers(correct_answer)")
      .eq("exam_id", session.exam_id),
    admin
      .from("answers")
      .select("question_id, response, marked_correct")
      .eq("session_id", sessionId),
  ]);

  const result = tally(questions ?? [], answers ?? []);
  const { error } = await admin
    .from("exam_sessions")
    .update({ score: result.score })
    .eq("id", sessionId)
    .neq("status", "IN_PROGRESS");
  if (error) return { ok: false, error: error.message };
  return { ok: true, ...result };
}
